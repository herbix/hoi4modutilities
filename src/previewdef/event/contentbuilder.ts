import * as vscode from 'vscode';
import { EventsLoader, EventsLoaderResult } from './loader';
import { LoaderSession } from '../../util/loader/loader';
import { debug } from '../../util/debug';
import { html, htmlEscape } from '../../util/html';
import { localize } from '../../util/i18n';
import { StyleTable, normalizeForStyle } from '../../util/styletable';
import { ChildEvent, HOIEvent, HOIEventType } from './schema';
import { flatten, repeat, max, chain } from 'lodash';
import { arrayToMap, forceError } from '../../util/common';
import { HOIPartial, toNumberLike, toStringAsSymbolIgnoreCase } from '../../hoiformat/schema';
import { GridBoxType } from '../../hoiformat/gui';
import { renderGridBox, GridBoxItem, GridBoxConnection } from '../../util/hoi4gui/gridbox';
import { Token } from '../../hoiformat/hoiparser';
import { getSpriteByGfxName } from '../../util/image/imagecache';
import { featureFlagsAsScript } from "../../util/featureflags";
import { indexManager } from '../../indexing/indexmanager';
import { localisationIndex } from '../../indexing/localisationindex';

export async function renderEventFile(loader: EventsLoader, uri: vscode.Uri, webview: vscode.Webview): Promise<string> {
    const setPreviewFileUriScript = { content: `window.previewedFileUri = "${uri.toString()}";` };
    
    try {
        const session = new LoaderSession(false);
        const loadResult = await loader.load(session);
        const loadedLoaders = Array.from((session as any).loadedLoader).map<string>(v => (v as any).toString());
        debug('Loader session event tree', loadedLoaders);

        const styleTable = new StyleTable();
        const jsCodes: string[] = [];
        const baseContent = await renderEvents(loadResult.result, styleTable, jsCodes);

        return html(
            webview,
            baseContent,
            [
                setPreviewFileUriScript,
                { content: featureFlagsAsScript() },
                ...jsCodes.map(c => ({ content: c })),
                'common.js',
                'eventtree.js',
            ],
            [
                'codicon.css',
                styleTable
            ],
        );

    } catch (e) {
        const baseContent = `${localize('error', 'Error')}: <br/>  <pre>${htmlEscape(forceError(e).toString())}</pre>`;
        return html(webview, baseContent, [ setPreviewFileUriScript ], []);
    }

}

const leftPaddingBase = 50;
const topPaddingBase = 50;
const xGridSize = 180;
const yGridSize = 150;

async function renderEvents(eventsLoaderResult: EventsLoaderResult, styleTable: StyleTable, jsCodes: string[]): Promise<string> {
    const leftPadding = leftPaddingBase;
    const topPadding = topPaddingBase;

    const gridBox: HOIPartial<GridBoxType> = {
        position: { x: toNumberLike(leftPadding), y: toNumberLike(topPadding) },
        format: toStringAsSymbolIgnoreCase('up'),
        size: { width: toNumberLike(xGridSize), height: undefined },
        slotsize: { width: toNumberLike(xGridSize), height: toNumberLike(yGridSize) },
    } as HOIPartial<GridBoxType>;
    
    const eventIdToEvent = arrayToMap(flatten(Object.values(eventsLoaderResult.events.eventItemsByNamespace)), 'id');
    const eventNodes = eventsToNodes(eventIdToEvent, eventsLoaderResult.mainNamespaces);
    const idToContentMap: Record<string, string> = {};
    const gridBoxItems = await eventNodesToGridBoxItems(eventNodes, idToContentMap, eventsLoaderResult.gfxFiles, styleTable);

    const renderedGridBox = await renderGridBox(gridBox, {
        size: { width: 0, height: 0 },
        orientation: 'upper_left'
    }, {
        styleTable,
        items: arrayToMap(gridBoxItems, 'id'),
        onRenderItem: async (item) => idToContentMap[item.id],
        cornerPosition: 0.5,
        virtualization: true,
        onOutputVirtualizationData: (data) => {
            jsCodes.push(`window.virtualizationData = ${JSON.stringify(data)};`);
        },
    });

    return `
        <div id="dragger" additionalDraggerHostId="eventtreecontent" class="${styleTable.oneTimeStyle('dragger', () => `
            width: 100vw;
            height: 100vh;
            position: fixed;
            left:0;
            top:0;
        `)}"></div>
        <div id="eventtreecontent" class="${styleTable.oneTimeStyle('eventtreecontent', () => `
            left: -20px;
            position: relative;
        `)}">
            ${renderedGridBox}
        </div>
    `;
}

