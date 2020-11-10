import { NumberLike, Position, HOIPartial, parseNumberLike } from "../../hoiformat/schema";
import { Sprite } from "../image/imagecache";
import { NumberSize, NumberPosition, UserError } from "../common";
import { CorneredTileSprite } from "../image/sprite";
import { StyleTable } from '../styletable';
import { Orientation, ComplexSize, Size, Margin, Background } from "../../hoiformat/gui";

export interface ParentInfo {
    size: NumberSize;
    orientation: Orientation['_name'];
}

export interface RenderCommonOptions {
    id?: string;
    classNames?: string;
    getSprite?(sprite: string, callerType: 'bg' | 'icon', callerName: string | undefined): Promise<Sprite | undefined>;
    styleTable: StyleTable;
}

export function normalizeNumberLike(value: NumberLike, parentValue: number, subtractValue?: number): number;
export function normalizeNumberLike(value: undefined, parentValue: number, subtractValue?: number): undefined;
export function normalizeNumberLike(value: NumberLike | undefined, parentValue: number, subtractValue?: number): number | undefined;
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
    'upper_center': { x: 0.5, y: 0 },
    'upper_right': { x: 1, y: 0 },
    'lower_left': { x: 0, y: 1 },
    'lower_center': { x: 0.5, y: 1 },
    'lower_right': { x: 1, y: 1 },
    'center_up': { x: 0.5, y: 0 },
    'center_down': { x: 0.5, y: 1 },
    'center_left': { x: 0, y: 0.5 },
    'center_right': { x: 1, y: 0.5 },
    'center_middle': { x: 0.5, y: 0.5 },
    'center': { x: 0.5, y: 0.5 },
    'left': { x: 0, y: 0.5 },
    'right': { x: 1, y: 0.5 },
    'up': { x: 0.5, y: 0 },
    'down': { x: 0.5, y: 1 },
    'top': { x: 0.5, y: 0 },
    'bottom': { x: 0.5, y: 1 },
};

export function calculateStartLength(pos: NumberLike | undefined, size: NumberLike | undefined, parentSize: number, orientationFactor: number, origoFactor: number): [number, number] {
    if (size?._unit !== '%%') {
        // length mode
        const baseStart = (normalizeNumberLike(pos, parentSize) ?? 0) + parentSize * orientationFactor;
        const length = Math.max(0, normalizeNumberLike(size, parentSize) ?? 0);
        const realStart = baseStart - length * origoFactor;
        return [realStart, length];

    } else {
        // end mode
        const baseStart = (normalizeNumberLike(pos, parentSize) ?? 0) + parentSize * orientationFactor;
        const end = normalizeNumberLike(size, parentSize);

        // not valid
        if (origoFactor === 1) {
            return [baseStart, 0];
        }

        // resolved from: realStart = baseStart - Math.max(0, end - realStart) * origoFactor
        const realStart = (baseStart - end * origoFactor) / (1 - origoFactor);
        const length = Math.max(0, end - realStart);
        return [realStart, length];
    }
}

