import * as vscode from 'vscode';
import { EventsLoader, EventsLoaderResult } from './loader';
import { LoaderSession } from '../../util/loader/loader';
import { debug } from '../../util/debug';
import { html, htmlEscape } from '../../util/html';
import { localize } from '../../util/i18n';
import { StyleTable } from '../../util/styletable';
import { HOIEvent } from './schema';
import { flatten, repeat, max } from 'lodash';
import { arrayToMap } from '../../util/common';
import { HOIPartial, toNumberLike, toStringAsSymbolIgnoreCase } from '../../hoiformat/schema';
import { GridBoxType } from '../../hoiformat/gui';
import { renderGridBox, GridBoxItem, GridBoxConnection } from '../../util/hoi4gui/gridbox';

export async function renderEventFile(loader: EventsLoader, uri: vscode.Uri, webview: vscode.Webview): Promise<string> {
    const styleTable = new StyleTable();
    let baseContent = '';
    
    try {
        const session = new LoaderSession(false);
        const loadResult = await loader.load(session);
        const loadedLoaders = Array.from((session as any).loadedLoader).map<string>(v => (v as any).toString());
        debug('Loader session focus tree', loadedLoaders);
        baseContent = await renderEvents(loadResult.result, styleTable);
    } catch (e) {
        baseContent = `${localize('error', 'Error')}: <br/>  <pre>${htmlEscape(e.toString())}</pre>`;
    }

    return html(
        webview,
        baseContent,
        [
            { content: `window.previewedFileUri = "${uri.toString()}";` },
            'eventtree.js',
        ],
        [
            styleTable
        ],
    );
}

const leftPaddingBase = 50;
const topPaddingBase = 50;
const xGridSize = 150;
const yGridSize = 130;

