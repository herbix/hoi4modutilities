import { Node, Token, NodeValue, SymbolNode } from "./hoiparser";

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

export interface StringIgnoreCase<T extends string> extends TokenObject {
    _stringAsSymbolIgnoreCase: true;
    _name: T;
}

export interface NumberLike extends TokenObject {
    _value: number;
    _unit: NumberUnit | undefined;
}

export interface DetailValue<T> extends TokenObject {
    _attachment: string | undefined;
    _attachmentToken: Token | undefined;
    _operator: string | undefined;
    _operatorToken: Token | undefined;
    _startToken: Token | undefined;
    _endToken: Token | undefined;
    _value: T;
}

export interface Raw extends TokenObject {
    _rawValue: NodeValue;
}

export type NumberUnit = '%' | '%%';

export type HOIPartial<T> =
    T extends Enum ? T :
    T extends undefined | string | number | StringIgnoreCase<string> | NumberLike | boolean | Raw ? T | undefined :
    T extends CustomMap<infer T1> ? CustomMap<HOIPartial<T1>> :
    T extends DetailValue<infer T1> ? DetailValue<HOIPartial<T1>> | undefined :
    T extends (infer T1)[] ? HOIPartial<HOIPartial<T1>>[] :
    { [K in keyof T]:
        T[K] extends Enum ? T[K] :
        T[K] extends CustomMap<infer T1> ? CustomMap<HOIPartial<T1>> :
        T[K] extends DetailValue<infer T1> ? DetailValue<HOIPartial<T1>> | undefined :
        T[K] extends (infer T1)[] ? HOIPartial<T1>[] :
        K extends ('_token' | '_index') ? T[K] | undefined :
        HOIPartial<T[K]> | undefined; };

export type SchemaDef<T> =
    T extends boolean ? 'boolean' :
    T extends StringIgnoreCase<string> ? 'stringignorecase' :
    T extends string ? 'string' :
    T extends number ? 'number' :
    T extends NumberLike ? 'numberlike' :
    T extends Enum ? 'enum' :
    T extends Raw ? 'raw' :
    T extends CustomMap<infer T1> ? { _innerType: SchemaDef<T1>; _type: 'map'; } :
    T extends DetailValue<infer T1> ? { _innerType: SchemaDef<T1>; _type: 'detailvalue'; } :
    T extends (infer B)[] ? { _innerType: SchemaDef<B>; _type: 'array'; } :
    { [K in Exclude<keyof T, '_token' | '_index'>]: SchemaDef<T[K]>; };

//#endregion

//#region Common Defs
export interface Position {
    x: NumberLike;
    y: NumberLike;
}

export const positionSchema: SchemaDef<Position> = {
    x: "numberlike",
    y: "numberlike",
};
//#endregion

//#region Functions
export function forEachNodeValue(node: Node, callback: (n: Node, index: number) => void): void {
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
            value: constants[node.value.name],
        };
    }

    return node;
}

function convertString(node: Node): HOIPartial<string> {
    if (isSymbolNode(node.value)) {
        const variable = tryParseVariable(node.value.name, false);
        if (variable !== undefined) {
            return variable;
        }
        return node.value.name;
    }
    return typeof node.value === 'string' ? node.value : undefined;
}

function convertNumber(node: Node): HOIPartial<number> {
    if (isSymbolNode(node.value)) {
        return tryParseVariable(node.value.name, true);
    }
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
        return parseNumberLike(node.value.name);
    } else {
        return undefined;
    }
}

function convertStringIgnoreCase(node: Node): HOIPartial<StringIgnoreCase<string>> {
    return isSymbolNode(node.value) ? { _name: node.value.name.toLowerCase(), _stringAsSymbolIgnoreCase: true, _token: undefined } :
        typeof node.value === 'string' ? { _name: node.value.toLowerCase(), _stringAsSymbolIgnoreCase: true, _token: undefined } : undefined;
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

        const childName = child.name;

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

function convertDetailValue<T>(node: Node, innerSchema: SchemaDef<T>, constants: Record<string, NodeValue> = {}): HOIPartial<DetailValue<T>> {
    return {
        _attachment: node.valueAttachment?.name,
        _attachmentToken: node.valueAttachmentToken ?? undefined,
        _operator: node.operator ?? undefined,
        _operatorToken: node.operatorToken ?? undefined,
        _startToken: node.valueStartToken ?? undefined,
        _endToken: node.valueEndToken ?? undefined,
        _token: node.nameToken ?? undefined,
        _value: convertNodeToJson(node, innerSchema, constants),
    };
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

        if (child.name.startsWith('@') && child.operator === '=') {
            constants[child.name] = child.value;
            return;
        }

        const childName = child.name.toLowerCase();

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

function tryParseVariable(str: string, isNumber: true): number | undefined;
function tryParseVariable(str: string, isNumber: false): string | undefined;
function tryParseVariable(str: string, isNumber: boolean): number | string | undefined {
    const regex = /^(?:(?<prefix>\w+):)?(?<scope>(?:\w+\.)*)?(?<var>\w+)(?:@(?<target>(?:\w+\.)*\w+))?(?:\?(?<default>\d+))?$/;
    const match = regex.exec(str);
    if (!match) {
        return undefined;
    }

    if (isNumber) {
        if (match.groups?.default) {
            return parseFloat(match.groups.default);
        }
        return 0;
    } else {
        if (match.groups?.prefix) {
            return str;
        }
        return undefined;
    }
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
            case 'stringignorecase':
                result = convertStringIgnoreCase(node) as HOIPartial<T>;
                break;
            case 'boolean':
                result = convertBoolean(node) as HOIPartial<T>;
                break;
            case 'enum':
                result = convertEnum(node) as HOIPartial<T>;
                break;
            case 'raw':
                result = { _rawValue: node.value } as HOIPartial<T>;
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
        } else if (type === 'detailvalue') {
            result = convertDetailValue(node, schema._innerType, constants) as HOIPartial<T>;
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

export function toNumberLike(value: number): NumberLike {
    return {
        _value: value,
        _unit: undefined,
        _token: undefined,
    };
}

export function parseNumberLike(value: string): NumberLike | undefined {
    const regex = /^(-?(?:\d+(?:\.\d*)?|\.\d+))(%%?)$/;
    const result = regex.exec(value);
    if (!result) {
        return undefined;
    }
    return {
        _value: parseFloat(result[1]),
        _unit: result[2] as NumberUnit,
        _token: undefined,
    };
}

export function toStringAsSymbolIgnoreCase<T extends string>(value: T): StringIgnoreCase<T> {
    return {
        _name: value,
        _stringAsSymbolIgnoreCase: true,
        _token: undefined,
    };
}
//#endregion
