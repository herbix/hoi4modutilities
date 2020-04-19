export type NodeValue = string | number | Node[] | SymbolNode | null;

export interface Node {
    name: string | null;
    operator: string | null;
    value: NodeValue;
    nameToken: Token | null;
    operatorToken: Token | null;
    valueStartToken: Token | null;
    valueEndToken: Token | null;
}

export interface SymbolNode {
    name: string;
}

interface Tokenizer {
    peek: () => Token | null;
    next: () => Token | null;
    throw: (message: string) => never;
}

export interface Token {
    value: string;
    start: number;
    end: number;
}

function tokenizer(input: string): Tokenizer {
    const regex = /^\s*((#.*[\r\n])|([\w\d:\._@\-]+)|([={}<>]|>=|<=|!=)|("(?:\\"|\\\\|[^"])*")|$)/;
    let pos = 0;
    let token: Token | null = null;
    let groups: RegExpExecArray | null = null;

    function nextGroups() {
        do {
            groups = regex.exec(input);
            if (groups === null) {
                throw new Error("invalid token at " + input.substring(0, Math.min(30, input.length)));
            }

            input = input.substr(groups[0].length);
            pos += groups[0].length;
            const result = groups[1];
            if (result.length === 0) {
                token = null;
                break;
            }

            token = {
                value: result,
                start: pos - groups[1].length,
                end: pos,
            };
        } while (token.value.startsWith('#'));
    }

    function peek() {
        if (groups !== null) {
            return token;
        }

        nextGroups();
        return token;
    }
    
    return {
        peek,
        next: () => {
            const result = peek();
            groups = null;
            return result;
        },
        throw: (message: string) => {
            throw new Error(message + ": " + input.substring(0, Math.min(30, input.length)));
        }
    };
}

export function parseHoi4File(input: string): Node {
    const tokens = tokenizer(input);

    return {
        name: null,
        nameToken: null,
        operator: null,
        operatorToken: null,
        value: parseBlockContent(tokens),
        valueStartToken: null,
        valueEndToken: null,
    };
}

function parseNode(tokens: Tokenizer): Node {
    const name = tokens.next();
    const nextToken = tokens.peek();
    if (name === null) {
        tokens.throw("Expect name");
    }

    if (nextToken === null || nextToken.value.match(/^([\w\d:\._@\-]+|})$/)) {
        return {
            name: name.value,
            nameToken: name,
            operator: null,
            operatorToken: null,
            value: null,
            valueStartToken: null,
            valueEndToken: null,
        };
    }

    const operator = tokens.next();
    if (operator === null) {
        tokens.throw("Expect operator");
    }

    const [value, valueStartToken, valueEndToken] = parseNodeValue(tokens);

    return {
        name: name.value,
        nameToken: name,
        operator: operator.value,
        operatorToken: operator,
        value,
        valueStartToken,
        valueEndToken,
    };
}

function parseNodeValue(tokens: Tokenizer): [ NodeValue, Token, Token ] {
    const nextToken = tokens.next();
    if (nextToken === null) {
        tokens.throw("Expect a node value");
    } else if (nextToken.value.startsWith('"')) {
        return [
            nextToken.value.substr(1, nextToken.end - nextToken.start - 2).replace(/\\"/g, '"').replace(/\\\\/g, '\\'),
            nextToken,
            nextToken,
        ];
    } else if (nextToken.value.match(/^[0-9\-]+$/)) {
        return [
            parseInt(nextToken.value),
            nextToken,
            nextToken,
        ];
    } else if (nextToken.value === '{') {
        const result = parseBlockContent(tokens);
        const right = tokens.next();
        if (right === null || right.value !== '}') {
            tokens.throw("Expect a '}'");
        }
        return [
            result,
            nextToken,
            right,
        ];
    } else {
        return [
            { name: nextToken.value },
            nextToken,
            nextToken,
        ];
    }
}

function parseBlockContent(tokens: Tokenizer): Node[] {
    const nodes: Node[] = [];

    while (true) {
        const nextToken = tokens.peek();
        if (nextToken === null || nextToken.value === "}") {
            break;
        }

        nodes.push(parseNode(tokens));
    }

    return nodes;
}
