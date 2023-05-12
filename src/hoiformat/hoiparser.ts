import { UserError } from '../util/common';

export type NodeValue = string | number | Node[] | SymbolNode | null;

export interface Node {
    name: string | null;
    operator: string | null;
    value: NodeValue;
    valueAttachment: SymbolNode | null;
    valueAttachmentToken: Token | null;
    nameToken: Token | null;
    operatorToken: Token | null;
    valueStartToken: Token | null;
    valueEndToken: Token | null;
}

export interface SymbolNode {
    name: string;
}

interface Tokenizer<T extends string> {
    peek: () => Token<T>;
    next: () => Token<T>;
    throw: (message: string, prev?: boolean) => never;
}

export interface Token<T extends string = string> {
    value: string;
    start: number;
    end: number;
    type: T;
}

function tokenizer<T extends string>(input: string, tokenRegexStrings: Record<T, [string, number]>, errorMessagePrefix: string = ''): Tokenizer<T> {
    const types = Object.keys(tokenRegexStrings);
    const typeEntries = Object.entries<[string, number]>(tokenRegexStrings);
    typeEntries.sort((a, b) => a[1][1] - b[1][1]);

    const regex = new RegExp(
        '\\s*(?<result>' +
            typeEntries.map(([n, [s]]) => `(?<${n}>${s})`).join('|')
            + ')',
        'y');
    let prevPos = 0;
    let pos = 0;
    let token: Token<T> | null = null;
    let groups: RegExpExecArray | null = null;

    let sum = 0;
    const lineLengthSums = input.split('\n').map(v => v.length).map(v => sum = (sum+ v + 1));

    function nextGroups() {
        prevPos = pos;
        do {
            groups = regex.exec(input);
            if (groups === null) {
                throwError("Invalid token");
            }

            const result = groups.groups!['result'];
            // input = input.substr(groups[0].length);
            pos += groups[0].length;

            const localGroups = groups;
            const type = types.find(t => localGroups.groups![t] !== undefined);

            token = {
                value: result,
                start: pos - result.length,
                end: pos,
                type: type as T,
            };
        } while (token.type === 'comment');
    }

    function peek(): Token<T> {
        if (groups !== null) {
            return token!;
        }

        nextGroups();
        return token!;
    }

    function throwError(message: string, prev: boolean = false): never {
        const calculatePos = prev ? prevPos : pos;
        const line = lineLengthSums.findIndex(v => v > calculatePos);
        const column = line > 0 ? calculatePos - lineLengthSums[line - 1] : calculatePos;
        const posString = line === -1 ?
            ` at (${lineLengthSums.length}, ${lineLengthSums.length > 1 ? lineLengthSums[lineLengthSums.length - 1] - lineLengthSums[lineLengthSums.length - 2] + 1 : lineLengthSums[lineLengthSums.length - 1] + 1})` :
            ` at (${line + 1}, ${column + 1})`;
        throw new UserError(errorMessagePrefix + message + `${posString}: ` + (input + "(EOF)").substring(calculatePos, Math.min(calculatePos + 30, input.length + 5)));
    }
    
    return {
        peek,
        next: () => {
            const result = peek();
            groups = null;
            return result;
        },
        throw: throwError,
    };
}

type HOITokenType = 'comment' | 'symbol' | 'operator' | 'string' | 'number' | 'unitnumber' | 'eof';
const tokenRegexStrings: Record<HOITokenType, [string, number]> = {
    comment: ['#.*(?:[\\r\\n]|$)', 0],
    symbol: ['(?:\\d+\\.)?[a-zA-Z_@\\[\\]][\\w:\\._@\\[\\]\\-\\?\\^\\/\\u00A0-\\u024F]*', 40],
    operator: ['[={}<>;,]|>=|<=|!=', 10],
    string: ['"(?:\\\\"|\\\\\\\\|[^"])*"', 10],
    number: ['-?\\d*\\.\\d+|-?\\d+|0x\\d+', 50],
    unitnumber: ['(?:-?\\d*\\.\\d+|-?\\d+)(?:%%?)', 49],
    eof: ['$', 1000],
};

