import { Node, Token, NodeValue, SymbolNode } from "./hoiparser";
import { NumberPosition } from "../util/common";

//#region Common
export interface TokenObject {
    _token: Token | undefined;
}

export interface CustomMap<T> extends TokenObject {
    _map: Record<string, { _key: string, _value: T }>;
}

export interface Enum extends TokenObject {
    _values: string[];
}

export interface CustomSymbol extends TokenObject {
    _name: string;
}

export interface StringAsSymbol<T extends string> extends TokenObject {
    _stringAsSymbol: true;
    _name: T;
}

export interface NumberLike extends TokenObject {
    _value: number;
    _unit: NumberUnit | undefined;
}

export type NumberUnit = '%' | '%%';

export type HOIPartial<T> =
    T extends Enum ? T :
    T extends undefined | string | number | CustomSymbol | StringAsSymbol<string> | NumberLike | boolean ? T | undefined :
    T extends CustomMap<infer T1> ? CustomMap<HOIPartial<T1>> :
    T extends (infer T1)[] ? HOIPartial<HOIPartial<T1>>[] :
    { [K in keyof T]:
        T[K] extends Enum ? T[K] :
        T[K] extends CustomMap<infer T1> ? CustomMap<HOIPartial<T1>> :
        T[K] extends (infer T1)[] ? HOIPartial<T1>[] :
        K extends ('_token' | '_index') ? T[K] | undefined :
        HOIPartial<T[K]> | undefined; };

type SchemaDef<T> =
    T extends boolean ? 'boolean' :
    T extends StringAsSymbol<string> ? 'stringassymbol' :
    T extends CustomSymbol ? 'symbol' :
    T extends string ? 'string' :
    T extends number ? 'number' :
    T extends NumberLike ? 'numberlike' :
    T extends Enum ? 'enum' :
    T extends CustomMap<infer T1> ? { _innerType: SchemaDef<T1>; _type: 'map'; } :
    T extends (infer B)[] ? { _innerType: SchemaDef<B>; _type: 'array'; } :
    { [K in Exclude<keyof T, '_token' | '_index'>]: SchemaDef<T[K]>; };

//#endregion

//#region Defs

//#region Common
export interface File {
    technologies: Technologies;
    focus_tree: FocusTree[];
    shared_focus: Focus[];
    spritetypes: SpriteTypes[];
    guitypes: GuiTypes[];
}

export interface Position {
    x: NumberLike;
    y: NumberLike;
}

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

export type Format = StringAsSymbol<'left' | 'right' | 'up' | 'down' | 'center'>;
export type Orientation = StringAsSymbol<
    'upper_left' | 'upper_right' |
    'lower_left' | 'lower_right' |
    'center_up' | 'center_down' | 'center_left' | 'center_right' | 'center_middle' | 'center' |
    'left' | 'right' 
>;

export interface Background {
    name: string;
    spritetype: string;
    quadtexturesprite: string;
}
//#endregion

//#region Focus
export interface FocusTree {
    id: CustomSymbol;
    shared_focus: CustomSymbol;
    focus: Focus[];
}

export interface Focus {
    id: CustomSymbol;
    icon: CustomSymbol;
    x: number;
    y: number;
    prerequisite: FocusOrXORList[];
    mutually_exclusive: FocusOrXORList[];
    relative_position_id: CustomSymbol;
    allow_branch: CustomSymbol[]; /* FIXME not symbol node */
    _token: Token;
}

export interface FocusOrXORList {
    focus: CustomSymbol[];
    XOR: CustomSymbol[];
}
//#endregion

//#region Tech
export type Technologies = CustomMap<Technology>;

export interface Technology {
    enable_equipments: Enum;
    path: TechnologyPath[];
    folder: Folder[];
    start_year: number;
    xor: Enum;
    sub_technologies: Enum;
    _token: Token;
}

export interface TechnologyPath {
    leads_to_tech: CustomSymbol;
}

