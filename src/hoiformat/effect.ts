import { ConditionComplexExpr, ConditionFolder, extractConditionFolder, simplifyCondition } from "./condition";
import { Node, NodeValue } from "./hoiparser";
import { Scope, tryMoveScope } from "./scope";
import { nodeToString } from "./tostring";

export type EffectComplexExpr = EffectItem | EffectByCondition | RandomListEffect | null;

export interface EffectItem {
    scopeName: string;
    nodeContent: string;
    node: Node;
}

export interface RandomListEffect {
    items: RandomListEffectItem[];
}

interface RandomListEffectItem {
    possibility: number;
    effect: EffectComplexExpr;
}

export interface EffectByCondition {
    condition: ConditionComplexExpr;
    items: EffectComplexExpr[];
}

export interface EffectValue {
    effect: EffectComplexExpr;
}

export function extractEffectValue(nodeValue: NodeValue, scope: Scope): EffectValue {
    const effect = simplifyEffect(extractEffectByCondition(nodeValue, [scope]));
    return {
        effect,
    };
}

function extractEffectByCondition(
    nodeValue: NodeValue,
    scopeStack: Scope[],
    condition: ConditionComplexExpr = true,
    result: EffectComplexExpr[] = [],
    excludedKeys: string[] | undefined = undefined,
): EffectComplexExpr {
    if (!Array.isArray(nodeValue)) {
        return { condition: true, items: result };
    }

    const currentScope = scopeStack[scopeStack.length - 1];
    const items: EffectItem[] = [];
    let ifItem: ConditionFolder | undefined = undefined;

    for (const child of nodeValue) {
        let keepIfItem = false;

        let childName = child.name?.toLowerCase().trim();

        if (excludedKeys && childName && excludedKeys.includes(childName)) {
            continue;
        }

        if (childName === 'hidden_effect') {
            extractEffectByCondition(child.value, scopeStack, condition, result);
        
        } else if (childName === 'random_list') {
            if (Array.isArray(child.value)) {
                const randomListItems = child.value.map(n => {
                    const possibility = parseInt(n.name ?? '0');
                    const effect = extractEffectByCondition(n.value, scopeStack, true, [], ['modifier']);
                    return {
                        possibility,
                        effect,
                    };
                });
                result.push({ items: randomListItems });
            }

        } else if (childName === 'if') {
            if (Array.isArray(child.value)) {
                const limit = child.value.find(v => v.name === 'limit');
                if (limit) {
                    ifItem = handleIf(child, limit, scopeStack, condition, result);
                    keepIfItem = true;

                    const elseifs = child.value.filter(v => v.name === 'else_if');
                    for (const elseif of elseifs) {
                        handleElseIf(elseif, ifItem, scopeStack, result);
                        keepIfItem = false;
                    }

                    const els = child.value.find(v => v.name === 'else');
                    if (els) {
                        handleElse(els, ifItem, scopeStack, result);
                        keepIfItem = false;
                    }
                }
            }

        } else if (childName === 'else_if') {
            if (ifItem) {
                handleElseIf(child, ifItem, scopeStack, result);
                keepIfItem = true;
            }

        } else if (childName === 'else') {
            if (ifItem) {
                handleElse(child, ifItem, scopeStack, result);
                keepIfItem = false;
            }

        } else if (tryMoveScope(child, scopeStack, 'effect')) {
            extractEffectByCondition(child.value, scopeStack, condition, result);
            scopeStack.pop();

        } else {
            items.push({
                scopeName: currentScope.scopeName,
                nodeContent: nodeToString(child),
                node: child,
            });
        }

        if (!keepIfItem) {
            ifItem = undefined;
        }
    }

    if (items.length > 0) {
        const existing = result.filter((r): r is EffectByCondition => r !== null && 'condition' in r).find(r => r.condition === condition);
        if (existing) {
            existing.items.push(...items);
        } else {
            result.push({
                condition,
                items,
            });
        }
    }

    return { condition: true, items: result };
}

function handleIf(ifNode: Node, limit: Node, scopeStack: Scope[], baseCondition: ConditionComplexExpr, result: EffectComplexExpr[]): ConditionFolder {
    const condition: ConditionFolder = {
        type: 'and',
        items: [
            baseCondition,
            extractConditionFolder(limit.value, scopeStack, 'and'),
        ],
    };

    extractEffectByCondition(ifNode.value, scopeStack, simplifyCondition(condition), result, ['limit', 'else_if', 'else']);
    return condition;
}

function handleElseIf(elseIfNode: Node, ifItem: ConditionFolder, scopeStack: Scope[], result: EffectComplexExpr[]) {
    if (!Array.isArray(elseIfNode.value)) {
        return;
    }
    const elseiflimit = elseIfNode.value.find(v => v.name === 'limit');
    if (elseiflimit) {
        const lastItemItems = ifItem.items;
        const newItems: ConditionComplexExpr[] = [
            ...lastItemItems.slice(0, lastItemItems.length - 1),
            {
                ...(lastItemItems[lastItemItems.length - 1] as ConditionFolder),
                type: 'andnot',
            },
            extractConditionFolder(elseiflimit.value, scopeStack, 'and'),
        ];
        ifItem.items = newItems;

        extractEffectByCondition(elseIfNode.value, scopeStack, simplifyCondition(ifItem), result, ['limit', 'else_if', 'else']);
    }
}

function handleElse(elseNode: Node, ifItem: ConditionFolder, scopeStack: Scope[], result: EffectComplexExpr[]) {
    if (Array.isArray(elseNode.value)) {
        const lastItemItems = ifItem.items;
        const newItems: ConditionComplexExpr[] = [
            ...lastItemItems.slice(0, ifItem.items.length - 1),
            {
                ...(lastItemItems[ifItem.items.length - 1] as ConditionFolder),
                type: 'andnot',
            },
        ];
        ifItem.items = newItems;
        
        extractEffectByCondition(elseNode.value, scopeStack, simplifyCondition(ifItem), result, ['limit', 'else_if', 'else']);
    }
}

function simplifyEffect(effect: EffectComplexExpr): EffectComplexExpr {
    if (effect === null) {
        return null;
    }

    if ('condition' in effect) {
        const items = effect.items.map(i => simplifyEffect(i)).filter(i => i !== null);
        if (items.length === 0) {
            return null;
        }

        if (effect.condition === true) {
            if (items.length === 1) {
                return simplifyEffect(items[0]);
            }
        }

        return {
            ...effect,
            items,
        };

    } else if (!('nodeContent' in effect)) {
        let items = effect.items.filter(i => i.possibility > 0);
        if (items.length === 0) {
            return null;
        }

        if (items.length === 1) {
            return simplifyEffect(items[0].effect);
        }
        
        items = items.map(i => ({ ...i, effect: simplifyEffect(i.effect) }));
        return {
            ...effect,
            items,
        };

    } else {
        return effect;
    }
}
