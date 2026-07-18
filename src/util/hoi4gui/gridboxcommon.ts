import { HOIPartial } from "../../hoiformat/schema";
import { ParentInfo, calculateBBox, normalizeNumberLike, RenderCommonOptions, getWidth, getHeight } from "./common";
import { NumberSize, NumberPosition } from "../common";
import { StyleTable } from '../styletable';
import { GridBoxType, Format, Background } from "../../hoiformat/gui";
import { map, flatMap } from "lodash";

export type GridBoxConnectionType = 'child' | 'parent' | 'related';

export interface GridBoxConnection {
    target: string;
    targetType: GridBoxConnectionType;
    style?: string;
    classNames?: string;
}

export interface GridBoxItem {
    id: string;
    gridX: number;
    gridY: number;
    connections: GridBoxConnection[];
    isJoint?: boolean;
    htmlId?: string;
    classNames?: string;
}

export interface GridBoxConnectionItemDirection {
    in: Record<string, true>;
    out: Record<string, true>;
}

export interface GridBoxConnectionItem {
    x: number;
    y: number;
    up?: GridBoxConnectionItemDirection;
    down?: GridBoxConnectionItemDirection;
    left?: GridBoxConnectionItemDirection;
    right?: GridBoxConnectionItemDirection;
}

export interface RenderGridBoxCommonOptions extends RenderCommonOptions {
    items: Record<string, GridBoxItem>;
    onRenderItem?(item: GridBoxItem, parentInfo: ParentInfo): Promise<string>;
    onRenderLineBox?(item: GridBoxConnectionItem, parentInfo: ParentInfo): Promise<string>;
    lineRenderMode?: 'line' | 'control';
    cornerPosition?: number;
    virtualization?: boolean;
    onOutputVirtualizationData?(data: GridBoxVirtualizationData): void;
}

export interface GridBoxVirtualizationData {
    className: string;
    gridBoxX: number;
    gridBoxY: number;
    items: GridBoxVirtualizedItem[];
    connections: GridBoxVirtualizedConnection[];
}

