import * as vscode from 'vscode';
import {EventsLoader, EventsLoaderResult} from './loader';
import {LoaderSession} from '../../util/loader/loader';
import {debug} from '../../util/debug';
import {html, htmlEscape} from '../../util/html';
import {localize} from '../../util/i18n';
import {StyleTable, normalizeForStyle} from '../../util/styletable';
import {HOIEvent, HOIEventType} from './schema';
import {flatten, repeat, max} from 'lodash';
import {arrayToMap, forceError} from '../../util/common';
import {HOIPartial, toNumberLike, toStringAsSymbolIgnoreCase} from '../../hoiformat/schema';
import {GridBoxType} from '../../hoiformat/gui';
import {renderGridBox, GridBoxItem, GridBoxConnection} from '../../util/hoi4gui/gridbox';
import {Token} from '../../hoiformat/hoiparser';
import {getSpriteByGfxName} from '../../util/image/imagecache';
import {getLocalisedTextQuick} from "../../util/localisationIndex";
import {localisationIndex} from "../../util/featureflags";

export async function renderEventFile(loader: EventsLoader, uri: vscode.Uri, webview: vscode.Webview): Promise<string> {
    const setPreviewFileUriScript = {content: `window.previewedFileUri = "${uri.toString()}";`};

    try {
        const session = new LoaderSession(false);
        const loadResult = await loader.load(session);
        const loadedLoaders = Array.from((session as any).loadedLoader).map<string>(v => (v as any).toString());
        debug('Loader session event tree', loadedLoaders);

        const styleTable = new StyleTable();
        const baseContent = await renderEvents(loadResult.result, styleTable);

        return html(
            webview,
            baseContent,
            [
                setPreviewFileUriScript,
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
        return html(webview, baseContent, [setPreviewFileUriScript], []);
    }

}

const leftPaddingBase = 50;
const topPaddingBase = 50;
const xGridSize = 180;
const yGridSize = 150;

async function renderEvents(eventsLoaderResult: EventsLoaderResult, styleTable: StyleTable): Promise<string> {
    const leftPadding = leftPaddingBase;
    const topPadding = topPaddingBase;

    const gridBox: HOIPartial<GridBoxType> = {
        position: {x: toNumberLike(leftPadding), y: toNumberLike(topPadding)},
        format: toStringAsSymbolIgnoreCase('up'),
        size: {width: toNumberLike(xGridSize), height: undefined},
        slotsize: {width: toNumberLike(xGridSize), height: toNumberLike(yGridSize)},
    } as HOIPartial<GridBoxType>;

    const eventIdToEvent = arrayToMap(flatten(Object.values(eventsLoaderResult.events.eventItemsByNamespace)), 'id');
    const graph = eventsToGraph(eventIdToEvent, eventsLoaderResult.mainNamespaces);
    const idToContentMap: Record<string, string> = {};
    const gridBoxItems = await graphToGridBoxItems(graph, idToContentMap, eventsLoaderResult, styleTable);

    const renderedGridBox = await renderGridBox(gridBox, {
        size: {width: 0, height: 0},
        orientation: 'upper_left'
    }, {
        styleTable,
        items: arrayToMap(gridBoxItems, 'id'),
        onRenderItem: async (item) => idToContentMap[item.id],
        cornerPosition: 0.5,
    });

    return `
        <div id="dragger" class="${styleTable.oneTimeStyle('dragger', () => `
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
    event: HOIEvent;
    loop: boolean;
    children: (EventEdge | OptionNode)[];
    relatedNamespace: string[];
    token: Token | undefined;
}

interface OptionNode {
    optionName: string;
    children: EventEdge[];
    file: string;
    token: Token | undefined;
}

interface EventEdge {
    toScope: string;
    toNode: EventNode | string;
    days: number;
    hours: number;
    randomDays: number;
    randomHours: number;
}

function eventsToGraph(eventIdToEvent: Record<string, HOIEvent>, mainNamespaces: string[]): EventNode[] {
    const eventIdToNode: Record<string, EventNode> = {};
    const eventHasParent: Record<string, boolean> = {};
    const eventStack: HOIEvent[] = [];

    for (const event of Object.values(eventIdToEvent)) {
        eventToNode(event, eventIdToEvent, eventStack, eventIdToNode, eventHasParent);
    }

    const result: EventNode[] = [];
    for (const event of Object.values(eventIdToEvent)) {
        if (!eventHasParent[event.id]) {
            const eventNode = eventIdToNode[event.id];
            if (eventNode.relatedNamespace.some(n => mainNamespaces.includes(n))) {
                result.push(eventNode);
            }
        }
    }

    return result;
}

function eventToNode(
    event: HOIEvent,
    eventIdToEvent: Record<string, HOIEvent>,
    eventStack: HOIEvent[],
    eventIdToNode: Record<string, EventNode>,
    eventHasParent: Record<string, boolean>
): EventNode {
    const cachedNode = eventIdToNode[event.id];
    if (cachedNode) {
        return cachedNode;
    }

    eventStack.push(event);
    const eventNode: EventNode = {
        event,
        children: [],
        relatedNamespace: [event.namespace],
        token: event.token,
        loop: false,
    };
    eventIdToNode[event.id] = eventNode;

    for (const option of [event.immediate, ...event.options]) {
        const isImmediate = !option.name;
        const optionNode: OptionNode = {
            optionName: option.name ?? ':immediate',
            children: [],
            file: event.file,
            token: option.token,
        };
        if (!isImmediate) {
            eventNode.children.push(optionNode);
        }

        for (const childEvent of option.childEvents) {
            const childEventItem = eventIdToEvent[childEvent.eventName];
            eventHasParent[childEvent.eventName] = true;

            let toNode: EventNode | string;
            if (!childEventItem) {
                toNode = childEvent.eventName;
            } else if (eventStack.includes(childEventItem)) {
                toNode = eventToNode(childEventItem, eventIdToEvent, eventStack, eventIdToNode, eventHasParent);
                toNode = {
                    ...toNode,
                    children: [],
                    loop: true,
                };
            } else {
                toNode = eventToNode(childEventItem, eventIdToEvent, eventStack, eventIdToNode, eventHasParent);
                toNode.relatedNamespace.forEach(n => {
                    if (!eventNode.relatedNamespace.includes(n)) {
                        eventNode.relatedNamespace.push(n);
                    }
                });
            }

            const eventEdge: EventEdge = {
                toNode,
                toScope: childEvent.scopeName,
                days: childEvent.days,
                hours: childEvent.hours,
                randomDays: childEvent.randomDays,
                randomHours: childEvent.randomHours,
            };

            if (isImmediate) {
                eventNode.children.push(eventEdge);
            } else {
                optionNode.children.push(eventEdge);
            }
        }
    }

    eventStack.pop();
    return eventNode;
}

interface GridBoxTree {
    id: string;
    items: GridBoxItem[];
    starts: number[];
    ends: number[];
}

async function graphToGridBoxItems(
    graph: EventNode[],
    idToContentMap: Record<string, string>,
    eventsLoaderResult: EventsLoaderResult,
    styleTable: StyleTable
): Promise<GridBoxItem[]> {
    const resultTree: GridBoxTree = {
        id: '',
        items: [],
        starts: [],
        ends: [],
    };
    const idContainer = {id: 0};

    for (const eventNode of graph) {
        const scopeContext: ScopeContext = {
            fromStack: [],
            currentScopeName: 'EVENT_TARGET',
        };
        const tree = await eventNodeToGridBoxItems(eventNode, undefined, idToContentMap, scopeContext, eventsLoaderResult, styleTable, idContainer);
        idToContentMap[tree.id] = await makeEventNode(scopeContext.currentScopeName, eventNode, undefined, eventsLoaderResult, styleTable);
        appendChildToTree(resultTree, tree);
    }

    return resultTree.items;
}

async function eventNodeToGridBoxItems(
    node: EventNode | OptionNode | string,
    edge: EventEdge | undefined,
    idToContentMap: Record<string, string>,
    scopeContext: ScopeContext,
    eventsLoaderResult: EventsLoaderResult,
    styleTable: StyleTable,
    idContainer: { id: number },
): Promise<GridBoxTree> {
    const result: GridBoxTree = {
        id: '',
        items: [],
        starts: [],
        ends: [],
    };
    const childIds: string[] = [];
    if (typeof node === 'object') {
        for (const child of node.children) {
            let tree: GridBoxTree;
            if ('toNode' in child) {
                const toNode = child.toNode;
                const nextScopeContext = nextScope(scopeContext, child.toScope);
                tree = await eventNodeToGridBoxItems(toNode, child, idToContentMap, nextScopeContext, eventsLoaderResult, styleTable, idContainer);
            } else {
                tree = await eventNodeToGridBoxItems(child, undefined, idToContentMap, scopeContext, eventsLoaderResult, styleTable, idContainer);
            }
            childIds.push(tree.id);
            appendChildToTree(result, tree, 1, true);
        }
    }

    const isOption = typeof node === 'object' && !('event' in node);
    const id = (typeof node === 'object' ? ('event' in node ? node.event.id : node.optionName) : node) + ':' + (idContainer.id++);
    if (isOption) {
        idToContentMap[id] = await makeOptionNode(node as OptionNode, eventsLoaderResult, styleTable);
    } else {
        idToContentMap[id] = await makeEventNode(scopeContext.currentScopeName,
            typeof node === 'object' ? node as EventNode : node, edge, eventsLoaderResult, styleTable);
    }

    const x = result.starts.length < 2 ? 0 : Math.floor((result.ends[1] + result.starts[1] - 1) / 2);
    result.id = id;
    result.items.push({
        id,
        gridX: x,
        gridY: 0,
        connections: childIds.map<GridBoxConnection>(id => ({
            target: id,
            targetType: 'child',
            style: '1px solid #88aaff'
        })),
    });

    if (result.starts.length === 0) {
        result.starts.push(0);
        result.ends.push(1);
    } else {
        if (result.starts[0] === result.ends[0]) {
            result.starts[0] = x;
            result.ends[0] = x + 1;
        } else {
            result.starts[0] = Math.min(x, result.starts[0] ?? 0);
            result.ends[0] = Math.max(x + 1, result.ends[0] ?? 0);
        }
    }

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
        fromStack: [...scopeContext.fromStack, scopeContext.currentScopeName],
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

async function makeEventNode(scope: string, eventNode: EventNode | string, edge: EventEdge | undefined, eventsLoaderResult: EventsLoaderResult, styleTable: StyleTable): Promise<string> {
    if (typeof eventNode === 'object') {
        const {localizationDict, gfxFiles} = eventsLoaderResult;
        const event = eventNode.event;
        const eventId = event.id;
        const title = `${event.type}_event\n${localize('eventtree.eventid', 'Event ID: ')}${eventId}\n` +
            (event.major ? localize('eventtree.major', 'Major') + '\n' : '') +
            (event.hidden ? localize('eventtree.hidden', 'Hidden') + '\n' : '') +
            (event.fire_only_once ? localize('eventtree.fireonlyonce', 'Fire only once') + '\n' : '') +
            (event.isTriggeredOnly ? localize('eventtree.istriggeredonly', 'Is triggered only') :
                `${localize('eventtree.mtthbase', 'Mean time to happen (base): ')}${event.meanTimeToHappenBase} ${localize('days', 'day(s)')}`) + '\n' +
            (edge !== undefined && (edge.days > 0 || edge.hours > 0 || edge.randomDays > 0 || edge.randomHours > 0) ?
                localize('eventtree.delay', 'Delay: ') + (edge.days > 0 || edge.hours > 0 ?
                    `${edge.randomDays > 0 ? `${edge.days}-${edge.days + edge.randomDays}` : edge.days} ${localize('days', 'day(s)')}` :
                    `${edge.randomHours > 0 ? `${edge.hours}-${edge.hours + edge.randomHours}` : edge.hours} ${localize('hours', 'hour(s)')}`) + '\n' :
                '') +
            `${localize('eventtree.scope', 'Scope: ')}${scope}\n${localize('eventtree.title', 'Title: ')}${localisationIndex ? await getLocalisedTextQuick(event.title) : event.title}`;

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
                ${edge !== undefined && (edge.days > 0 || edge.hours > 0 || edge.randomDays > 0 || edge.randomHours > 0) ?
            `<br/>${makeIcon('watch', styleTable)} ${edge.days > 0 || edge.hours > 0 ?
                `${edge.randomDays > 0 ? `${edge.days}-${edge.days + edge.randomDays}` : edge.days} ${localize('days', 'day(s)')}` :
                `${edge.randomHours > 0 ? `${edge.hours}-${edge.hours + edge.randomHours}` : edge.hours} ${localize('hours', 'hour(s)')}`}`
            : ''}
            </p>
            <p class="${styleTable.style('paragraph', () => 'margin: 5px 0; text-overflow: ellipsis; overflow: hidden;')}">
                ${localisationIndex? await getLocalisedTextQuick(event.title) : event.title}
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
        const eventId = eventNode;
        const title = `${localize('eventtree.eventid', 'Event ID: ')}${eventId}\n${localize('eventtree.scope', 'Scope: ')}${scope}`;
        let contentText = '';
        if (localisationIndex) {
            let localizedTitle = await getLocalisedTextQuick(eventId);
            if (localizedTitle !== eventId && localizedTitle != null) {
                contentText += `<br/>${localizedTitle}`;
            } else {
                localizedTitle = await getLocalisedTextQuick(`${eventId}.t`);
                if (localizedTitle !== `${eventId}.t` && localizedTitle != null) {
                    contentText += `<br/>${localizedTitle}`;
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
                ${contentText}
            </p>`;

        return makeNode(content, title, styleTable, styleTable.style('event-item', () => 'background: rgba(255, 80, 80, 0.5);'));
    }
}

function makeIcon(type: string, styleTable: StyleTable): string {
    return `<i class="codicon codicon-${type} ${styleTable.style('bottom', () => 'vertical-align: bottom;')}"></i>`;
}

async function makeOptionNode(option: OptionNode, eventsLoaderResult: EventsLoaderResult, styleTable: StyleTable): Promise<string> {
    let content = option.optionName;
    let title = option.optionName;
    if (localisationIndex){
        const optionName = await getLocalisedTextQuick(option.optionName);
        content = `${option.optionName} <br/> ${optionName}`;
        title = `${option.optionName} \n ${optionName}`;
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

function appendChildToTree(target: GridBoxTree, nextChild: GridBoxTree, yOffset: number = 0, canBeLessThanZero: boolean = false): void {
    const minXOffset = target.starts.length === 0 ? -(max(nextChild.starts) ?? 0) : -Infinity;
    const xOffset = Math.max(minXOffset, max(nextChild.starts.map((s, i) => {
        if (!canBeLessThanZero) {
            const e = target.ends[i + yOffset] ?? 0;
            return e - s;
        } else {
            if (target.ends[i + yOffset] === target.starts[i + yOffset]) {
                return -Infinity;
            } else {
                return target.ends[i + yOffset] - s;
            }
        }
    })) ?? 0);
    target.items.push(...nextChild.items.map(v => ({
        ...v,
        gridX: v.gridX + xOffset,
        gridY: v.gridY + yOffset,
    })));
    nextChild.ends.forEach((e, i) => {
        if (target.starts[i + yOffset] === target.ends[i + yOffset]) {
            target.starts[i + yOffset] = (nextChild.starts[i] ?? 0) + xOffset;
        } else {
            target.starts[i + yOffset] = target.starts[i + yOffset] ?? 0;
        }
        target.ends[i + yOffset] = e + xOffset;
    });
}
