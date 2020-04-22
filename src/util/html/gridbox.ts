import { GridBoxType, HOIPartial, Format } from "../../hoiformat/schema";
import { ParentInfo, calculateBBox, normalizeNumberLike, NumberSize, NumberPosition, RenderCommonOptions } from "./common";

export type GridBoxConnectionType = 'child' | 'parent' | 'related';

export interface GridBoxConnection {
    target: string;
    style: string;
    targetType: GridBoxConnectionType;
    classNames?: string;
}

export interface GridBoxItem {
    id: string;
    gridX: number;
    gridY: number;
    connections: GridBoxConnection[];
    htmlId?: string;
    classNames?: string;
}

export interface RenderGridBoxOptions extends RenderCommonOptions {
    items: Record<string, GridBoxItem>;
    onRenderItem?(item: GridBoxItem, parentInfo: ParentInfo): Promise<string>;
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

    const renderedConnections = Object.values(options.items).map(item => {
        return (item.connections.map(conn => {
            const target = options.items[conn.target];
            if (!target) {
                return '';
            }

            const itemPosition = getCenterPosition(item.gridX, item.gridY, format, slotSize, size);
            const targetPosition = getCenterPosition(target.gridX, target.gridY, format, slotSize, size);
            return renderGridBoxConnection(itemPosition, targetPosition, conn.style, conn.targetType, format, slotSize, conn.classNames, cornerPosition);
        })).join('');
    });

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
        ${renderedConnections.join('')}
        ${renderedItems.join('')}
    </div>`;
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
                "></div><div
                ${classNames ? `class="${classNames}"` : ''}
                style="
                    position:absolute;
                    left: ${Math.min(b.x, a.x + cornerWidth * Math.sign(bx))}px;
                    top: ${Math.min(a.y, b.y)}px;
                    width: ${Math.abs(bx) - cornerWidth}px;
                    height: ${Math.abs(by)}px;
                    ${by > 0 ? 'border-bottom' : 'border-top'}: ${style};
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
                "></div><div
                ${classNames ? `class="${classNames}"` : ''}
                style="
                    position:absolute;
                    left: ${Math.min(a.x, b.x)}px;
                    top: ${Math.min(b.y, a.y + cornerHeight * Math.sign(by))}px;
                    width: ${Math.abs(bx)}px;
                    height: ${Math.abs(by) - cornerHeight}px;
                    ${bx > 0 ? 'border-right' : 'border-left'}: ${style};
                "></div>`;
        }
    }

}

