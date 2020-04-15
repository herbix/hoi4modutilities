export interface Node {
    name: string | null;
    operator: string | undefined;
    value: Node[] | SymbolNode | string | number | undefined;
    nameToken: Token | null;
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
    length: number;
}

function tokenizer(input: string): Tokenizer {
    const regex = /^\s*((#.*[\r\n])|([\w\d:\._@\-]+)|([={}<>]+)|("(?:\\"|\\\\|[^"])*")|$)/;
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
                length: groups[1].length
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
        operator: '=',
        value: parseBlockContent(tokens)
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
            operator: undefined,
            value: undefined
        };
    }

    const operator = tokens.next();
    if (operator === null) {
        tokens.throw("Expect operator");
    }

    return {
        name: name.value,
        nameToken: name,
        operator: operator.value,
        value: parseNodeValue(tokens)
    };
}

function parseNodeValue(tokens: Tokenizer): Node[] | SymbolNode | string | number {
    const nextToken = tokens.next();
    if (nextToken === null) {
        tokens.throw("Expect a node value");
    } else if (nextToken.value.startsWith('"')) {
        return nextToken.value.substr(1, nextToken.length - 2).replace(/\\"/g, '"').replace(/\\\\/g, '\\');
    } else if (nextToken.value.match(/^[0-9\-]+$/)) {
        return parseInt(nextToken.value);
    } else if (nextToken.value === '{') {
        const result = parseBlockContent(tokens);
        const right = tokens.next();
        if (right === null || right.value !== '}') {
            tokens.throw("Expect a '}'");
        }
        return result;
    } else {
        return {
            name: nextToken.value
        };
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
