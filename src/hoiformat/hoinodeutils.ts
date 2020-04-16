import { Node, SymbolNode } from "./hoiparser";
import { isArray } from "util";

export function forEachNodeValue(node: Node, callback: (n: Node) => void): void {
    if (!isArray(node.value)) {
        return;
    }

    node.value.forEach(callback);
}

export function getPropertyNodes(node: Node, name: string): Node[] {
    const result: Node[] = [];
    forEachNodeValue(node, n => {
        if (n.name === name) {
            result.push(n);
        }
    });
    return result;
}

export function getProperty(node: Node, name: string): Node['value'][] {
    return getPropertyNodes(node, name).map(node => node.value);
}

export function getStringProperty(node: Node, name: string): string[] {
    return getProperty(node, name).filter((p): p is string => typeof p === 'string');
}

export function getNumberProperty(node: Node, name: string): number[] {
    return getProperty(node, name).filter((p): p is number => typeof p === 'number');
}

export function getSymbolProperty(node: Node, name: string): string[] {
    return getProperty(node, name).filter((p): p is SymbolNode => typeof p === 'object' && 'name' in p).map(sn => sn.name);
}

export function getStringPropertyOrUndefined(node: Node, name: string): string | undefined {
    return getProperty(node, name).find((p): p is string => typeof p === 'string');
}

export function getNumberPropertyOrUndefined(node: Node, name: string): number | undefined {
    return getProperty(node, name).find((p): p is number => typeof p === 'number');
}

export function getSymbolPropertyOrUndefined(node: Node, name: string): string | undefined {
    return getProperty(node, name).find((p): p is SymbolNode => typeof p === 'object' && 'name' in p)?.name;
}
