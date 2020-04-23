import { NumberLike, Position, Margin, ComplexSize, HOIPartial, Size, Orientation } from "../../hoiformat/schema";
import { Sprite } from "../image/imagecache";
import { NumberSize, NumberPosition } from "../common";
import { CorneredTileSprite } from "../image/sprite";

export interface ParentInfo {
    size: NumberSize;
    orientation: Orientation['_name'];
}

export interface RenderCommonOptions {
    id?: string;
    classNames?: string;
}

export function normalizeNumberLike(value: NumberLike | undefined, parentValue: number, subtractValue: number = 0): number | undefined {
    if (!value) {
        return undefined;
    }

    switch (value._unit) {
        case '%': return value._value / 100.0 * parentValue;
        case '%%': return Math.max(0, value._value / 100.0 * parentValue - subtractValue);
        default: return value._value;
    }
}

const offsetMap: Record<Orientation['_name'], { x: number, y: number }> = {
    'upper_left': { x: 0, y: 0 },
    'upper_right': { x: 1, y: 0 },
    'lower_left': { x: 0, y: 1 },
    'lower_right': { x: 1, y: 1 },
    'center_up': { x: 0.5, y: 0 },
    'center_down': { x: 0.5, y: 1 },
    'center_left': { x: 0, y: 0.5 },
    'center_right': { x: 1, y: 0.5 },
    'center_middle': { x: 0.5, y: 0.5 },
    'center': { x: 0.5, y: 0.5 },
    'left': { x: 0, y: 0.5 },
    'right': { x: 1, y: 0.5 },
};

export function calculateBBox({orientation, origo, position, size}: {
    orientation?: Orientation,
    origo?: Orientation,
    position?: Partial<Position>,
    size?: HOIPartial<ComplexSize> | Partial<Size & {min: undefined}>,
},
    parentInfo: ParentInfo
): [number, number, number, number, Orientation['_name']] {
    const myOrientation = orientation?._name ?? parentInfo.orientation;
    const parentSize = parentInfo.size;
    const offset = offsetMap[myOrientation];
    let x = (normalizeNumberLike(position?.x, parentSize.width) ?? 0) + parentSize.width * offset.x;
    let y = (normalizeNumberLike(position?.y, parentSize.height) ?? 0) + parentSize.height * offset.y;
    let width = normalizeNumberLike(size?.width, parentSize.width, x) ?? 0;
    let height = normalizeNumberLike(size?.height, parentSize.height, y) ?? 0;
    const minWidth = normalizeNumberLike(size?.min?.width, parentSize.width, x) ?? width;
    const minHeight = normalizeNumberLike(size?.min?.height, parentSize.height, y) ?? height;
    width = Math.max(minWidth, width);
    height = Math.max(minHeight, height);

    // TODO better calculation for origo with 90%%
    if (origo) {
        const origoOffset = offsetMap[origo._name];
        x -= width * origoOffset.x;
        y -= height * origoOffset.y;
    }

    return [x, y, width, height, myOrientation];
}

export function normalizeMargin(margin: Partial<Margin> | undefined, size: NumberSize): [number, number, number, number] {
    return [
        normalizeNumberLike(margin?.top, size.height) ?? 0,
        normalizeNumberLike(margin?.right, size.width) ?? 0,
        normalizeNumberLike(margin?.bottom, size.height) ?? 0,
        normalizeNumberLike(margin?.left, size.width) ?? 0,
    ];
}

export function renderSprite(position: NumberPosition, size: NumberSize, sprite: Sprite, options?: RenderCommonOptions): string {
    if (sprite instanceof CorneredTileSprite) {
        return renderCorneredTileSprite(position, size, sprite, options);
    }

    return `<div
    ${options?.id ? `id="${options.id}"` : ''}
    ${options?.classNames ? `class="${options.classNames}"` : ''}
    style="
        position: absolute;
        left: ${position.x}px;
        top: ${position.y}px;
        width: ${sprite.width}px;
        height: ${sprite.height}px;
        background-image: url(${sprite.frames[0].uri});
        background-size: ${sprite.width}px ${sprite.height}px;
    "></div>`;
}

export function renderCorneredTileSprite(position: NumberPosition, size: NumberSize, sprite: CorneredTileSprite, options?: RenderCommonOptions): string {
    const sizeX = size.width;
    const sizeY = size.height;
    let borderX = sprite.borderSize.x;
    let borderY = sprite.borderSize.y;
    const xPos = borderX * 2 > sizeX ? [0, sizeX / 2, sizeX / 2, sizeX] : [0, borderX, sizeX - borderX, sizeX];
    const yPos = borderY * 2 > sizeY ? [0, sizeY / 2, sizeY / 2, sizeY] : [0, borderY, sizeY - borderY, sizeY];
    const divs: string[] = [];
    const tiles = sprite.getTiles(0);

    for (let y = 0; y < 3; y++) {
        const height = yPos[y + 1] - yPos[y];
        if (height <= 0) {
            continue;
        }
        const top = yPos[y];
        for (let x = 0; x < 3; x++) {
            const width = xPos[x + 1] - xPos[x];
            if (width <= 0 || height <= 0) {
                continue;
            }
            const left = xPos[x];
            const tileIndex = y * 3 + x;
            const tile = tiles[tileIndex];
            divs.push(`<div
            style="
                position: absolute;
                left: ${left}px;
                top: ${top}px;
                width: ${width}px;
                height: ${height}px;
                background: url(${tile.uri});
                background-size: ${tile.width}px ${tile.height}px;
                background-repeat: repeat;
                background-position: ${x === 2 ? 'right' : 'left'} ${y === 2 ? 'bottom' : 'top'};
            "></div>
            `);
        }
    }

    return `<div
    ${options?.id ? `id="${options.id}"` : ''}
    ${options?.classNames ? `class="${options.classNames}"` : ''}
    style="
        position: absolute;
        left: ${position.x}px;
        top: ${position.y}px;
        width: ${size.width}px;
        height: ${size.height}px;
    ">
        ${divs.join('')}
    </div>`;
}

export function removeHtmlOptions<T>(options: T): { [K in Exclude<keyof T, 'id' | 'classNames'>]: T[K] } {
    const result = {...options} as any;
    delete result['id'];
    delete result['classNames'];
    return result;
}
