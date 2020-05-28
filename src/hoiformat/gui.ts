import { NumberLike, SchemaDef, positionSchema, Position, StringAsSymbolIgnoreCase } from "./schema";

export interface Size {
    width: NumberLike;
    height: NumberLike;
}

export interface ComplexSize extends Size {
    min: Size;
}

export interface Margin {
    top: NumberLike;
    left: NumberLike;
    right: NumberLike;
    bottom: NumberLike;
}

export type Format = StringAsSymbolIgnoreCase<'left' | 'right' | 'up' | 'down' | 'center'>;
export type Orientation = StringAsSymbolIgnoreCase<
    'upper_left' | 'upper_right' |
    'lower_left' | 'lower_right' |
    'center_up' | 'center_down' | 'center_left' | 'center_right' | 'center_middle' | 'center' |
    'left' | 'right' 
>;

export interface Background {
    name: string;
    spritetype: string;
    quadtexturesprite: string;
    position: Position;
}

export interface GuiTypes {
    containerwindowtype: ContainerWindowType[];
}

export interface ContainerWindowType {
    name: string;
    orientation: Orientation;
    origo: Orientation;
    position: Position;
    size: ComplexSize;
    margin: Margin;
    background: Background;
    containerwindowtype: ContainerWindowType[];
    gridboxtype: GridBoxType[];
    icontype: IconType[];
    instanttextboxtype: InstantTextBoxType[];
    _index: number;
}

export interface GridBoxType {
    name: string;
    orientation: Orientation;
    position: Position;
    size: Size;
    background: Background;
    slotsize: Size;
    format: Format;
    _index: number;
}

export interface IconType {
    name: string;
    orientation: Orientation;
    position: Position;
    centerposition: boolean;
    spritetype: string;
    quadtexturesprite: string;
    frame: number;
    _index: number;
}

export interface InstantTextBoxType {
    name: string;
    orientation: Orientation;
    position: Position;
    bordersize: Position;
    maxwidth: NumberLike;
    maxheight: NumberLike;
    font: string;
    text: string;
    format: Format;
    _index: number;
}

export interface GuiFile {
    guitypes: GuiTypes[];
}

const sizeSchema: SchemaDef<Size> = {
    width: "numberlike",
    height: "numberlike",
};

const marginSchema: SchemaDef<Margin> = {
    top: "numberlike",
    left: "numberlike",
    right: "numberlike",
    bottom: "numberlike",
};

const complexSizeSchema: SchemaDef<ComplexSize> = {
    ...sizeSchema,
    min: sizeSchema,
};

const backgroundSchema: SchemaDef<Background> = {
    name: "string",
    spritetype: "string",
    quadtexturesprite: "string",
    position: positionSchema,
};

const gridBoxTypeSchema: SchemaDef<GridBoxType> = {
    name: "string",
    orientation: "stringassymbolignorecase",
    position: positionSchema,
    size: sizeSchema,
    slotsize: sizeSchema,
    background: backgroundSchema,
    format: "stringassymbolignorecase",
};

const iconTypeSchema: SchemaDef<IconType> = {
    name: "string",
    orientation: "stringassymbolignorecase",
    position: positionSchema,
    centerposition: 'boolean',
    spritetype: "string",
    quadtexturesprite: "string",
    frame: "number",
};

const instantTextBoxTypeSchema: SchemaDef<InstantTextBoxType> = {
    name: "string",
    orientation: "stringassymbolignorecase",
    position: positionSchema,
    bordersize: positionSchema,
    maxwidth: "numberlike",
    maxheight: "numberlike",
    format: "stringassymbolignorecase",
    font: "string",
    text: "string",
};

const containerWindowTypeSchema: SchemaDef<ContainerWindowType> = {
    name: "string",
    orientation: "stringassymbolignorecase",
    origo: "stringassymbolignorecase",
    position: positionSchema,
    size: complexSizeSchema,
    margin: marginSchema,
    background: backgroundSchema,
    containerwindowtype: {
        _innerType: undefined as any,
        _type: "array",
    },
    gridboxtype: {
        _innerType: gridBoxTypeSchema,
        _type: "array",
    },
    icontype: {
        _innerType: iconTypeSchema,
        _type: "array",
    },
    instanttextboxtype: {
        _innerType: instantTextBoxTypeSchema,
        _type: "array",
    }
};

containerWindowTypeSchema.containerwindowtype._innerType = containerWindowTypeSchema;

const guiTypesSchema: SchemaDef<GuiTypes> = {
    containerwindowtype: {
        _innerType: containerWindowTypeSchema,
        _type: "array",
    },
};

export const guiFileSchema: SchemaDef<GuiFile> = {
    guitypes: {
        _innerType: guiTypesSchema,
        _type: "array",
    },
};