interface EventNode {
    type: 'event';
    event: HOIEvent | string;
    loop: boolean;
    children: (EventNode | OptionNode)[];
    relatedNamespace: string[];
    token: Token | undefined;
    parents: EventNode[];
    toScope: string;
    days?: number;
    hours?: number;
    randomDays?: number;
    randomHours?: number;
}

interface OptionNode {
    type: 'option';
    optionName: string;
    children: EventNode[];
    file: string;
    token: Token | undefined;
    parent: EventNode | undefined;
}

function eventsToNodes(eventIdToEvent: Record<string, HOIEvent>, mainNamespaces: string[]): EventNode[] {
    const eventNodeCache: Record<string, EventNode> = {};
    const eventStack: HOIEvent[] = [];

    for (const event of Object.values(eventIdToEvent)) {
        eventToNode(event, eventIdToEvent, eventStack, eventNodeCache);
    }

    let result: EventNode[] = Object.values(eventNodeCache);
    let updated = true;
    while (updated) {
        updated = false;
        const cacheValues = result;
        result = [];
        for (const node of cacheValues) {
            // Remove duplicate: a node mustn't be root if it there's a same event has parents.
            // Remove unrelated: a node mustn't be root if it doesn't have any related namespace in mainNamespaces.
            if (node.parents.length === 0 &&
                (node.relatedNamespace.every(n => !mainNamespaces.includes(n) || cacheValues.some(n => n.event === node.event && n.parents.length > 0)))) {
                for (const child of node.children) {
                    if (child.type === 'event') {
                        child.parents = child.parents.filter(p => p !== node);
                    } else {
                        for (const grandchild of child.children) {
                            grandchild.parents = grandchild.parents.filter(p => p !== node);
                        }
                    }
                }
                updated = true;
                continue;
            }
            result.push(node);
        }
    }

    return result;
}

function eventToNode(
    event: HOIEvent,
    eventIdToEvent: Record<string, HOIEvent>,
    eventStack: HOIEvent[],
    eventNodeCache: Record<string, EventNode>,
    eventEdge?: ChildEvent,
): EventNode {
    const cacheKey = event.id + (eventEdge ? `:${eventEdge.scopeName}:${eventEdge.days}:${eventEdge.hours}:${eventEdge.randomDays}:${eventEdge.randomHours}` : '');
    const cachedNode = eventNodeCache[cacheKey];
    if (cachedNode) {
        return cachedNode;
    }

    eventStack.push(event);
    const eventNode: EventNode = {
        type: 'event',
        event,
        children: [],
        relatedNamespace: [event.namespace],
        token: event.token,
        loop: false,
        parents: [],
        toScope: eventEdge?.scopeName ?? 'EVENT_TARGET',
        days: eventEdge?.days,
        hours: eventEdge?.hours,
        randomDays: eventEdge?.randomDays,
        randomHours: eventEdge?.randomHours,
    };
    eventNodeCache[cacheKey] = eventNode;

    for (const option of [event.immediate, ...event.options]) {
        const isImmediate = !option.name;
        const optionNode: OptionNode = {
            type: 'option',
            optionName: option.name ?? ':immediate',
            children: [],
            file: event.file,
            token: option.token,
            parent: eventNode,
        };
        if (!isImmediate) {
            eventNode.children.push(optionNode);
        }

        for (const childEvent of option.childEvents) {
            const childEventItem = eventIdToEvent[childEvent.eventName];

            let toNode: EventNode;
            if (!childEventItem) {
                toNode = {
                    type: 'event',
                    event: childEvent.eventName,
                    children: [],
                    relatedNamespace: [event.namespace],
                    token: undefined,
                    parents: [],
                    loop: false,
                    toScope: childEvent.scopeName,
                    days: childEvent.days,
                    hours: childEvent.hours,
                    randomDays: childEvent.randomDays,
                    randomHours: childEvent.randomHours,
                };
            } else if (eventStack.includes(childEventItem)) {
                toNode = eventToNode(childEventItem, eventIdToEvent, eventStack, eventNodeCache, childEvent);
                toNode = {
                    ...toNode,
                    parents: [...toNode.parents],
                    children: [],
                    loop: true,
                };
            } else {
                toNode = eventToNode(childEventItem, eventIdToEvent, eventStack, eventNodeCache, childEvent);
                toNode.relatedNamespace.forEach(n => {
                    if (!eventNode.relatedNamespace.includes(n)) {
                        eventNode.relatedNamespace.push(n);
                    }
                });
            }

            if (typeof toNode === 'object') {
                toNode.parents.push(eventNode);
            }
            
            if (isImmediate) {
                eventNode.children.push(toNode);
            } else {
                optionNode.children.push(toNode);
            }
        }
    }

    eventStack.pop();
    return eventNode;
}