export interface Folder {
    name: CustomSymbol;
    position: Position;
}
//#endregion

//#region Sprite
export interface SpriteTypes {
    spritetype: SpriteType[];
    corneredtilespritetype: CorneredTileSpriteType[];
}

export interface SpriteType {
    name: string;
    texturefile: string;
    noofframes: number;
    _token: Token | undefined;
}

export interface CorneredTileSpriteType {
    name: string;
    texturefile: string;
    noofframes: number;
    size: NumberPosition;
    bordersize: NumberPosition;
    tilingCenter: boolean;
    _token: Token | undefined;
}
//#endregion

//#region GUI
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
//#endregion

//#endregion

//#region SchemaDefs
const positionSchema: SchemaDef<Position> = {
    x: "numberlike",
    y: "numberlike",
};

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
};

const focusOrXORListSchema: SchemaDef<FocusOrXORList> = {
    focus: {
        _innerType: "symbol",
        _type: 'array',
    },
    XOR: {
        _innerType: "symbol",
        _type: 'array',
    },
};

const focusSchema: SchemaDef<Focus> = {
    id: "symbol",
    icon: "symbol",
    x: "number",
    y: "number",
    prerequisite: {
        _innerType: focusOrXORListSchema,
        _type: 'array',
    },
    mutually_exclusive: {
        _innerType: focusOrXORListSchema,
        _type: 'array',
    },
    relative_position_id: "symbol",
    allow_branch: {
        _innerType: "symbol",
        _type: "array"
    }
};

const focusTreeSchema: SchemaDef<FocusTree> = {
    id: "symbol",
    shared_focus: "symbol",
    focus: {
        _innerType: focusSchema,
        _type: 'array',
    }
};

const technologySchema: SchemaDef<Technology> = {
    enable_equipments: "enum",
    path: {
        _innerType: {
            leads_to_tech: "symbol",
        },
        _type: "array",
    },
    folder: {
        _innerType: {
            name: "symbol",
            position: positionSchema,
        },
        _type: "array",
    },
    start_year: "number",
    xor: "enum",
    sub_technologies: "enum",
};

const technologiesSchema: SchemaDef<Technologies> = {
    _innerType: technologySchema,
    _type: "map",
};

const corneredTileSpriteTypeSchema: SchemaDef<CorneredTileSpriteType> = {
    name: "string",
    texturefile: "string",
    noofframes: "number",
    size: {
        x: "number",
        y: "number",
    },
    bordersize: {
        x: "number",
        y: "number",
    },
    tilingCenter: "boolean",
};

const spriteTypesSchema: SchemaDef<SpriteTypes> = {
    spritetype: {
        _innerType: {
            name: "string",
            texturefile: "string",
            noofframes: "number",
        },
        _type: "array",
    },
    corneredtilespritetype: {
        _innerType: corneredTileSpriteTypeSchema,
        _type: "array",
    }
};

const gridBoxTypeSchema: SchemaDef<GridBoxType> = {
    name: "string",
    orientation: "stringassymbol",
    position: positionSchema,
    size: sizeSchema,
    slotsize: sizeSchema,
    format: "stringassymbol",
};

const iconTypeSchema: SchemaDef<IconType> = {
    name: "string",
    orientation: "stringassymbol",
    position: positionSchema,
    centerposition: 'boolean',
    spritetype: "string",
    quadtexturesprite: "string",
};

const instantTextBoxTypeSchema: SchemaDef<InstantTextBoxType> = {
    name: "string",
    orientation: "stringassymbol",
    position: positionSchema,
    bordersize: positionSchema,
    maxwidth: "numberlike",
    maxheight: "numberlike",
    format: "stringassymbol",
    font: "string",
    text: "string",
};

