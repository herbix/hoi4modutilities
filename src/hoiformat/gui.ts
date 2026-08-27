import { Token } from './hoiparser';
import { NumberLike, Position, positionSchema, SchemaDef, StringIgnoreCase } from './schema';

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
    scrollbartype: ScrollbarType[];
    extendedscrollbartype: ExtendedScrollbarType[];
}

export interface ContainerWindowType {
    name: string;
    fullscreen: boolean;
    orientation: Orientation;
    origo: Orientation;
    position: Position;
    show_position: Position;
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
    editboxtype: EditBoxType[];
    overlappingelementsboxtype: OverlappingElementsBoxType[];
    dropdownboxtype: DropdownBoxType[];
    scrollbartype: ScrollbarType[];
    extendedscrollbartype: ExtendedScrollbarType[];
    smoothlistboxtype: SmoothListBoxType[];
    listboxtype: ListBoxType[];
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
    parent: string;
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

export interface EditBoxType {
    name: string;
    orientation: Orientation;
    position: Position;
    size: Size;
    bordersize: Position;
    font: string;
    text: string;
    format: Format;
    _index: number;
    _token: Token;
}

export interface OverlappingElementsBoxType {
    name: string;
    orientation: Orientation;
    position: Position;
    size: Size;
    format: Format;
    spacing: number;
    first_on_top: boolean;
    _index: number;
    _token: Token;
}

export interface SmoothListBoxType {
    name: string;
    orientation: Orientation;
    position: Position;
    size: Size;
    bordersize: Position;
    spacing: number;
    clipping: boolean;
    scrollbartype: string;
    _index: number;
    _token: Token;
}

export interface ListBoxType {
    name: string;
    orientation: Orientation;
    position: Position;
    size: Size;
    bordersize: Position;
    background: string;
    offset: Position;
    format: Format;
    spacing: number;
    horizontal: boolean;
    scrollbartype: string;
    _index: number;
    _token: Token;
}

export interface DropdownBoxType {
    name: string;
    orientation: Orientation;
    position: Position;
    size: Size;
    containerwindowtype: ContainerWindowType[];
    icontype: IconType[];
    instanttextboxtype: InstantTextBoxType[];
    buttontype: ButtonType[];
    editboxtype: EditBoxType[];
    expandbutton: ButtonType;
    expandedwindow: ContainerWindowType;
    _index: number;
    _token: Token;
}

export interface ScrollbarType {
    name: string;
    orientation: Orientation;
    position: Position;
    size: Size;
    horizontal: number;
    guibuttontype: ButtonType[];
    slider: string;
    track: string;
    leftbutton: string;
    rightbutton: string;
    _index: number;
    _token: Token;
}

export interface ExtendedScrollbarType {
    name: string;
    orientation: Orientation;
    origo: Orientation;
    position: Position;
    size: Size;
    background: Background;
    guibuttontype: ButtonType[];
    slider: ButtonType;
    track: ButtonType;
    decreasebutton: ButtonType;
    increasebutton: ButtonType;
    _index: number;
    _token: Token;
}

export interface GuiFile {
    guitypes: GuiTypes[];
}

const sizeSchema: SchemaDef<Size> = {
    width: 'numberlike',
    height: 'numberlike',
    x: 'numberlike',
    y: 'numberlike',
};

const marginSchema: SchemaDef<Margin> = {
    top: 'numberlike',
    left: 'numberlike',
    right: 'numberlike',
    bottom: 'numberlike',
};

const complexSizeSchema: SchemaDef<ComplexSize> = {
    ...sizeSchema,
    min: sizeSchema,
};

const backgroundSchema: SchemaDef<Background> = {
    name: 'string',
    spritetype: 'string',
    quadtexturesprite: 'string',
    position: positionSchema,
};

const gridBoxTypeSchema: SchemaDef<GridBoxType> = {
    name: 'string',
    orientation: 'stringignorecase',
    position: positionSchema,
    size: sizeSchema,
    slotsize: sizeSchema,
    background: backgroundSchema,
    format: 'stringignorecase',
};

const iconTypeSchema: SchemaDef<IconType> = {
    name: 'string',
    orientation: 'stringignorecase',
    position: positionSchema,
    centerposition: 'boolean',
    spritetype: 'string',
    quadtexturesprite: 'string',
    frame: 'number',
    scale: 'number',
};

const instantTextBoxTypeSchema: SchemaDef<InstantTextBoxType> = {
    name: 'string',
    orientation: 'stringignorecase',
    position: positionSchema,
    bordersize: positionSchema,
    maxwidth: 'numberlike',
    maxheight: 'numberlike',
    format: 'stringignorecase',
    font: 'string',
    text: 'string',
    vertical_alignment: 'string',
};

const buttonTypeSchema: SchemaDef<ButtonType> = {
    name: 'string',
    parent: 'string',
    spritetype: 'string',
    quadtexturesprite: 'string',
    position: positionSchema,
    orientation: 'stringignorecase',
    frame: 'number',
    text: 'string',
    buttontext: 'string',
    buttonfont: 'string',
    scale: 'number',
    centerposition: 'boolean',
};

const editBoxTypeSchema: SchemaDef<EditBoxType> = {
    name: 'string',
    orientation: 'stringignorecase',
    position: positionSchema,
    size: sizeSchema,
    bordersize: positionSchema,
    font: 'string',
    text: 'string',
    format: 'stringignorecase',
};

const overlappingElementsBoxTypeSchema: SchemaDef<OverlappingElementsBoxType> = {
    name: 'string',
    orientation: 'stringignorecase',
    position: positionSchema,
    size: sizeSchema,
    format: 'stringignorecase',
    spacing: 'number',
    first_on_top: 'boolean',
};

const smoothListBoxTypeSchema: SchemaDef<SmoothListBoxType> = {
    name: 'string',
    orientation: 'stringignorecase',
    position: positionSchema,
    size: sizeSchema,
    bordersize: positionSchema,
    spacing: 'number',
    clipping: 'boolean',
    scrollbartype: 'string',
};

const listBoxTypeSchema: SchemaDef<ListBoxType> = {
    name: 'string',
    orientation: 'stringignorecase',
    position: positionSchema,
    size: sizeSchema,
    bordersize: positionSchema,
    background: 'string',
    offset: positionSchema,
    format: 'stringignorecase',
    spacing: 'number',
    horizontal: 'boolean',
    scrollbartype: 'string',
};

const dropdownBoxTypeSchema: SchemaDef<DropdownBoxType> = {
    name: 'string',
    orientation: 'stringignorecase',
    position: positionSchema,
    size: sizeSchema,
    containerwindowtype: {
        _innerType: undefined as any,
        _type: 'array',
    },
    icontype: {
        _innerType: iconTypeSchema,
        _type: 'array',
    },
    instanttextboxtype: {
        _innerType: instantTextBoxTypeSchema,
        _type: 'array',
    },
    buttontype: {
        _innerType: buttonTypeSchema,
        _type: 'array',
    },
    editboxtype: {
        _innerType: editBoxTypeSchema,
        _type: 'array',
    },
    expandbutton: buttonTypeSchema,
    expandedwindow: undefined as any,
};

const scrollbarTypeSchema: SchemaDef<ScrollbarType> = {
    name: 'string',
    orientation: 'stringignorecase',
    position: positionSchema,
    size: sizeSchema,
    horizontal: 'number',
    guibuttontype: {
        _innerType: buttonTypeSchema,
        _type: 'array',
    },
    slider: 'string',
    track: 'string',
    leftbutton: 'string',
    rightbutton: 'string',
};

const extendedScrollbarTypeSchema: SchemaDef<ExtendedScrollbarType> = {
    name: 'string',
    orientation: 'stringignorecase',
    origo: 'stringignorecase',
    position: positionSchema,
    size: sizeSchema,
    background: backgroundSchema,
    guibuttontype: {
        _innerType: buttonTypeSchema,
        _type: 'array',
    },
    slider: buttonTypeSchema,
    track: buttonTypeSchema,
    decreasebutton: buttonTypeSchema,
    increasebutton: buttonTypeSchema,
};

const containerWindowTypeSchema: SchemaDef<ContainerWindowType> = {
    name: 'string',
    fullscreen: 'boolean',
    orientation: 'stringignorecase',
    origo: 'stringignorecase',
    position: positionSchema,
    show_position: positionSchema,
    size: complexSizeSchema,
    margin: marginSchema,
    background: backgroundSchema,
    containerwindowtype: {
        _innerType: undefined as any,
        _type: 'array',
    },
    windowtype: {
        _innerType: undefined as any,
        _type: 'array',
    },
    gridboxtype: {
        _innerType: gridBoxTypeSchema,
        _type: 'array',
    },
    icontype: {
        _innerType: iconTypeSchema,
        _type: 'array',
    },
    instanttextboxtype: {
        _innerType: instantTextBoxTypeSchema,
        _type: 'array',
    },
    textboxtype: {
        _innerType: instantTextBoxTypeSchema,
        _type: 'array',
    },
    buttontype: {
        _innerType: buttonTypeSchema,
        _type: 'array',
    },
    checkboxtype: {
        _innerType: buttonTypeSchema,
        _type: 'array',
    },
    guibuttontype: {
        _innerType: buttonTypeSchema,
        _type: 'array',
    },
    editboxtype: {
        _innerType: editBoxTypeSchema,
        _type: 'array',
    },
    overlappingelementsboxtype: {
        _innerType: overlappingElementsBoxTypeSchema,
        _type: 'array',
    },
    dropdownboxtype: {
        _innerType: dropdownBoxTypeSchema,
        _type: 'array',
    },
    scrollbartype: {
        _innerType: scrollbarTypeSchema,
        _type: 'array',
    },
    extendedscrollbartype: {
        _innerType: extendedScrollbarTypeSchema,
        _type: 'array',
    },
    smoothlistboxtype: {
        _innerType: smoothListBoxTypeSchema,
        _type: 'array',
    },
    listboxtype: {
        _innerType: listBoxTypeSchema,
        _type: 'array',
    },
};

containerWindowTypeSchema.containerwindowtype._innerType = containerWindowTypeSchema;
containerWindowTypeSchema.windowtype._innerType = containerWindowTypeSchema;
dropdownBoxTypeSchema.containerwindowtype._innerType = containerWindowTypeSchema;
dropdownBoxTypeSchema.expandedwindow = containerWindowTypeSchema;

const guiTypesSchema: SchemaDef<GuiTypes> = {
    containerwindowtype: {
        _innerType: containerWindowTypeSchema,
        _type: 'array',
    },
    windowtype: {
        _innerType: containerWindowTypeSchema,
        _type: 'array',
    },
    scrollbartype: {
        _innerType: scrollbarTypeSchema,
        _type: 'array',
    },
    extendedscrollbartype: {
        _innerType: extendedScrollbarTypeSchema,
        _type: 'array',
    },
};

export const guiFileSchema: SchemaDef<GuiFile> = {
    guitypes: {
        _innerType: guiTypesSchema,
        _type: 'array',
    },
};

