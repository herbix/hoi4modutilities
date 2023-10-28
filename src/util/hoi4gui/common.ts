import { NumberLike, Position, HOIPartial } from "../../hoiformat/schema";
import { NumberSize } from "../common";
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
    enableNavigator?: boolean;
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
        case '%%': return value._value / 100.0 * parentValue - subtractValue;
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
    'center': { x: 0.5, y: 0.5 },
};

export function calculateStartLength(pos: NumberLike | undefined, size: NumberLike | undefined, parentSize: number, orientationFactor: number, origoFactor: number, scale: number): [number, number] {
    let posValue = normalizeNumberLike(pos, parentSize) ?? 0;
    let length = (normalizeNumberLike(size, parentSize) ?? 0) * scale;
    if (size?._unit === '%%') {
        length = length - posValue;
    }
    if (length < 0) {
        length = length + parentSize;
    }

    const start = posValue + parentSize * orientationFactor - length * origoFactor;
    if (size?._unit === '%%' || (size?._value ?? 0) < 0) {
        let end = normalizeNumberLike(size, parentSize) ?? 0;
        if (end < 0) {
            end = end + parentSize;
        }
        length = Math.max(0, end - start);
    }

    return [start, length];
}

export function calculateBBox(
    {orientation, origo, position, size, scale}: {
        orientation?: Orientation,
        origo?: Orientation,
        position?: Partial<Position>,
        size?: HOIPartial<ComplexSize> | Partial<Size & {min: undefined}>,
        scale?: number,
    },
    parentInfo: ParentInfo
): [number, number, number, number, Orientation['_name']] {
    const myOrientation = orientation?._name ?? 'upper_left';
    const parentSize = parentInfo.size;
    const orientationFactor = offsetMap[myOrientation] ?? offsetMap['upper_left'];
    const origoFactor = offsetMap[origo?._name ?? 'upper_left'] ?? offsetMap['upper_left'];

    let [x, width] = calculateStartLength(position?.x, getWidth(size), parentSize.width, orientationFactor.x, origoFactor.x, scale ?? 1);
    let [y, height] = calculateStartLength(position?.y, getHeight(size), parentSize.height, orientationFactor.y, origoFactor.y, scale ?? 1);

    const minWidth = normalizeNumberLike(getWidth(size?.min), parentSize.width, x) ?? width;
    const minHeight = normalizeNumberLike(getHeight(size?.min), parentSize.height, y) ?? height;
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

export function getWidth(size?: Partial<Size>): NumberLike | undefined {
    return size?.width ?? size?.x;
}

export function getHeight(size?: Partial<Size>): NumberLike | undefined {
    return size?.height ?? size?.y;
}
