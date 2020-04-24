import { GridBoxType, HOIPartial, Format } from "../../hoiformat/schema";
import { ParentInfo, calculateBBox, normalizeNumberLike, RenderCommonOptions, renderBackground } from "./common";
import { NumberSize, NumberPosition } from "../common";
import { Sprite } from "../image/sprite";

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

export interface RenderGridBoxOptions extends RenderCommonOptions {
    items: Record<string, GridBoxItem>;
    getSprite?(sprite: string, callerType: 'bg' | 'icon', callerName: string | undefined): Promise<Sprite | undefined>;
    onRenderItem?(item: GridBoxItem, parentInfo: ParentInfo): Promise<string>;
    onRenderLineBox?(item: GridBoxConnectionItem, parentInfo: ParentInfo): Promise<string>;
    lineRenderMode?: 'line' | 'control';
    cornerPosition?: number;
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

    const offset = offsetMap[format];
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

export async function renderGridBox(gridBox: HOIPartial<GridBoxType>, parentInfo: ParentInfo, options: RenderGridBoxOptions): Promise<string> {
    const [x, y, width, height, orientation] = calculateBBox(gridBox, parentInfo);
    const format = gridBox.format?._name ?? 'up';

    const size = { width, height };
    const xSlotSize = normalizeNumberLike(gridBox.slotsize?.width, 0) ?? 50;
    const ySlotSize = normalizeNumberLike(gridBox.slotsize?.height, 0) ?? 50;
    const slotSize = { width: xSlotSize, height: ySlotSize };
    const childrenParentInfo: ParentInfo = { size: slotSize, orientation };
    const cornerPosition = options.cornerPosition ?? 1;

    const background = await renderBackground(gridBox.background, { size, orientation }, options.getSprite);

    const renderedItems = await Promise.all(Object.values(options.items).map(async (item) => {
        const children = options.onRenderItem ? await options.onRenderItem(item, childrenParentInfo) : '';
        const position = getLeftUpPosition(item.gridX, item.gridY, format, slotSize, size);
        return `<div
            ${item.htmlId ? `id="${item.htmlId}"` : ''}
            ${item.classNames ? `class="${item.classNames}"` : ''}
            style="
                position: absolute;
                left: ${position.x}px;
                top: ${position.y}px;
                width: ${xSlotSize}px;
                height: ${ySlotSize}px;
            ">
                ${children}
            </div>`;
    }));

    const renderedConnections = options.lineRenderMode !== 'control' ?
        renderLineConnections(options.items, format, slotSize, size, cornerPosition) :
        await renderControlConnections(options.items, format, slotSize, size, options.onRenderLineBox, childrenParentInfo);

    return `<div
    ${options.id ? `id="${options.id}"` : ''}
    ${options.classNames ? `class="${options.classNames}"` : ''}
    style="
        position: absolute;
        left: ${x}px;
        top: ${y}px;
        width: ${width}px;
        height: ${height}px;
    ">
        ${background}
        ${renderedConnections}
        ${renderedItems.join('')}
    </div>`;
}

export function renderLineConnections(items: Record<string, GridBoxItem>, format: Format['_name'], slotSize: NumberSize, size: NumberSize, cornerPosition: number): string {
    return Object.values(items).map(item => 
        item.connections.map(conn => {
            const target = items[conn.target];
            if (!target) {
                return '';
            }

            const itemPosition = getCenterPosition(item.gridX, item.gridY, format, slotSize, size);
            const targetPosition = getCenterPosition(target.gridX, target.gridY, format, slotSize, size);
            return renderGridBoxConnection(itemPosition, targetPosition, conn.style ?? '', conn.targetType, format, slotSize, conn.classNames, cornerPosition);
        }).join('')
    ).join('');
}

export function renderGridBoxConnection(a: NumberPosition, b: NumberPosition, style: string, type: GridBoxConnectionType, format: Format['_name'], gridSize: NumberSize, classNames: string | undefined, cornerPosition: number = 1.5): string {
    if (a.y === b.y) {
        return `<div
            ${classNames ? `class="${classNames}"` : ''}
            style="
                position:absolute;
                left: ${Math.min(a.x, b.x)}px;
                top: ${a.y}px;
                width: ${Math.abs(a.x - b.x)}px;
                height: ${1}px;
                border-top: ${style};
                pointer-events: none;
            "></div>`;
    }
    if (a.x === b.x) {
        return `<div
            ${classNames ? `class="${classNames}"` : ''}
            style="
                position:absolute;
                left: ${a.x}px;
                top: ${Math.min(a.y, b.y)}px;
                width: ${1}px;
                height: ${Math.abs(a.y - b.y)}px;
                border-left: ${style};
                pointer-events: none;
            "></div>`;
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
            return `<div
                ${classNames ? `class="${classNames}"` : ''}
                style="
                    position:absolute;
                    left: ${Math.min(a.x, b.x)}px;
                    top: ${Math.min(a.y, b.y)}px;
                    width: ${Math.abs(bx)}px;
                    height: ${Math.abs(by)}px;
                    ${bx < 0 ? 'border-left' : 'border-right'}: ${style};
                    ${by < 0 ? 'border-bottom' : 'border-top'}: ${style};
                    pointer-events: none;
                "></div>`;
        } else {
            return `<div
                ${classNames ? `class="${classNames}"` : ''}
                style="
                    position:absolute;
                    left: ${Math.min(a.x, a.x + cornerWidth * Math.sign(bx))}px;
                    top: ${Math.min(a.y, b.y)}px;
                    width: ${cornerWidth}px;
                    height: ${Math.abs(by)}px;
                    ${bx < 0 ? 'border-left' : 'border-right'}: ${style};
                    ${by < 0 ? 'border-bottom' : 'border-top'}: ${style};
                    pointer-events: none;
                "></div><div
                ${classNames ? `class="${classNames}"` : ''}
                style="
                    position:absolute;
                    left: ${Math.min(b.x, a.x + cornerWidth * Math.sign(bx))}px;
                    top: ${Math.min(a.y, b.y)}px;
                    width: ${Math.abs(bx) - cornerWidth}px;
                    height: ${Math.abs(by)}px;
                    ${by > 0 ? 'border-bottom' : 'border-top'}: ${style};
                    pointer-events: none;
                "></div>`;
        }
    } else {
        const bx = b.x - a.x;
        const by = b.y - a.y;
        const cornerHeight = gridSize.height * cornerPosition;
        if (Math.abs(by) < cornerHeight) {
            return `<div
                ${classNames ? `class="${classNames}"` : ''}
                style="
                    position:absolute;
                    left: ${Math.min(a.x, b.x)}px;
                    top: ${Math.min(a.y, b.y)}px;
                    width: ${Math.abs(bx)}px;
                    height: ${Math.abs(by)}px;
                    ${bx > 0 ? 'border-left' : 'border-right'}: ${style};
                    ${by > 0 ? 'border-bottom' : 'border-top'}: ${style};
                    pointer-events: none;
                "></div>`;
        } else {
            return `<div
                ${classNames ? `class="${classNames}"` : ''}
                style="
                    position:absolute;
                    left: ${Math.min(a.x, b.x)}px;
                    top: ${Math.min(a.y, a.y + cornerHeight * Math.sign(by))}px;
                    width: ${Math.abs(bx)}px;
                    height: ${cornerHeight}px;
                    ${bx > 0 ? 'border-left' : 'border-right'}: ${style};
                    ${by > 0 ? 'border-bottom' : 'border-top'}: ${style};
                    pointer-events: none;
                "></div><div
                ${classNames ? `class="${classNames}"` : ''}
                style="
                    position:absolute;
                    left: ${Math.min(a.x, b.x)}px;
                    top: ${Math.min(b.y, a.y + cornerHeight * Math.sign(by))}px;
                    width: ${Math.abs(bx)}px;
                    height: ${Math.abs(by) - cornerHeight}px;
                    ${bx > 0 ? 'border-right' : 'border-left'}: ${style};
                    pointer-events: none;
                "></div>`;
        }
    }
}

type ControlMatrix = Record<number, Record<number, GridBoxConnectionItem>>;
async function renderControlConnections(
    items: Record<string, GridBoxItem>,
    format: Format['_name'],
    slotSize: NumberSize,
    size: NumberSize,
    onRenderLineBox: RenderGridBoxOptions['onRenderLineBox'],
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
        Object.values(controlMatrix).map(m => 
            Object.values(m).map(async (item) => {
                const children = onRenderLineBox ? await onRenderLineBox(item, childrenParentInfo) : '';
                const position = getLeftUpPosition(item.x, item.y, format, slotSize, size);
                return `<div
                    style="
                        position: absolute;
                        left: ${position.x}px;
                        top: ${position.y}px;
                        width: ${xSlotSize}px;
                        height: ${ySlotSize}px;
                    ">
                        ${children}
                    </div>`;
            })
        ).reduce((p, c) => p.concat(c), [])
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
