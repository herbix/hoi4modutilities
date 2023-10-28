import { Token } from "./hoiparser";
import { NumberLike, SchemaDef, positionSchema, Position, StringIgnoreCase } from "./schema";

export interface Size {
    width: NumberLike;
    height: NumberLike;
    x: NumberLike;
    y: NumberLike;
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

export type Format = StringIgnoreCase<'left' | 'right' | 'up' | 'down' | 'center'>;
export type Orientation = StringIgnoreCase<
    'upper_left' | 'upper_right' | 'lower_left' | 'lower_right' |
    'center_up' | 'center_down' | 'center_left' | 'center_right' | 'center'
>;

export interface Background {
    name: string;
    spritetype: string;
    quadtexturesprite: string;
    position: Position;
}

export interface GuiTypes {
    containerwindowtype: ContainerWindowType[];
    windowtype: ContainerWindowType[];
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
    windowtype: ContainerWindowType[];
    gridboxtype: GridBoxType[];
    icontype: IconType[];
    instanttextboxtype: InstantTextBoxType[];
    textboxtype: InstantTextBoxType[];
    buttontype: ButtonType[];
    checkboxtype: ButtonType[];
    guibuttontype: ButtonType[];
    _index: number;
    _token: Token;
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
    _token: Token;
}

export interface IconType {
    name: string;
    orientation: Orientation;
    position: Position;
    centerposition: boolean;
    spritetype: string;
    quadtexturesprite: string;
    frame: number;
    scale: number;
    _index: number;
    _token: Token;
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
    vertical_alignment: string;
    _index: number;
    _token: Token;
}

export interface ButtonType {
    name: string;
    orientation: Orientation;
    position: Position;
    spritetype: string;
    quadtexturesprite: string;
    frame: number;
    text: string;
    buttontext: string;
    buttonfont: string;
    scale: number;
    centerposition: boolean;
    _index: number;
    _token: Token;
}

export interface GuiFile {
    guitypes: GuiTypes[];
}

const sizeSchema: SchemaDef<Size> = {
    width: "numberlike",
    height: "numberlike",
    x: "numberlike",
    y: "numberlike",
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
    orientation: "stringignorecase",
    position: positionSchema,
    size: sizeSchema,
    slotsize: sizeSchema,
    background: backgroundSchema,
    format: "stringignorecase",
};

const iconTypeSchema: SchemaDef<IconType> = {
    name: "string",
    orientation: "stringignorecase",
    position: positionSchema,
    centerposition: 'boolean',
    spritetype: "string",
    quadtexturesprite: "string",
    frame: "number",
    scale: "number",
};

const instantTextBoxTypeSchema: SchemaDef<InstantTextBoxType> = {
    name: "string",
    orientation: "stringignorecase",
    position: positionSchema,
    bordersize: positionSchema,
    maxwidth: "numberlike",
    maxheight: "numberlike",
    format: "stringignorecase",
    font: "string",
    text: "string",
    vertical_alignment: "string",
};

const buttonTypeSchema: SchemaDef<ButtonType> = {
    name: "string",
    spritetype: "string",
    quadtexturesprite: "string",
    position: positionSchema,
    orientation: "stringignorecase",
    frame: "number",
    text: "string",
    buttontext: "string",
    buttonfont: "string",
    scale: "number",
    centerposition: 'boolean',
};

const containerWindowTypeSchema: SchemaDef<ContainerWindowType> = {
    name: "string",
    orientation: "stringignorecase",
    origo: "stringignorecase",
    position: positionSchema,
    size: complexSizeSchema,
    margin: marginSchema,
    background: backgroundSchema,
    containerwindowtype: {
        _innerType: undefined as any,
        _type: "array",
    },
    windowtype: {
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
    },
    textboxtype: {
        _innerType: instantTextBoxTypeSchema,
        _type: "array",
    },
    buttontype: {
        _innerType: buttonTypeSchema,
        _type: "array",
    },
    checkboxtype: {
        _innerType: buttonTypeSchema,
        _type: "array",
    },
    guibuttontype: {
        _innerType: buttonTypeSchema,
        _type: "array",
    },
};

containerWindowTypeSchema.containerwindowtype._innerType = containerWindowTypeSchema;
containerWindowTypeSchema.windowtype._innerType = containerWindowTypeSchema;

const guiTypesSchema: SchemaDef<GuiTypes> = {
    containerwindowtype: {
        _innerType: containerWindowTypeSchema,
        _type: "array",
    },
    windowtype: {
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