interface GridBoxTree {
    id: string;
    items: GridBoxItem[];
    ranges: { start: number; end: number }[];
    defaultRange?: { start: number; end: number };
    entryNode?: EventNode | OptionNode;
    outputNodes: GridBoxTreeOutputNode[];
}

interface GridBoxTreeOutputNode {
    node: EventNode;
    fromItem: GridBoxItem;
    x: number;
}

async function eventNodesToGridBoxItems(
    nodes: EventNode[],
    idToContentMap: Record<string, string>,
    gfxFiles: string[],
    styleTable: StyleTable
): Promise<GridBoxItem[]> {
    const idContainer = { id: 0 };
    const entryNodes = findEntryNodes(nodes);
    const treeMap = new Map<EventNode, GridBoxTree>();

    for (const entryNode of entryNodes) {
        const scopeContext: ScopeContext = {
            fromStack: [],
            currentScopeName: entryNode.toScope ?? 'EVENT_TARGET',
        };
        const tree = await eventNodeToGridBoxTree(entryNode, entryNodes, idToContentMap, scopeContext, gfxFiles, styleTable, idContainer);
        treeMap.set(entryNode, tree);
    }

    const subGraphs = findSubGraphs(entryNodes, treeMap);

    const resultTree: GridBoxTree = {
        id: '',
        items: [],
        ranges: [],
        outputNodes: [],
    };
    let resultWidth = 0;
    let intermediateItemIndex = 0;
    for (const subGraph of subGraphs) {
        const parentCountMap = new Map<EventNode, number>();
        const queue: { entryNode: EventNode; depth: number; }[] = [];
        for (const entryNode of subGraph) {
            parentCountMap.set(entryNode, entryNode.parents.length);
            if (entryNode.parents.length === 0) {
                queue.push({ entryNode, depth: 0 });
            }
        }

        const beginResultWidth = resultWidth;
        let currentDepth = 0;
        let yOffset = 0;
        let parentYOffset = 0;
        let nextDepthLinks: number[] = [];
        while (queue.length > 0) {
            const { entryNode, depth } = queue[0];
            if (depth !== currentDepth) {
                resultWidth = max([resultWidth, ...resultTree.ranges.map(r => r.end), ...(resultTree.defaultRange ? [resultTree.defaultRange.end] : [])]) ?? 0;
                currentDepth = depth;
                resultTree.defaultRange = { start: 0, end: beginResultWidth };
                yOffset = resultTree.ranges.length + queue.length - 1;
                parentYOffset = resultTree.ranges.length - 1;
                nextDepthLinks = resultTree.outputNodes.filter(o => queue.every(q => q.entryNode !== o.node)).map(o => o.x).sort();
                // resultTree.defaultRange.end = (max([beginResultWidth - 1, ...nextDepthLinks]) ?? beginResultWidth - 1) + 1;
            }

            queue.shift();

            const tree = treeMap.get(entryNode)!;
            appendChildToTree(resultTree, tree, yOffset);

            const relatedOutputNodes = resultTree.outputNodes.filter(o => o.node === entryNode);
            // Remove fullfilled output nodes
            resultTree.outputNodes = resultTree.outputNodes.filter(o => o.node !== entryNode);
            for (const parentOutput of relatedOutputNodes) {
                let itemId: string;
                if (parentOutput.fromItem.gridX === parentOutput.x && parentOutput.fromItem.gridY === parentYOffset) {
                    itemId = tree.id;
                } else {
                    const intermediateItem: GridBoxItem = {
                        id: 'intermediate:' + (intermediateItemIndex++),
                        gridX: parentOutput.x,
                        gridY: parentYOffset,
                        connections: [{
                            target: tree.id,
                            targetType: 'child',
                            style: '1px solid #88aaff'
                        }],
                    };
                    idToContentMap[intermediateItem.id] = `${intermediateItem.id} (${intermediateItem.gridX}, ${intermediateItem.gridY})`;
                    resultTree.items.push(intermediateItem);
                    itemId = intermediateItem.id;
                }
                parentOutput.fromItem.connections.push({
                    target: itemId,
                    targetType: 'child',
                    style: '1px solid #88aaff'
                });
            }
            parentYOffset++;

            for (const { node: outputNode } of tree.outputNodes) {
                const count = parentCountMap.get(outputNode) ?? 0;
                if (count > 0) {
                    parentCountMap.set(outputNode, count - 1);
                    if (count === 1) {
                        queue.push({ entryNode: outputNode, depth: depth + 1 });
                    }
                }
            }
        }

        resultWidth = max([resultWidth, ...resultTree.ranges.map(r => r.end), ...(resultTree.defaultRange ? [resultTree.defaultRange.end] : [])]) ?? 0;
        resultTree.defaultRange = { start: 0, end: resultWidth };
        resultTree.ranges = [];
    }

    return resultTree.items;
}

