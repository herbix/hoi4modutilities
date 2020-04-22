import { NumberLike, Position, Margin, ComplexSize, HOIPartial, Size, Orientation } from "../../hoiformat/schema";

export interface NumberSize {
    width: number;
    height: number;
}

export interface NumberPosition {
    x: number;
    y: number;
}

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

export function renderImage(position: NumberPosition, size: NumberSize, image: string, options?: RenderCommonOptions): string {
    return `<div
    ${options?.id ? `id="${options.id}"` : ''}
    ${options?.classNames ? `class="${options.classNames}"` : ''}
    style="
        position: absolute;
        left: ${position.x}px;
        top: ${position.y}px;
        width: ${size.width}px;
        height: ${size.height}px;
        background-image: url(${image});
        background-size: ${size.width}px ${size.height}px;
    "></div>`;
}

export function removeHtmlOptions<T>(options: T): { [K in Exclude<keyof T, 'id' | 'classNames'>]: T[K] } {
    const result = {...options} as any;
    delete result['id'];
    delete result['classNames'];
    return result;
}
