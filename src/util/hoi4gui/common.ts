import { NumberLike, Position, HOIPartial } from "../../hoiformat/schema";
import { NumberSize, UserError } from "../common";
import { StyleTable } from '../styletable';
import { Orientation, ComplexSize, Size, Margin } from "../../hoiformat/gui";

export interface ParentInfo {
    size: NumberSize;
    orientation: Orientation['_name'];
}

export interface RenderCommonOptions {
    id?: string;
    classNames?: string;
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

export function removeHtmlOptions<T>(options: T): { [K in Exclude<keyof T, 'id' | 'classNames'>]: T[K] } {
    const result = {...options} as any;
    delete result['id'];
    delete result['classNames'];
    return result;
}