function findEntryNodes(nodes: EventNode[]): Set<EventNode> {
    const entryNodes = new Set(nodes.filter(node => node.parents.length !== 1));

    let deletedAnyNode = true;
    while (deletedAnyNode) {
        deletedAnyNode = false;
        for (const eventNode of [...entryNodes]) {
            if (eventNode.parents.length === 0) {
                continue;
            }

            if (eventNode.toScope.match(/^from(?:\.from)*$/) ||
                eventNode.toScope.includes('{event_target}') ||
                !verifyEntryNode(eventNode, entryNodes, { fromStack: [], currentScopeName: eventNode.toScope })) {
                entryNodes.delete(eventNode);
                deletedAnyNode = true;
            }
        }
    }

    return entryNodes;
}

function verifyEntryNode(node: EventNode, entryNodes: Set<EventNode>, scopeContext: ScopeContext): boolean {
    for (const child of node.children.flatMap(c => c.type === 'option' ? c.children : [c])) {
        if (entryNodes.has(child)) {
            continue;
        }
        const nextScopeContext = nextScope(scopeContext, child.toScope);
        if (nextScopeContext.currentScopeName.endsWith('.FROM')) {
            return false;
        }
        if (!verifyEntryNode(child, entryNodes, nextScopeContext)) {
            return false;
        }
    }
    return true;
}

function findSubGraphs(entryNodes: Set<EventNode>, treeMap: Map<EventNode, GridBoxTree>): Set<EventNode>[] {
    const parentEntryNodeMap = new Map<EventNode, Set<EventNode>>();
    for (const entryNode of entryNodes) {
        for (const { node: outputNode } of treeMap.get(entryNode)!.outputNodes) {
            let parentEntryNodes = parentEntryNodeMap.get(outputNode);
            if (!parentEntryNodes) {
                parentEntryNodes = new Set();
                parentEntryNodeMap.set(outputNode, parentEntryNodes);
            }
            parentEntryNodes.add(entryNode);
        }
    }
    
    const visited = new Set<EventNode>();
    const result: Set<EventNode>[] = [];
    for (const entryNode of entryNodes) {
        if (visited.has(entryNode)) {
            continue;
        }
        const subGraph = new Set<EventNode>();
        const stack = [entryNode];
        while (stack.length > 0) {
            const node = stack.pop()!;
            if (visited.has(node)) {
                continue;
            }
            visited.add(node);
            subGraph.add(node);
            const parentEntryNodes = parentEntryNodeMap.get(node);
            if (parentEntryNodes) {
                for (const parentEntryNode of parentEntryNodes) {
                    stack.push(parentEntryNode);
                }
            }
            for (const { node: outputNode } of treeMap.get(node)!.outputNodes) {
                stack.push(outputNode);
            }
        }
        result.push(subGraph);
    }

    return result;
}