export interface GridBoxVirtualizedItem {
    id: string | undefined;
    classNames: string;
    innerHTML: string;
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface GridBoxVirtualizedConnection {
    classNames: string;
    x: number;
    y: number;
    width: number;
    height: number;
    vLine?: 'left' | 'right';
    hLine?: 'top' | 'bottom';
}

const offsetMap: Record<Format['_name'], { x: number, y: number }> = {
    left: { x: 0, y: 0.5 },
    up: { x: 0.5, y: 0 },
    right: { x: 1, y: 0.5 },
    down: { x: 0.5, y: 1 },
    center: { x: 0.5, y: 0.5 },
};

function getLeftUpPosition(gridX: number, gridY: number, format: Format['_name'], slotSize: NumberSize, gridSize: NumberSize): NumberPosition {
    if (format === 'down') {
        gridY *= -1;
    } else if (format === 'left') {
        const t = gridX;
        gridX = gridY;
        gridY = t;
    } else if (format === 'right') {
        const t = gridX;
        gridX = -gridY;
        gridY = t;
    }

    const offset = offsetMap[format] ?? { x: 0, y: 0 };
    return {
        x: gridX * slotSize.width + offset.x * gridSize.width - offset.x * slotSize.width,
        y: gridY * slotSize.height + offset.y * gridSize.height - offset.y * slotSize.height,
    };
}

function getCenterPosition(gridX: number, gridY: number, format: Format['_name'], slotSize: NumberSize, gridSize: NumberSize): NumberPosition {
    const position = getLeftUpPosition(gridX, gridY, format, slotSize, gridSize);
    position.x += slotSize.width / 2;
    position.y += slotSize.height / 2;
    return position;
}

export function getGridBoxCommonChildParentInfo(gridBox: HOIPartial<GridBoxType>, parentInfo: ParentInfo): ParentInfo {
    const orientation = calculateBBox(gridBox, parentInfo)[4];
    const xSlotSize = normalizeNumberLike(getWidth(gridBox.slotsize), 0) ?? 50;
    const ySlotSize = normalizeNumberLike(getHeight(gridBox.slotsize), 0) ?? 50;
    const slotSize = { width: xSlotSize, height: ySlotSize };
    return { size: slotSize, orientation };
}

export async function renderGridBoxCommon(
    gridBox: HOIPartial<GridBoxType>,
    parentInfo: ParentInfo,
    options: RenderGridBoxCommonOptions,
    onRenderBackground?: (background: HOIPartial<Background> | undefined, parentInfo: ParentInfo) => Promise<string>
): Promise<string> {
    const [x, y, width, height, orientation] = calculateBBox(gridBox, parentInfo);
    const format = gridBox.format?._name ?? 'up';

    const size = { width, height };
    const xSlotSize = normalizeNumberLike(getWidth(gridBox.slotsize), 0) ?? 50;
    const ySlotSize = normalizeNumberLike(getHeight(gridBox.slotsize), 0) ?? 50;
    const slotSize = { width: xSlotSize, height: ySlotSize };
    const childrenParentInfo: ParentInfo = { size: slotSize, orientation };
    const cornerPosition = options.cornerPosition ?? 1;

    const background = onRenderBackground ? await onRenderBackground(gridBox.background, { size, orientation }) : '';

    const virtualizedItems = await Promise.all(Object.values(options.items).map(async (item) => {
        const children = options.onRenderItem ? await options.onRenderItem(item, childrenParentInfo) : '';
        const position = getLeftUpPosition(item.gridX, item.gridY, format, slotSize, size);
        const result: GridBoxVirtualizedItem = {
            id: item.htmlId,
            classNames: `${item.classNames ? item.classNames : ''} ` +
                options.styleTable.style('positionAbsolute', () => `position: absolute;`) + ' ' +
                options.styleTable.oneTimeStyle('gridbox-item', () => `
                    left: ${position.x}px;
                    top: ${position.y}px;
                    width: ${xSlotSize}px;
                    height: ${ySlotSize}px;
                    z-index: 1;
                `),
            innerHTML: children,
            x: position.x,
            y: position.y,
            width: xSlotSize,
            height: ySlotSize,
        };
        return result;
    }));

    const renderedItems = options.virtualization ? '' : virtualizedItems.map(item =>
        `<div
            ${item.id ? `id="${item.id}"` : ''}
            class="${item.classNames}">
            ${item.innerHTML}
        </div>`).join('');
    
    const virtualizedConnections = options.lineRenderMode !== 'control' ?
        renderLineConnections(options, format, slotSize, size, cornerPosition) :
        [];

    const renderedConnections = options.lineRenderMode !== 'control' ?
        (options.virtualization ? '' : virtualizedConnections.map(conn => `<div class="${conn.classNames}"></div>`).join('')) :
        await renderControlConnections(options.items, format, slotSize, size, options.onRenderLineBox, options.styleTable, childrenParentInfo);

    const gridBoxClass = options.styleTable.oneTimeStyle('gridbox', () => `
        left: ${x}px;
        top: ${y}px;
        width: ${options.virtualization ? Math.max(width, virtualizedItems.reduce((max, item) => Math.max(max, item.x + item.width), 0)) : width}px;
        height: ${options.virtualization ? Math.max(height, virtualizedItems.reduce((max, item) => Math.max(max, item.y + item.height), 0)) : height}px;
    `);

    if (options.virtualization && options.onOutputVirtualizationData) {
        options.onOutputVirtualizationData({ className: gridBoxClass, gridBoxX: x, gridBoxY: y, items: virtualizedItems, connections: virtualizedConnections });
    }

    return `<div
    ${options.id ? `id="${options.id}"` : ''}
    start="${gridBox._token?.start}"
    end="${gridBox._token?.end}"
    class="
        ${options?.classNames ? options.classNames : ''}
        ${options.styleTable.style('positionAbsolute', () => `position: absolute;`)}
        ${gridBoxClass}
        ${options.enableNavigator ? 'navigator navigator-highlight' : ''}
    ">
        ${background}
        ${renderedConnections}
        ${renderedItems}
    </div>`;
}

function renderLineConnections(options: RenderGridBoxCommonOptions, format: Format['_name'], slotSize: NumberSize, size: NumberSize, cornerPosition: number): GridBoxVirtualizedConnection[] {
    const items = options.items;
    return Object.values(items).flatMap(item =>
        item.connections.flatMap(conn => {
            const target = items[conn.target];
            if (!target) {
                return [];
            }

            const itemPosition = getCenterPosition(item.gridX, item.gridY, format, slotSize, size);
            const targetPosition = getCenterPosition(target.gridX, target.gridY, format, slotSize, size);
            return renderGridBoxConnection(itemPosition, targetPosition, conn.style ?? '', conn.targetType, format, slotSize, conn.classNames, options.styleTable, cornerPosition);
        })
    );
}

function renderGridBoxConnection(a: NumberPosition, b: NumberPosition, style: string, type: GridBoxConnectionType, format: Format['_name'], gridSize: NumberSize, classNames: string | undefined, styleTable: StyleTable, cornerPosition: number = 1.5): GridBoxVirtualizedConnection[] {
    if (a.y === b.y) {
        return [{
            classNames: `${classNames ? classNames : ''}
                ${styleTable.style('positionAbsolute', () => `position: absolute;`)}
                ${styleTable.oneTimeStyle('gridbox-connection', () => `
                    left: ${Math.min(a.x, b.x)}px;
                    top: ${a.y}px;
                    width: ${Math.abs(a.x - b.x)}px;
                    height: ${1}px;
                    border-top: ${style};
                `)}
                ${styleTable.style('pointerEventsNone', () => `pointer-events: none;`)}`,
            x: Math.min(a.x, b.x),
            y: a.y,
            width: Math.abs(a.x - b.x),
            height: 1,
            hLine: 'top',
        }];
    }
    if (a.x === b.x) {
        return [{
            classNames: `${classNames ? classNames : ''}
                ${styleTable.style('positionAbsolute', () => `position: absolute;`)}
                ${styleTable.oneTimeStyle('gridbox-connection', () => `
                    left: ${a.x}px;
                    top: ${Math.min(a.y, b.y)}px;
                    width: ${1}px;
                    height: ${Math.abs(a.y - b.y)}px;
                    border-left: ${style};
                `)}
                ${styleTable.style('pointerEventsNone', () => `pointer-events: none;`)}`,
            x: a.x,
            y: Math.min(a.y, b.y),
            width: 1,
            height: Math.abs(a.y - b.y),
            vLine: 'left',
        }];
    }

    if (type === 'parent') {
        const c = a;
        a = b;
        b = c;
        type = 'child';
    }

    if (format === 'left' || format === 'right') {
        const bx = b.x - a.x;
        const by = b.y - a.y;
        const cornerWidth = gridSize.width * cornerPosition;
        if (Math.abs(bx) < cornerWidth) {
            return [{
                classNames: `${classNames ? classNames : ''}
                    ${styleTable.style('positionAbsolute', () => `position: absolute;`)}
                    ${styleTable.oneTimeStyle('gridbox-connection', () => `
                        left: ${Math.min(a.x, b.x)}px;
                        top: ${Math.min(a.y, b.y)}px;
                        width: ${Math.abs(bx)}px;
                        height: ${Math.abs(by)}px;
                        ${bx < 0 ? 'border-left' : 'border-right'}: ${style};
                        ${by < 0 ? 'border-bottom' : 'border-top'}: ${style};
                    `)}
                    ${styleTable.style('pointerEventsNone', () => `pointer-events: none;`)}`,
                x: Math.min(a.x, b.x),
                y: Math.min(a.y, b.y),
                width: Math.abs(bx),
                height: Math.abs(by),
                vLine: bx < 0 ? 'left' : 'right',
                hLine: by < 0 ? 'bottom' : 'top',
            }];
        } else {
            return [{
                classNames: `${classNames ? classNames : ''}
                    ${styleTable.style('positionAbsolute', () => `position: absolute;`)}
                    ${styleTable.oneTimeStyle('gridbox-connection', () => `
                        left: ${Math.min(a.x, a.x + cornerWidth * Math.sign(bx))}px;
                        top: ${Math.min(a.y, b.y)}px;
                        width: ${cornerWidth}px;
                        height: ${Math.abs(by)}px;
                        ${bx < 0 ? 'border-left' : 'border-right'}: ${style};
                        ${by < 0 ? 'border-bottom' : 'border-top'}: ${style};
                    `)}
                    ${styleTable.style('pointerEventsNone', () => `pointer-events: none;`)}`,
                x: Math.min(a.x, a.x + cornerWidth * Math.sign(bx)),
                y: Math.min(a.y, b.y),
                width: cornerWidth,
                height: Math.abs(by),
                vLine: bx < 0 ? 'left' : 'right',
                hLine: by < 0 ? 'bottom' : 'top',
            }, {
                classNames: `${classNames ? classNames : ''}
                    ${styleTable.style('positionAbsolute', () => `position: absolute;`)}
                    ${styleTable.oneTimeStyle('gridbox-connection', () => `
                        left: ${Math.min(b.x, a.x + cornerWidth * Math.sign(bx))}px;
                        top: ${Math.min(a.y, b.y)}px;
                        width: ${Math.abs(bx) - cornerWidth}px;
                        height: ${Math.abs(by)}px;
                        ${by > 0 ? 'border-bottom' : 'border-top'}: ${style};
                    `)}
                    ${styleTable.style('pointerEventsNone', () => `pointer-events: none;`)}`,
                x: Math.min(b.x, a.x + cornerWidth * Math.sign(bx)),
                y: Math.min(a.y, b.y),
                width: Math.abs(bx) - cornerWidth,
                height: Math.abs(by),
                hLine: by > 0 ? 'bottom' : 'top',
            }];
        }
    } else {
        const bx = b.x - a.x;
        const by = b.y - a.y;
        const cornerHeight = gridSize.height * cornerPosition;
        if (Math.abs(by) < cornerHeight) {
            return [{
                classNames: `${classNames ? classNames : ''}
                    ${styleTable.style('positionAbsolute', () => `position: absolute;`)}
                    ${styleTable.oneTimeStyle('gridbox-connection', () => `
                        left: ${Math.min(a.x, b.x)}px;
                        top: ${Math.min(a.y, b.y)}px;
                        width: ${Math.abs(bx)}px;
                        height: ${Math.abs(by)}px;
                        ${bx > 0 ? 'border-left' : 'border-right'}: ${style};
                        ${by > 0 ? 'border-bottom' : 'border-top'}: ${style};
                    `)}
                    ${styleTable.style('pointerEventsNone', () => `pointer-events: none;`)}`,
                x: Math.min(a.x, b.x),
                y: Math.min(a.y, b.y),
                width: Math.abs(bx),
                height: Math.abs(by),
                vLine: bx > 0 ? 'left' : 'right',
                hLine: by > 0 ? 'bottom' : 'top',
            }];
        } else {
            return [{
                classNames: `${classNames ? classNames : ''}
                    ${styleTable.style('positionAbsolute', () => `position: absolute;`)}
                    ${styleTable.oneTimeStyle('gridbox-connection', () => `
                        left: ${Math.min(a.x, b.x)}px;
                        top: ${Math.min(a.y, a.y + cornerHeight * Math.sign(by))}px;
                        width: ${Math.abs(bx)}px;
                        height: ${cornerHeight}px;
                        ${bx > 0 ? 'border-left' : 'border-right'}: ${style};
                        ${by > 0 ? 'border-bottom' : 'border-top'}: ${style};
                    `)}
                    ${styleTable.style('pointerEventsNone', () => `pointer-events: none;`)}`,
                x: Math.min(a.x, b.x),
                y: Math.min(a.y, a.y + cornerHeight * Math.sign(by)),
                width: Math.abs(bx),
                height: cornerHeight,
                vLine: bx > 0 ? 'left' : 'right',
                hLine: by > 0 ? 'bottom' : 'top',
            }, {
                classNames: `${classNames ? classNames : ''}
                    ${styleTable.style('positionAbsolute', () => `position: absolute;`)}
                    ${styleTable.oneTimeStyle('gridbox-connection', () => `
                        left: ${Math.min(a.x, b.x)}px;
                        top: ${Math.min(b.y, a.y + cornerHeight * Math.sign(by))}px;
                        width: ${Math.abs(bx)}px;
                        height: ${Math.abs(by) - cornerHeight}px;
                        ${bx > 0 ? 'border-right' : 'border-left'}: ${style};
                    `)}
                    ${styleTable.style('pointerEventsNone', () => `pointer-events: none;`)}`,
                x: Math.min(a.x, b.x),
                y: Math.min(b.y, a.y + cornerHeight * Math.sign(by)),
                width: Math.abs(bx),
                height: Math.abs(by) - cornerHeight,
                vLine: bx > 0 ? 'right' : 'left',
            }];
        }
    }
}

type ControlMatrix = Record<number, Record<number, GridBoxConnectionItem>>;
async function renderControlConnections(
    items: Record<string, GridBoxItem>,
    format: Format['_name'],
    slotSize: NumberSize,
    size: NumberSize,
    onRenderLineBox: RenderGridBoxCommonOptions['onRenderLineBox'],
    styleTable: StyleTable,
    childrenParentInfo: ParentInfo
): Promise<string> {
    const controlMatrix: ControlMatrix = {};
    const xSlotSize = slotSize.width;
    const ySlotSize = slotSize.height;

    for (const item of Object.values(items)) {
        for (const conn of item.connections) {
            const target = items[conn.target];
            if (target !== undefined) {
                if (conn.targetType !== 'parent') {
                    drawLineOnControlMatrix(item, target, controlMatrix, format);
                } else {
                    drawLineOnControlMatrix(target, item, controlMatrix, format);
                }
            }
        }
    }

    return (await Promise.all(
        flatMap(controlMatrix, m => 
            map(m, async (item) => {
                const children = onRenderLineBox ? await onRenderLineBox(item, childrenParentInfo) : '';
                const position = getLeftUpPosition(item.x, item.y, format, slotSize, size);
                return `<div
                    class="
                        ${styleTable.style('positionAbsolute', () => `position: absolute;`)}
                        ${styleTable.oneTimeStyle('gridbox-connection', () => `
                            left: ${position.x}px;
                            top: ${position.y}px;
                            width: ${xSlotSize}px;
                            height: ${ySlotSize}px;
                        `)}
                        ${styleTable.style('pointerEventsNone', () => `pointer-events: none;`)}
                    ">
                        ${children}
                    </div>`;
            })
        )
    )).join('');
}

function drawLineOnControlMatrix(s: GridBoxItem, t: GridBoxItem, controlMatrix: ControlMatrix, format: Format['_name']): void {
    if (s.gridY === t.gridY) {
        hLineOnControlMatrix(s.gridY, s.gridX, t.gridX, s.id, t.id, controlMatrix, format);
        return;
    }

    if (s.gridX === t.gridX) {
        vLineOnControlMatrix(s.gridX, s.gridY, t.gridY, s.id, t.id, controlMatrix, format);
        return;
    }

    const sign = Math.sign(t.gridY - s.gridY);
    if (s.isJoint) {
        hLineOnControlMatrix(s.gridY, s.gridX, t.gridX, s.id, t.id, controlMatrix, format);
        vLineOnControlMatrix(t.gridX, s.gridY, t.gridY, s.id, t.id, controlMatrix, format);
    } else {
        vLineOnControlMatrix(s.gridX, s.gridY, s.gridY + sign, s.id, t.id, controlMatrix, format);
        hLineOnControlMatrix(s.gridY + sign, s.gridX, t.gridX, s.id, t.id, controlMatrix, format);
        if (t.gridY !== s.gridY + sign) {
            vLineOnControlMatrix(t.gridX, s.gridY + sign, t.gridY, s.id, t.id, controlMatrix, format);
        }
    }
}

function hLineOnControlMatrix(y: number, start: number, end: number, sId: string, eId: string, controlMatrix: ControlMatrix, format: Format['_name'], containStart: boolean = true, containEnd: boolean = true): void {
    if (start === end) {
        return;
    }
    start = Math.round(start);
    end = Math.round(end);
    const step = Math.sign(end - start);
    const inDirection = step > 0 ? 'left' : 'right';
    const outDirection = step < 0 ? 'left' : 'right';
    if (containStart) {
        drawSemiLineOnControlMatrix(controlMatrix, start, y, format, outDirection, undefined, eId);
    }
    for (let i = start + step; i !== end; i += step) {
        drawSemiLineOnControlMatrix(controlMatrix, i, y, format, inDirection, sId, undefined);
        drawSemiLineOnControlMatrix(controlMatrix, i, y, format, outDirection, undefined, eId);
    }
    if (containEnd) {
        drawSemiLineOnControlMatrix(controlMatrix, end, y, format, inDirection, sId, undefined);
    }
}

function vLineOnControlMatrix(x: number, start: number, end: number, sId: string, eId: string, controlMatrix: ControlMatrix, format: Format['_name'], containStart: boolean = true, containEnd: boolean = true): void {
    if (start === end) {
        return;
    }
    start = Math.round(start);
    end = Math.round(end);
    const step = Math.sign(end - start);
    const inDirection = step > 0 ? 'up' : 'down';
    const outDirection = step < 0 ? 'up' : 'down';
    if (containStart) {
        drawSemiLineOnControlMatrix(controlMatrix, x, start, format, outDirection, undefined, eId);
    }
    for (let i = start + step; i !== end; i += step) {
        drawSemiLineOnControlMatrix(controlMatrix, x, i, format, inDirection, sId, undefined);
        drawSemiLineOnControlMatrix(controlMatrix, x, i, format, outDirection, undefined, eId);
    }
    if (containEnd) {
        drawSemiLineOnControlMatrix(controlMatrix, x, end, format, inDirection, sId, undefined);
    }
}

function drawSemiLineOnControlMatrix(controlMatrix: ControlMatrix, x: number, y: number, format: Format['_name'], direction: Exclude<Format['_name'], 'center'>, inId: string | undefined, outId: string | undefined): void {
    if (format === 'down') {
        direction = direction === 'up' ? 'down' : direction === 'down' ? 'up' : direction;
    } else if (format === 'left') {
        direction = direction === 'up' ? 'left' : direction === 'down' ? 'right' : direction === 'left' ? 'up' : 'down';
    } else if (format === 'right') {
        direction = direction === 'up' ? 'right' : direction === 'down' ? 'left' : direction === 'left' ? 'up' : 'down';
    }

    let xSet = controlMatrix[x];
    if (xSet === undefined) {
        controlMatrix[x] = xSet = {};
    }

    let item = xSet[y];
    if (item === undefined) {
        xSet[y] = item = { x, y };
    }

    let directionFolder = item[direction];
    if (directionFolder === undefined) {
        item[direction] = directionFolder = { in: {}, out: {} };
    }

    if (inId) {
        directionFolder.in[inId] = true;
    }

    if (outId) {
        directionFolder.out[outId] = true;
    }
}