export function calculateBBox(
    {orientation, origo, position, size}: {
        orientation?: Orientation,
        origo?: Orientation,
        position?: Partial<Position>,
        size?: HOIPartial<ComplexSize> | Partial<Size & {min: undefined}>,
    },
    parentInfo: ParentInfo
): [number, number, number, number, Orientation['_name']] {
    const myOrientation = orientation?._name ?? parentInfo.orientation;
    const parentSize = parentInfo.size;
    const orientationFactor = offsetMap[myOrientation];
    const origoFactor = offsetMap[origo?._name ?? 'upper_left'];

    if (!orientationFactor) {
        throw new UserError('Unknown orientation value: ' + myOrientation);
    }

    if (!origoFactor) {
        throw new UserError('Unknown orientation value: ' + origo?._name);
    }

    let [x, width] = calculateStartLength(position?.x, size?.width, parentSize.width, orientationFactor.x, origoFactor.x);
    let [y, height] = calculateStartLength(position?.y, size?.height, parentSize.height, orientationFactor.y, origoFactor.y);

    const minWidth = normalizeNumberLike(size?.min?.width, parentSize.width, x) ?? width;
    const minHeight = normalizeNumberLike(size?.min?.height, parentSize.height, y) ?? height;
    width = Math.max(minWidth, width);
    height = Math.max(minHeight, height);

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

export function renderSprite(position: NumberPosition, size: NumberSize, sprite: Sprite, frame: number, options: RenderCommonOptions): string {
    if (sprite instanceof CorneredTileSprite) {
        return renderCorneredTileSprite(position, size, sprite, frame, options);
    }

    return `<div
    ${options?.id ? `id="${options.id}"` : ''}
    class="
        ${options?.classNames ? options.classNames : ''}
        ${options.styleTable.style('positionAbsolute', () => `position: absolute;`)}
        ${options.styleTable.oneTimeStyle('sprite', () => `
            left: ${position.x}px;
            top: ${position.y}px;
            width: ${sprite.width}px;
            height: ${sprite.height}px;
        `)}
        ${options.styleTable.style(`sprite-img-${sprite.id}-${frame}`, () => `
            background-image: url(${sprite.frames[frame]?.uri});
            background-size: ${sprite.width}px ${sprite.height}px;
        `)}
    "></div>`;
}

export function renderCorneredTileSprite(position: NumberPosition, size: NumberSize, sprite: CorneredTileSprite, frame: number, options: RenderCommonOptions): string {
    const sizeX = size.width;
    const sizeY = size.height;
    let borderX = sprite.borderSize.x;
    let borderY = sprite.borderSize.y;
    const xPos = borderX * 2 > sizeX ? [0, sizeX / 2, sizeX / 2, sizeX] : [0, borderX, sizeX - borderX, sizeX];
    const yPos = borderY * 2 > sizeY ? [0, sizeY / 2, sizeY / 2, sizeY] : [0, borderY, sizeY - borderY, sizeY];
    const divs: string[] = [];
    const tiles = sprite.getTiles(frame);

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
            class="
                ${options.styleTable.style('positionAbsolute', () => `position: absolute;`)}
                ${options.styleTable.oneTimeStyle('corneredtilesprite-tile', () => `
                    left: ${left}px;
                    top: ${top}px;
                    width: ${width}px;
                    height: ${height}px;
                `)}
                ${options.styleTable.style(`corneredtilesprite-img-${sprite.id}-${frame}-${x}-${y}`, () => `
                    background: url(${tile.uri});
                    background-size: ${tile.width}px ${tile.height}px;
                    background-repeat: repeat;
                    background-position: ${x === 2 ? 'right' : 'left'} ${y === 2 ? 'bottom' : 'top'};
                `)}
            "></div>
            `);
        }
    }

    return `<div
    ${options?.id ? `id="${options.id}"` : ''}
    class="
        ${options?.classNames ? options.classNames : ''}
        ${options.styleTable.style('positionAbsolute', () => `position: absolute;`)}
        ${options.styleTable.oneTimeStyle('corneredtilesprite', () => `
            left: ${position.x}px;
            top: ${position.y}px;
            width: ${size.width}px;
            height: ${size.height}px;
        `)}
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

export async function renderBackground(background: HOIPartial<Background> | undefined, parentInfo: ParentInfo, commonOptions: RenderCommonOptions): Promise<string> {
    if (background === undefined) {
        return '';
    }

    const backgroundSpriteName = background?.spritetype ?? background?.quadtexturesprite;
    const backgroundSprite = backgroundSpriteName && commonOptions.getSprite ? await commonOptions.getSprite(backgroundSpriteName, 'bg', background?.name) : undefined;

    if (backgroundSprite === undefined) {
        return '';
    }

    const [x, y, width, height] = calculateBBox({
        position: background.position,
        size: { width: parseNumberLike('100%%'), height: parseNumberLike('100%%') }
    }, parentInfo);
    
    return renderSprite({ x, y }, { width, height }, backgroundSprite, 0, commonOptions);
}