async function eventNodeToGridBoxTree(
    node: EventNode | OptionNode,
    entryNodes: Set<EventNode>,
    idToContentMap: Record<string, string>,
    scopeContext: ScopeContext,
    gfxFiles: string[],
    styleTable: StyleTable,
    idContainer: { id: number },
): Promise<GridBoxTree> {
    const result: GridBoxTree = {
        id: '',
        items: [],
        ranges: [{ start: 0, end: 0 }],
        entryNode: node,
        outputNodes: [],
    };
    const item: GridBoxItem = { id: '', gridX: 0, gridY: 0, connections: [] };
    const childIds: string[] = [];
    for (const child of node.children) {
        let tree: GridBoxTree;
        if (child.type === 'event') {
            if (entryNodes.has(child)) {
                appendOutputNodeToTree(result, item, child, 1);
                continue;
            }
            const nextScopeContext = nextScope(scopeContext, child.toScope);
            tree = await eventNodeToGridBoxTree(child, entryNodes, idToContentMap, nextScopeContext, gfxFiles, styleTable, idContainer);
        } else {
            tree = await eventNodeToGridBoxTree(child, entryNodes, idToContentMap, scopeContext, gfxFiles, styleTable, idContainer);
        }
        childIds.push(tree.id);
        appendChildToTree(result, tree, 1, true);
    }

    const isOption = node.type === 'option';
    const id = (isOption ? node.optionName : (typeof node.event === 'object' ? node.event.id : node.event)) + ':' + (idContainer.id++);
    if (isOption) {
        idToContentMap[id] = await makeOptionNode(node as OptionNode, styleTable);
    } else {
        idToContentMap[id] = await makeEventNode(scopeContext.currentScopeName,
            typeof node === 'object' ? node as EventNode : node, gfxFiles, styleTable);
    }

    const x = result.ranges.length < 2 ? 0 : Math.floor((result.ranges[1].end + result.ranges[1].start - 1) / 2);
    result.id = id;
    item.id = id;
    item.gridX = x;
    item.connections = childIds.map<GridBoxConnection>(id => ({
        target: id,
        targetType: 'child',
        style: '1px solid #88aaff'
    }));
    result.items.push(item);

    if (result.ranges[0].start === result.ranges[0].end) {
        result.ranges[0].start = x;
        result.ranges[0].end = x + 1;
    } else {
        result.ranges[0].start = Math.min(x, result.ranges[0].start ?? 0);
        result.ranges[0].end = Math.max(x + 1, result.ranges[0].end ?? 0);
    }

    // DEBUG
    // idToContentMap[id] += JSON.stringify(result.ranges) + "<br/>" + JSON.stringify(result.defaultRange);

    return result;
}

interface ScopeContext {
    fromStack: string[];
    currentScopeName: string;
}

function nextScope(scopeContext: ScopeContext, toScope: string): ScopeContext {
    let currentScopeName: string;
    if (toScope.match(/^from(?:\.from)*$/)) {
        const fromCount = toScope.split('.').length;
        const fromIndex = scopeContext.fromStack.length - fromCount;
        if (fromIndex < 0) {
            currentScopeName = (scopeContext.fromStack.length > 0 ? scopeContext.fromStack[0] : scopeContext.currentScopeName) +
                repeat('.FROM', -fromIndex);
        } else {
            currentScopeName = scopeContext.fromStack[fromIndex];
        }
    } else {
        currentScopeName = toScope.replace(/\{event_target\}/g, scopeContext.currentScopeName);
    }

    return {
        fromStack: [ ...scopeContext.fromStack, scopeContext.currentScopeName ],
        currentScopeName,
    };
}

