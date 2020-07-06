import * as vscode from 'vscode';
import { EventsLoader, EventsLoaderResult } from './loader';
import { LoaderSession } from '../../util/loader/loader';
import { debug } from '../../util/debug';
import { html, htmlEscape } from '../../util/html';
import { localize } from '../../util/i18n';
import { StyleTable } from '../../util/styletable';
import { HOIEvent } from './schema';
import { flatten, repeat } from 'lodash';
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
const xGridSize = 130;
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
    const idToScopeMap: Record<string, string> = {};
    const gridBoxItems = graphToGridBoxItems(graph, idToScopeMap, eventsLoaderResult.localizationDict);

    const renderedGridBox = await renderGridBox(gridBox, {
        size: { width: 0, height: 0 },
        orientation: 'upper_left'
    }, {
        styleTable,
        items: arrayToMap(gridBoxItems, 'id'),
        onRenderItem: async (item) => {
            const eventId = item.id.substr(0, item.id.indexOf(':'));
            const event = eventIdToEvent[eventId];
            const content = `${idToScopeMap[item.id]}\n${eventId}\n${event ? (eventsLoaderResult.localizationDict[event.title] ?? event.title) : '[N/A]'}`;
            return `<div><div
                class="${styleTable.style('event-item', () => `
                    text-align: center;
                    padding-top: 10px;
                    overflow: hidden;
                    text-overflow: ellipsis;`)}"
                title='${htmlEscape(content.trim())}'
            >
                ${content.replace(/\n/g, '<br/>')}
            </div></div>`;
        },
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
        <div>
            ${renderedGridBox}
        </div>
    `;

    /*
    return `<div class="${styleTable.style('content', () => 'font-family: Consolas, monospace;')}">
        ${JSON.stringify(graph, undefined, 2).replace(/ /g, '&nbsp;').replace(/\n/g, '<br/>')}
    </div>`;
    */
}

interface EventNode {
    event: HOIEvent;
    children: EventEdge[];
    relatedNamespace: string[];
}

interface EventEdge {
    toScope: string;
    toNode: EventNode | string;
    optionName: string;
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
            
            eventNode.children.push({
                toNode,
                toScope: childEvent.scopeName,
                optionName: option.name ?? 'immediate',
            });
        }
    }

    eventStack.pop();
    return eventNode;
}

function graphToGridBoxItems(graph: EventNode[], idToScopeMap: Record<string, string>, localizationDict: Record<string, string>): GridBoxItem[] {
    const result: GridBoxItem[] = [];
    let xOffset = 0;
    for (const eventNode of graph) {
        const scopeContext: ScopeContext = {
            fromStack: [],
            currentScopeName: 'EVENT_TARGET',
        };
        const [id, width] = eventNodeToGridBoxItems(eventNode, result, xOffset, 0, idToScopeMap, scopeContext, localizationDict);
        idToScopeMap[id] = '\n\n' + scopeContext.currentScopeName;
        xOffset += width;
    }

    return result;
}

function eventNodeToGridBoxItems(
    node: EventNode | string,
    items: GridBoxItem[],
    xOffset: number,
    yOffset: number,
    idToScopeMap: Record<string, string>,
    scopeContext: ScopeContext,
    localizationDict: Record<string, string>,
): [string, number] {
    let width = 0;
    const childIds: string[] = [];
    if (typeof node === 'object') {
        for (const child of node.children) {
            const toNode = child.toNode;
            const nextScopeContext = nextScope(scopeContext, child.toScope);
            const [id, childWidth] = eventNodeToGridBoxItems(toNode, items, xOffset + width, yOffset + 1, idToScopeMap, nextScopeContext, localizationDict);
            idToScopeMap[id] = (localizationDict[child.optionName] ?? child.optionName) + '\n\n' + nextScopeContext.currentScopeName;
            width += childWidth;
            childIds.push(id);
        }
    }

    const id = (typeof node === 'object' ? node.event.id : node) + ':' + items.length;
    items.push({
        id,
        gridX: xOffset + Math.max(0, Math.floor((width - 1) / 2)),
        gridY: yOffset,
        connections: childIds.map<GridBoxConnection>(id => ({
            target: id,
            targetType: 'child',
            style: '1px solid #88aaff'
        })),
    });

    return [id, Math.max(1, width)];
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