async function renderEvents(eventsLoaderResult: EventsLoaderResult, styleTable: StyleTable): Promise<string> {
    const leftPadding = leftPaddingBase;
    const topPadding = topPaddingBase;

    const gridBox: HOIPartial<GridBoxType> = {
        position: { x: toNumberLike(leftPadding), y: toNumberLike(topPadding) },
        format: toStringAsSymbolIgnoreCase('up'),
        size: { width: toNumberLike(xGridSize), height: undefined },
        slotsize: { width: toNumberLike(xGridSize), height: toNumberLike(yGridSize) },
    } as HOIPartial<GridBoxType>;
    
    const eventIdToEvent = arrayToMap(flatten(Object.values(eventsLoaderResult.events.eventItemsByNamespace)), 'id');
    const graph = eventsToGraph(eventIdToEvent, eventsLoaderResult.mainNamespaces);
    const idToContentMap: Record<string, string> = {};
    const gridBoxItems = graphToGridBoxItems(graph, idToContentMap, eventsLoaderResult.localizationDict, styleTable);

    const renderedGridBox = await renderGridBox(gridBox, {
        size: { width: 0, height: 0 },
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
        <div id="eventtreecontent">
            ${renderedGridBox}
        </div>
    `;
}

interface EventNode {
    event: HOIEvent;
    children: (EventEdge | OptionNode)[];
    relatedNamespace: string[];
}

interface OptionNode {
    optionName: string;
    children: EventEdge[];
}

interface EventEdge {
    toScope: string;
    toNode: EventNode | string;
}

function eventsToGraph(eventIdToEvent: Record<string, HOIEvent>, mainNamespaces: string[]): EventNode[] {
    const eventIdToNode: Record<string, EventNode> = {};
    const eventHasParent: Record<string, boolean> = {};
    const eventStack: HOIEvent[] = [];

    for (const event of Object.values(eventIdToEvent)) {
        const node = eventToNode(event, eventIdToEvent, eventStack, eventIdToNode, eventHasParent);
        eventIdToNode[event.id] = node;
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
    };

    for (const option of [event.immediate, ...event.options]) {
        const isImmediate = !option.name;
        const optionNode: OptionNode = {
            optionName: option.name ?? ':immediate',
            children: [],
        };
        if (!isImmediate) {
            eventNode.children.push(optionNode);
        }

        for (const childEvent of option.childEvents) {
            const childEventItem = eventIdToEvent[childEvent.eventName];
            eventHasParent[childEvent.eventName] = true;

            let toNode: EventNode | string;
            if (!childEventItem || eventStack.includes(childEventItem)) {
                toNode = childEvent.eventName;
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

function graphToGridBoxItems(graph: EventNode[], idToContentMap: Record<string, string>, localizationDict: Record<string, string>, styleTable: StyleTable): GridBoxItem[] {
    const resultTree: GridBoxTree = {
        id: '',
        items: [],
        starts: [],
        ends: [],
    };

    for (const eventNode of graph) {
        const scopeContext: ScopeContext = {
            fromStack: [],
            currentScopeName: 'EVENT_TARGET',
        };
        const tree = eventNodeToGridBoxItems(eventNode, idToContentMap, scopeContext, localizationDict, styleTable, { id: 0 });
        idToContentMap[tree.id] = makeEventNode(scopeContext.currentScopeName, eventNode.event, localizationDict, styleTable);
        appendChildToTree(resultTree, tree);
    }

    return resultTree.items;
}

function eventNodeToGridBoxItems(
    node: EventNode | OptionNode | string,
    idToContentMap: Record<string, string>,
    scopeContext: ScopeContext,
    localizationDict: Record<string, string>,
    styleTable: StyleTable,
    idContainer: { id: number },
): GridBoxTree {
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
                tree = eventNodeToGridBoxItems(toNode, idToContentMap, nextScopeContext, localizationDict, styleTable, idContainer);
            } else {
                tree = eventNodeToGridBoxItems(child, idToContentMap, scopeContext, localizationDict, styleTable, idContainer);
            }
            childIds.push(tree.id);
            appendChildToTree(result, tree, 1);
        }
    }

    const isOption = typeof node === 'object' && !('event' in node);
    const id = (typeof node === 'object' ? ('event' in node ? node.event.id : node.optionName) : node) + ':' + (idContainer.id++);
    if (isOption) {
        idToContentMap[id] = makeOptionNode((node as OptionNode).optionName, localizationDict, styleTable);
    } else {
        idToContentMap[id] = makeEventNode(scopeContext.currentScopeName,
            typeof node === 'object' ? (node as EventNode).event : node, localizationDict, styleTable);
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
        fromStack: [ ...scopeContext.fromStack, scopeContext.currentScopeName ],
        currentScopeName,
    };
}

function makeEventNode(scope: string, event: HOIEvent | string, localizationDict: Record<string, string>, styleTable: StyleTable): string {
    const eventId = typeof event === 'object' ? event.id : event;
    const title = `Scope: ${scope}\nEvent ID: ${eventId}\nTitle: ${typeof event === 'object' ? (localizationDict[event.title] ?? event.title) : '[N/A]'}`;
    const content = `${scope}\n${eventId}\n${typeof event === 'object' ? (localizationDict[event.title] ?? event.title) : '[N/A]'}`;
    return `<div class=${styleTable.style('event-item-outer', () => `
        height: 100%;
        width: 100%;
        position: relative;
    `)}>
        <div
            class="
            ${styleTable.style('event-item', () => `
                position: absolute;
                top: 50%;
                transform: translateY(-50%);
                width: calc(100% - 10px);
                text-align: center;
                padding: 10px 0;
                margin: 0 5px;
                overflow: hidden;
                text-overflow: ellipsis;
                background: rgba(255, 80, 80, 0.5);`)}"
            title='${htmlEscape(title.trim())}'
        >
            ${content.replace(/\n/g, '<br/>')}
        </div>
    </div>`;
}

function makeOptionNode(option: string, localizationDict: Record<string, string>, styleTable: StyleTable): string {
    const content = `${localizationDict[option] ?? option}`;
        return `<div class=${styleTable.style('event-option-outer', () => `
        height: 100%;
        width: 100%;
        position: relative;
    `)}>
        <div
            class="${styleTable.style('event-option', () => `
                position: absolute;
                top: 50%;
                transform: translateY(-50%);
                width: calc(100% - 10px);
                text-align: center;
                padding: 10px 0;
                margin: 0 5px;
                overflow: hidden;
                text-overflow: ellipsis;
                background: rgba(80, 80, 255, 0.5);`)}"
            title='${htmlEscape(content.trim())}'
        >
            ${content.replace(/\n/g, '<br/>')}
        </div>
    </div>`;
}

function appendChildToTree(target: GridBoxTree, nextChild: GridBoxTree, yOffset: number = 0): void {
    const xOffset = max(nextChild.starts.map((s, i) => {
        const e = target.ends[i + yOffset] ?? 0;
        return e - s;
    })) ?? 0;
    target.items.push(...nextChild.items.map(v => ({
        ...v,
        gridX: v.gridX + xOffset,
        gridY: v.gridY + yOffset,
    })));
    nextChild.ends.forEach((e, i) => {
        if (target.starts[i + yOffset] === target.ends[i + yOffset]) {
            target.starts[i + yOffset] = nextChild.starts[i] ?? 0;
        } else {
            target.starts[i + yOffset] = target.starts[i + yOffset] ?? 0;
        }
        target.ends[i + yOffset] = e + xOffset;
    });
}