const typeToIcon: Record<HOIEventType, string> = {
    state: 'location',
    country: 'globe',
    unit_leader: 'account',
    news: 'note',
    operative_leader: 'device-camera',
};

const flagIcons: string[] = [
    'eye-closed',
    'sync-ignored',
    'broadcast',
    'refresh',
];

async function makeEventNode(scope: string, eventNode: EventNode, gfxFiles: string[], styleTable: StyleTable): Promise<string> {
    const delayText = makeDelayString(eventNode.days, eventNode.hours, eventNode.randomDays, eventNode.randomHours);
    if (typeof eventNode.event === 'object') {
        const event = eventNode.event;
        const eventId = event.id;
        const title = `${event.type}_event\n${localize('eventtree.eventid', 'Event ID: ')}${eventId}\n` +
            (event.major ? localize('eventtree.major', 'Major') + '\n' : '') +
            (event.hidden ? localize('eventtree.hidden', 'Hidden') + '\n' : '') +
            (event.fire_only_once ? localize('eventtree.fireonlyonce', 'Fire only once') + '\n' : '') +
            (event.isTriggeredOnly ? localize('eventtree.istriggeredonly', 'Is triggered only') :
                `${localize('eventtree.mtthbase', 'Mean time to happen (base): ')}${event.meanTimeToHappenBase} ${localize('days', 'day(s)')}`) + '\n' +
            (delayText ? localize('eventtree.delay', 'Delay: ') + delayText + '\n' : '') +
            `${localize('eventtree.scope', 'Scope: ')}${scope}\n${localize('eventtree.title', 'Title: ')}` +
            `${indexManager.isIndexEnabled('localisation') ? localisationIndex.getLocalisedText(event.title) : event.title}`;

        const flags = [event.hidden, event.fire_only_once, event.major, eventNode.loop];
        const content = `<p class="
                ${styleTable.style('paragraph', () => 'margin: 5px 0; text-overflow: ellipsis; overflow: hidden;')}
                ${styleTable.style('white-space-nowrap', () => 'white-space: nowrap;')}
            ">
                ${makeIcon(typeToIcon[event.type], styleTable)}
                ${eventId}
                ${flags.includes(true) ? '<br/>' + flags.map((v, i) => v ? makeIcon(flagIcons[i], styleTable) : '').join(' ') : ''}
                ${!event.isTriggeredOnly ?
                    `<br/>${makeIcon('history', styleTable)} ${event.meanTimeToHappenBase} ${localize('days', 'day(s)')}` :
                    ''}
                <br/>
                ${makeIcon('symbol-namespace', styleTable)} ${scope}
                ${delayText ? `<br/>${makeIcon('watch', styleTable)} ${delayText}` : ''}
            </p>
            <p class="${styleTable.style('paragraph', () => 'margin: 5px 0; text-overflow: ellipsis; overflow: hidden;')}">
                ${indexManager.isIndexEnabled('localisation') ? localisationIndex.getLocalisedText(event.title) : event.title}
            </p>`;
        
        const extraAttributes = [];
        const extraClasses = [
            styleTable.style('event-item', () => 'background: rgba(255, 80, 80, 0.5);'),
            styleTable.style('cursor-pointer', () => 'cursor: pointer;'),
        ];
        if (event.token) { 
            extraAttributes.push(`
                start="${event.token.start}"
                end="${event.token.end}"
                ${event.file ? `file="${event.file}"` : ''}
            `);
            extraClasses.push('navigator');
        }

        const picture = event.picture ? await getSpriteByGfxName(event.picture, gfxFiles) : undefined;
        if (picture) {
            const pictureStyle = styleTable.style('event-picture-' + normalizeForStyle(event.picture ?? '-empty'), () => `
                background-image: url(${picture.image.uri});
                background-size: ${picture.image.width}px;
                width: ${picture.image.width}px;
                height: ${picture.image.height}px;
            `);
            extraAttributes.push(`
                picture-style-key="${pictureStyle}"
                picture-width="${picture.image.width}"
            `);
            extraClasses.push('event-picture-host');
        }

        return makeNode(
            content,
            title,
            styleTable,
            extraClasses.join(' '),
            extraAttributes.join(' '));

    } else {
        const eventId = eventNode.event;
        const title = `${localize('eventtree.eventid', 'Event ID: ')}${eventId}\n${localize('eventtree.scope', 'Scope: ')}${scope}`;
        let contentText = '';
        if (indexManager.isIndexEnabled('localisation')) {
            let localizedTitle = localisationIndex.getLocalisedText(eventId);
            if (localizedTitle !== eventId && localizedTitle) {
                contentText = localizedTitle;
            } else {
                localizedTitle = localisationIndex.getLocalisedText(`${eventId}.t`);
                if (localizedTitle !== `${eventId}.t` && localizedTitle) {
                    contentText = localizedTitle;
                }
            }
        }
        const content = `<p class="
                ${styleTable.style('paragraph', () => 'margin: 5px 0; text-overflow: ellipsis; overflow: hidden;')}
                ${styleTable.style('white-space-nowrap', () => 'white-space: nowrap;')}
            ">
                ${makeIcon('question', styleTable)}
                ${eventId}
                <br/>
                ${makeIcon('symbol-namespace', styleTable)} ${scope}
                ${delayText ? `<br/>${makeIcon('watch', styleTable)} ${delayText}` : ''}
            </p>
            ${contentText ? `<p class="${styleTable.style('paragraph', () => 'margin: 5px 0; text-overflow: ellipsis; overflow: hidden;')}">${contentText}</p>` : ''}`;
    
        return makeNode(content, title, styleTable, styleTable.style('event-item', () => 'background: rgba(255, 80, 80, 0.5);'));
    }
}