export function parseHoi4File(input: string, errorMessagePrefix: string = ''): Node {
    const tokens = tokenizer(input, tokenRegexStrings, errorMessagePrefix);
    const value = parseBlockContent(tokens);

    if (tokens.peek().type !== 'eof') {
        tokens.throw("File content can't be completely parsed");
    }

    return {
        name: null,
        nameToken: null,
        operator: null,
        operatorToken: null,
        value,
        valueStartToken: null,
        valueEndToken: null,
        valueAttachment: null,
        valueAttachmentToken: null,
    };
}

function parseNode(tokens: Tokenizer<HOITokenType>): Node {
    const name = tokens.next();
    if (name.type !== 'string' && name.type !== 'symbol' && name.type !== 'number') {
        tokens.throw("Expect name to be symbol, string or number", true);
    }

    let nextToken = tokens.peek();
    if (nextToken.type !== 'operator' || nextToken.value.match(/^[,;}]$/)) {
        while (nextToken.value.match(/^[,;]$/)) {
            tokens.next();
            nextToken = tokens.peek();
        }

        let nameValue = name.value;
        if (name.type === 'string') {
            nameValue = nameValue.substr(1, nameValue.length - 2).replace(/\\"/g, '"').replace(/\\\\/g, '\\');
        }
        return {
            name: name.value,
            nameToken: name,
            operator: null,
            operatorToken: null,
            value: null,
            valueStartToken: null,
            valueEndToken: null,
            valueAttachment: null,
            valueAttachmentToken: null,
        };
    }

    let operator: Token<HOITokenType>;
    if (nextToken.value === '{') {
        operator = {
            ...nextToken,
            value: '=',
        };
    } else {
        operator = tokens.next();
    }

    let valueAttachment: SymbolNode | null = null;
    let valueAttachmentToken: Token | null = null;
    let [value, valueStartToken, valueEndToken] = parseNodeValue(tokens);

    if (value !== null && typeof value === 'object' && 'name' in value) {
        const nextToken = tokens.peek();
        if (nextToken.value === '{') {
            valueAttachment = value;
            valueAttachmentToken = valueStartToken;
            [value, valueStartToken, valueEndToken] = parseNodeValue(tokens);
        }
    }

    let tailComma = tokens.peek();
    while (tailComma.value.match(/^[,;]$/)) {
        tokens.next();
        tailComma = tokens.peek();
    }

    return {
        name: name.value,
        nameToken: name,
        operator: operator.value,
        operatorToken: operator,
        value,
        valueStartToken,
        valueEndToken,
        valueAttachment,
        valueAttachmentToken,
    };
}

function parseNodeValue(tokens: Tokenizer<HOITokenType>): [ NodeValue, Token<HOITokenType>, Token<HOITokenType> ] {
    const nextToken = tokens.next();
    switch (nextToken.type) {
        case 'string':
            return [
                nextToken.value.substr(1, nextToken.end - nextToken.start - 2).replace(/\\"/g, '"').replace(/\\\\/g, '\\'),
                nextToken,
                nextToken,
            ];
        case 'number':
            const nextTokenValue = nextToken.value;
            return [
                nextTokenValue.startsWith('0x') ? parseInt(nextTokenValue.substr(2), 16) : parseFloat(nextTokenValue),
                nextToken,
                nextToken,
            ];
        case 'symbol':
        case 'unitnumber':
            return [
                { name: nextToken.value },
                nextToken,
                nextToken,
            ];
        case 'operator':
            if (nextToken.value === '{') {
                const result = parseBlockContent(tokens);
                const right = tokens.next();
                if (right.value !== '}') {
                    tokens.throw("Expect a '}'", true);
                }
                return [
                    result,
                    nextToken,
                    right,
                ];
            }
            break;
    }
    
    tokens.throw("Expect string, number, symbol, or {", true);
}

function parseBlockContent(tokens: Tokenizer<HOITokenType>): Node[] {
    const nodes: Node[] = [];

    while (true) {
        const nextToken = tokens.peek();
        if (nextToken.type === 'eof' || nextToken.value === "}") {
            break;
        }

        nodes.push(parseNode(tokens));
    }

    return nodes;
}