const containerWindowTypeSchema: SchemaDef<ContainerWindowType> = {
    name: "string",
    orientation: "stringassymbol",
    origo: "stringassymbol",
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

const fileSchema: SchemaDef<File> = {
    technologies: technologiesSchema,
    focus_tree: {
        _innerType: focusTreeSchema,
        _type: "array",
    },
    shared_focus: {
        _innerType: focusSchema,
        _type: "array",
    },
    spritetypes: {
        _innerType: spriteTypesSchema,
        _type: "array",
    },
    guitypes: {
        _innerType: guiTypesSchema,
        _type: "array",
    },
};
//#endregion

//#region Functions
function forEachNodeValue(node: Node, callback: (n: Node, index: number) => void): void {
    if (!Array.isArray(node.value)) {
        return;
    }

    node.value.forEach(callback);
}

function isSymbolNode(value: NodeValue): value is SymbolNode {
    return typeof value === 'object' && value !== null && 'name' in value;
}

function applyConstantsToNode(node: Node, constants: Record<string, NodeValue>): Node {
    if (isSymbolNode(node.value) && node.value.name.startsWith('@')) {
        return {
            ...node,
            value: constants[node.value.name.toLowerCase()],
        };
    }

    return node;
}

function convertString(node: Node): HOIPartial<string> {
    return typeof node.value === 'string' ? node.value : undefined;
}

function convertNumber(node: Node): HOIPartial<number> {
    return typeof node.value === 'number' ? node.value : undefined;
}

function convertNumberLike(node: Node): HOIPartial<NumberLike> {
    if (typeof node.value === 'number') {
        return {
            _value: node.value,
            _unit: undefined,
            _token: undefined,
        };
    } else if (isSymbolNode(node.value)) {
        const symbol = node.value.name;
        const regex = /^(-?(?:\d+(?:\.\d*)?|\.\d+))(%%?)$/;
        const result = regex.exec(symbol);
        if (!result) {
            return undefined;
        }
        return {
            _value: parseFloat(result[1]),
            _unit: result[2] as NumberUnit,
            _token: undefined,
        };
    } else {
        return undefined;
    }
}

function convertSymbol(node: Node): HOIPartial<CustomSymbol> {
    return isSymbolNode(node.value) ? { _name: node.value.name, _token: undefined } : undefined;
}

function convertStringAsSymbol(node: Node): HOIPartial<StringAsSymbol<string>> {
    return isSymbolNode(node.value) ? { _name: node.value.name.toLowerCase(), _stringAsSymbol: true, _token: undefined } :
        typeof node.value === 'string' ? { _name: node.value.toLowerCase(), _stringAsSymbol: true, _token: undefined } : undefined;
}

function convertBoolean(node: Node): HOIPartial<boolean> {
    return isSymbolNode(node.value) ? (node.value.name === 'yes' ? true : (node.value.name === 'no' ? false : undefined)) : undefined;
}

function convertEnum(node: Node): HOIPartial<Enum> {
    return Array.isArray(node.value) ?
        { _values: node.value.map(v => v.name).filter((v): v is string => v !== null), _token: undefined } :
        { _values: [], _token: undefined };
}

function convertMap<T>(node: Node, innerSchema: SchemaDef<T>, constants: Record<string, NodeValue> = {}): HOIPartial<CustomMap<T>> {
    const result: HOIPartial<CustomMap<T>> = { _map: {}, _token: undefined };
    const map = result._map;
    
    forEachNodeValue(node, child => {
        if (!child.name) {
            return;
        }

        const childName = child.name.toLowerCase();

        if (childName.startsWith('@') && child.operator === '=') {
            constants[childName] = child.value;
            return;
        }

        map[childName] = {
            _value: convertNodeToJson(child, innerSchema, constants),
            _key: childName,
        };
    });

    return result;
}

function convertObject<T>(node: Node, schemaDef: SchemaDef<T>, constants: Record<string, NodeValue> = {}): HOIPartial<T> {
    const result: Record<string, any> = {};
    const schema = schemaDef as any;

    for (const childSchemaEntry of Object.entries(schema)) {
        if (typeof childSchemaEntry[1] === 'object') {
            const type = (childSchemaEntry[1] as any)._type;
            if (type === 'map') {
                result[childSchemaEntry[0]] = { _map: {}, _token: undefined };
            } else if (type === 'array') {
                result[childSchemaEntry[0]] = [];
            }
        } else if (childSchemaEntry[1] === 'enum') {
            result[childSchemaEntry[0]] = { _values: [], _token: undefined };
        }
    }

    forEachNodeValue(node, (child, index) => {
        if (!child.name) {
            return;
        }

        const childName = child.name.toLowerCase();

        if (childName.startsWith('@') && child.operator === '=') {
            constants[childName] = child.value;
            return;
        }

        const childSchemaDef = schema[childName];
        if (!childSchemaDef) {
            return;
        }

        let setChildValue = true;
        if (typeof childSchemaDef === 'object') {
            const type = childSchemaDef._type;

            if (type === 'map') {
                const mapData = (convertNodeToJson(child, childSchemaDef, constants) as any)._map;
                Object.assign(result[childName]._map, mapData);
            } else if (type === 'array') {
                const innerType = childSchemaDef._innerType;
                const convertedChild = convertNodeToJson(child, innerType, constants);
                if (typeof convertedChild === 'object') {
                    (convertedChild as any)._index = index;
                }

                result[childName].push(convertedChild);
            } else {
                setChildValue = false;
            }

        } else if (childSchemaDef === 'enum') {
            const enums = (convertNodeToJson(child, childSchemaDef, constants) as any)._values;
            result[childName]._values.push(...enums);

        } else {
            setChildValue = false;
        }

        if (!setChildValue) {
            result[childName] = convertNodeToJson(child, childSchemaDef, constants);
        }
    });

    return result as HOIPartial<T>;
}

export function convertNodeToJson<T>(node: Node, schemaDef: SchemaDef<T>, constants: Record<string, NodeValue> = {}): HOIPartial<T> {
    const schema = schemaDef as any;
    let result: HOIPartial<T>;
    node = applyConstantsToNode(node, constants);

    if (typeof schema === 'string') {
        switch (schema) {
            case 'string':
                result = convertString(node) as HOIPartial<T>;
                break;
            case 'number':
                result = convertNumber(node) as HOIPartial<T>;
                break;
            case 'numberlike':
                result = convertNumberLike(node) as HOIPartial<T>;
                break;
            case 'symbol':
                result = convertSymbol(node) as HOIPartial<T>;
                break;
            case 'stringassymbol':
                result = convertStringAsSymbol(node) as HOIPartial<T>;
                break;
            case 'boolean':
                result = convertBoolean(node) as HOIPartial<T>;
                break;
            case 'enum':
                result = convertEnum(node) as HOIPartial<T>;
                break;
            default:
                throw new Error('Unknown schema ' + schema);
        }

    } else if (typeof schema === 'object') {
        const type = schema._type;
        if (type === 'map') {
            result = convertMap(node, schema._innerType, constants) as HOIPartial<T>;
        } else if (type === 'array') {
            throw new Error("Array can't be here.");
        } else {
            result = convertObject(node, schema, constants);
        }

    } else {
        throw new Error('Bad schema ' + schema);
    }

    if (typeof result === 'object') {
        (result as { _token: Token | undefined })._token = node.nameToken ?? undefined;
    }

    return result;
}

export function convertNodeFromFileToJson(node: Node): HOIPartial<File> {
    return convertNodeToJson<File>(node, fileSchema);
}

export function toNumberLike(value: number): NumberLike {
    return {
        _value: value,
        _unit: undefined,
        _token: undefined,
    };
}

export function toStringAsSymbol<T extends string>(value: T): StringAsSymbol<T> {
    return {
        _name: value,
        _stringAsSymbol: true,
        _token: undefined,
    };
}
//#endregion