function makeIcon(type: string, styleTable: StyleTable): string {
    return `<i class="codicon codicon-${type} ${styleTable.style('bottom', () => 'vertical-align: bottom;')}"></i>`;
}

async function makeOptionNode(option: OptionNode, styleTable: StyleTable): Promise<string> {
    let content = option.optionName;
    let title = option.optionName;
    if (indexManager.isIndexEnabled('localisation')){
        const optionName = localisationIndex.getLocalisedText(option.optionName);
        content = `${option.optionName}<br/>${optionName}`;
        title = `${option.optionName}\n${optionName}`;
    }

    const extraAttributes = option.token ? `
        start="${option.token.start}"
        end="${option.token.end}"
        ${option.file ? `file="${option.file}"` : ''}
        ` : '';

    return makeNode(
        content,
        title,
        styleTable,
        styleTable.style('event-option', () => 'background: rgba(80, 80, 255, 0.5); cursor: pointer;')
            + (option.token ? ' navigator' : ''),
        extraAttributes);
}

function makeNode(content: string, title: string, styleTable: StyleTable, extraClasses: string, extraAttributes?: string) {
    return `<div class=${styleTable.style('event-node-outer', () => `
        height: 100%;
        width: 100%;
        position: relative;
    `)}>
        <div
            class="${styleTable.style('event-node', () => `
                position: absolute;
                top: 50%;
                transform: translateY(-50%);
                width: calc(100% - 10px);
                text-align: center;
                padding: 10px 5px;
                margin: 0 5px;
                overflow: hidden;
                box-sizing: border-box;
                text-overflow: ellipsis;`)}
                ${extraClasses}"
            title='${htmlEscape(title.trim())}'
            ${extraAttributes ?? ''}
        >
            ${content}
        </div>
    </div>`;
}

function treeRange(tree: GridBoxTree, y: number): { start: number; end: number; } | undefined {
    return tree.ranges[y] ?? tree.defaultRange;
}

function appendChildToTree(target: GridBoxTree, nextChild: GridBoxTree, yOffset: number = 0, canBeLessThanZero: boolean = false): void {
    const minXOffset = target.ranges.every((_, i) => i < yOffset) && target.defaultRange === undefined ?
        -(max([...nextChild.ranges.map(r => r.start), ...(nextChild.defaultRange !== undefined ? [nextChild.defaultRange.start] : [])]) ?? 0) :
        -Infinity;
    let xOffset = minXOffset;
    for (let i = 0, j = yOffset; i < nextChild.ranges.length + 1 || j < target.ranges.length; i++, j++) {
        const r = treeRange(nextChild, i);
        if (!r) {
            continue;
        }
        const s = r.start;
        const targetRange = treeRange(target, j);
        let newOffset: number;
        if (!canBeLessThanZero) {
            const e = targetRange?.end ?? 0;
            newOffset = e - s;
        } else {
            if (!targetRange || targetRange.end === targetRange.start) {
                newOffset = -Infinity;
            } else {
                newOffset = targetRange.end - s;
            }
        }
        if (newOffset > xOffset) {
            xOffset = newOffset;
        }
    }
    if (xOffset === -Infinity) {
        xOffset = 0;
    }

    const movedChildItems = nextChild.items.map(v => ({
        ...v,
        gridX: v.gridX + xOffset,
        gridY: v.gridY + yOffset,
    }));
    target.items.push(...movedChildItems);
    target.outputNodes.push(...nextChild.outputNodes.map(v => ({
        node: v.node,
        x: v.x + xOffset,
        fromItem: movedChildItems.find(i => i.id === v.fromItem.id)!,
    })));
    for (let i = 0, j = yOffset; i < nextChild.ranges.length || j < target.ranges.length; i++, j++) {
        const r = treeRange(nextChild, i);
        if (!r) {
            continue;
        }
        const e = r.end;
        const targetRange = treeRange(target, j);
        if (!targetRange || targetRange?.start === targetRange?.end) {
            target.ranges[j] = { start: (nextChild.ranges[i]?.start ?? 0) + xOffset, end: e + xOffset };
        } else {
            target.ranges[j] = { start: targetRange.start, end: Math.max(targetRange.end, e + xOffset) };
        }
    }
    if (nextChild.defaultRange) {
        if (target.defaultRange) {
            target.defaultRange.start = Math.min(target.defaultRange.start, nextChild.defaultRange.start + xOffset);
            target.defaultRange.end = Math.max(target.defaultRange.end, nextChild.defaultRange.end + xOffset);
        } else {
            target.defaultRange = { start: nextChild.defaultRange.start + xOffset, end: nextChild.defaultRange.end + xOffset };
        }
    }
}

function appendOutputNodeToTree(target: GridBoxTree, item: GridBoxItem, node: EventNode, yOffset: number = 0): void {
    const x = max([...target.ranges.slice(yOffset), ...(target.defaultRange ? [target.defaultRange] : [])].map(r => r.end)) ?? 0;
    for (let i = yOffset; i < target.ranges.length; i++) {
        const range = target.ranges[i];
        range.start = Math.min(range.start, x);
        range.end = Math.max(range.end, x + 1);
    }
    if (target.defaultRange) {
        target.defaultRange.start = Math.min(target.defaultRange.start, x);
        target.defaultRange.end = Math.max(target.defaultRange.end, x + 1);
    } else {
        target.defaultRange = { start: x, end: x + 1 };
    }
    target.outputNodes.push({
        node,
        x,
        fromItem: item,
    });
}

function makeDelayString(days: number | undefined, hours: number | undefined, randomDays: number | undefined, randomHours: number | undefined): string | undefined {
    days ??= 0;
    hours ??= 0;
    randomDays ??= 0;
    randomHours ??= 0;
    if (days === 0 && hours === 0 && randomDays === 0 && randomHours === 0) {
        return undefined;
    }
    return (days > 0 || randomDays > 0 ?
            `${randomDays > 0 ? `${days + Math.floor(hours / 24)}-${days + randomDays + Math.floor((hours + randomHours) / 24)}` : days} ${localize('days', 'day(s)')}` :
            `${randomHours > 0 ? `${hours}-${hours + randomHours}` : hours} ${localize('hours', 'hour(s)')}`);
}

