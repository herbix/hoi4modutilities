import { Node, NodeValue } from "./hoiparser";
import { nodeToString } from "./tostring";
import { Scope, scopeDefs, countryScope } from "./scope";
import { isEqual } from "lodash";

export type ConditionFolderType = 'and' | 'or' | 'ornot' | 'andnot';
export type ConditionComplexExpr = ConditionFolder | ConditionAmountFolder | ConditionItem | boolean;

export interface ConditionItem {
    scopeName: string;
    nodeContent: string;
}

export interface ConditionFolder {
    type: ConditionFolderType;
    items: ConditionComplexExpr[];
}

export interface ConditionAmountFolder {
    type: 'count';
    amount: number;
    items: ConditionComplexExpr[];
}

export interface ConditionValue {
    condition: ConditionComplexExpr;
    exprs: ConditionItem[];
}

export function extractConditionValue(nodeValue: NodeValue, scope: Scope, exprs: ConditionItem[] = []): ConditionValue {
    const condition = simplifyCondition(extractConditionFolder(nodeValue, [scope]));
    exprs = extractConditionalExprs(condition, exprs);
    return {
        condition,
        exprs,
    };
}

export function extractConditionFolder(
    nodeValue: NodeValue,
    scopeStack: Scope[],
    type: ConditionFolderType | 'count' = 'and',
    excludedKeys: string[] | undefined = undefined,
    amount: number = 0
): ConditionFolder | ConditionAmountFolder {
    if (!Array.isArray(nodeValue)) {
        return type === 'count' ? { type, amount, items: [] } : { type, items: [] };
    }

    const items: ConditionComplexExpr[] = [];
    const currentScope = scopeStack[scopeStack.length - 1];
    let ifItem: ConditionFolder | undefined = undefined;

    for (const child of nodeValue) {
        let keepIfItem = false;

        let childName = child.name?.toLowerCase().trim();

        if (excludedKeys && childName && excludedKeys.includes(childName)) {
            continue;
        }

        if (tryMoveScope(child, scopeStack)) {
            items.push(extractConditionFolder(child.value, scopeStack));
            scopeStack.pop();

        } else if (childName === 'and' || childName === 'hidden_trigger' || childName === 'custom_trigger_tooltip') {
            items.push(extractConditionFolder(child.value, scopeStack));

        } else if (childName === 'or') {
            items.push(extractConditionFolder(child.value, scopeStack, 'or'));

        } else if (childName === 'not') {
            items.push(extractConditionFolder(child.value, scopeStack, 'ornot'));

        } else if (childName === 'if') {
            if (Array.isArray(child.value)) {
                const limit = child.value.find(v => v.name === 'limit');
                if (limit) {
                    ifItem = handleIf(child, limit, scopeStack);
                    keepIfItem = true;

                    const elseifs = child.value.filter(v => v.name === 'else_if');
                    for (const elseif of elseifs) {
                        handleElseIf(elseif, ifItem, scopeStack);
                        keepIfItem = false;
                    }

                    const els = child.value.find(v => v.name === 'else');
                    if (els) {
                        handleElse(els, ifItem, scopeStack);
                        keepIfItem = false;
                    }
                }
            }

        } else if (childName === 'else_if') {
            if (ifItem) {
                handleElseIf(child, ifItem, scopeStack);
                keepIfItem = true;
            }

        } else if (childName === 'else') {
            if (ifItem) {
                handleElse(child, ifItem, scopeStack);
                keepIfItem = false;
            }
        
        } else if (childName === 'always') {
            if (typeof child.value === 'object' && child.value && 'name' in child.value) {
                items.push(child.value.name.toLowerCase() === 'yes');
            }
        
        } else if (childName === 'count_triggers') {
            if (Array.isArray(child.value)) {
                const amount = child.value.find(v => v.name === 'amount');
                if (amount && typeof amount.value === 'number') {
                    items.push(extractConditionFolder(child.value, scopeStack, 'count', ['amount'], amount.value));
                }
            }

        } else {
            items.push({
                scopeName: currentScope.scopeName,
                nodeContent: nodeToString(child),
            });
        }

        if (!keepIfItem) {
            if (ifItem) {
                items.push(ifItem);
            }
            ifItem = undefined;
        }
    }
    
    if (ifItem) {
        items.push(ifItem);
    }

    if (type === 'count') {
        return { type, amount, items };
    }
    return { type, items };
}

export function applyCondition(condition: ConditionComplexExpr, trueExprs: ConditionItem[]): boolean {
    if (typeof condition === 'boolean') {
        return condition;
    }

    if (!('items' in condition)) {
        return trueExprs.some(e => isEqual(condition, e));
    }

    if (condition.type === 'count') {
        return condition.items.filter(item => applyCondition(item, trueExprs)).length >= condition.amount;
    }

    let ifSubConditionIs: boolean;
    let resultIs: boolean;
    let otherwise: boolean;
    switch (condition.type) {
        case 'and':   ifSubConditionIs = false; resultIs = false; otherwise = true; break;
        case 'or':    ifSubConditionIs = true;  resultIs = true;  otherwise = false; break;
        case 'andnot':ifSubConditionIs = false; resultIs = true;  otherwise = false; break;
        case 'ornot': ifSubConditionIs = true;  resultIs = false; otherwise = true; break;
    }

    for (const item of condition.items) {
        if (ifSubConditionIs === applyCondition(item, trueExprs)) {
            return resultIs;
        }
    }

    return otherwise;
}

function tryMoveScope(node: Node, scopeStack: Scope[]): boolean {
    if (!node.name) {
        return false;
    }

    const nodeName = node.name.trim().toLowerCase();
    if (nodeName.match(/^[A-Z]{3}$/)) {
        scopeStack.push({
            scopeName: nodeName,
            scopeType: 'country',
        });
        return true;
    }

    if (nodeName.match(/^[0-9]+$/)) {
        scopeStack.push({
            scopeName: nodeName,
            scopeType: 'state',
        });
        return true;
    }

    const currentScope = scopeStack[scopeStack.length - 1];
    if (nodeName === 'this') {
        scopeStack.push(currentScope);
        return true;
    }

    if (nodeName === 'root') {
        scopeStack.push(scopeStack[0]);
        return true;
    }

    if (nodeName.match(/^prev(?:\.prev)*$/)) {
        const count = nodeName.split('.').length;
        const scope = scopeStack[Math.max(0, scopeStack.length - 1 - count)];
        scopeStack.push(scope);
        return true;
    }

    const scopeDef = scopeDefs[nodeName];
    if (scopeDef && scopeDef.condition) {
        if (scopeDef.from === '*') {
            scopeStack.push({
                scopeName: scopeDef.name,
                scopeType: scopeDef.to,
            });
            return true;
        } else if (scopeDef.from === currentScope.scopeType) {
            scopeStack.push({
                scopeName: currentScope.scopeName + '.' + scopeDef.name,
                scopeType: scopeDef.to,
            });
            return true;
        }
    }

    return false;
}

function handleIf(ifNode: Node, limit: Node, scopeStack: Scope[]): ConditionFolder {
    return {
        type: 'or',
        items: [{
            type: 'and',
            items: [
                extractConditionFolder(limit.value, scopeStack, 'and'),
                extractConditionFolder(ifNode.value, scopeStack, 'and', ['limit', 'else_if', 'else']),
            ],
        }],
    };
}

function handleElseIf(elseIfNode: Node, ifItem: ConditionFolder, scopeStack: Scope[]) {
    if (!Array.isArray(elseIfNode.value)) {
        return;
    }
    const elseiflimit = elseIfNode.value.find(v => v.name === 'limit');
    if (elseiflimit) {
        const lastItemItems = (ifItem.items[ifItem.items.length - 1] as ConditionFolder).items;
        const newItem: ConditionComplexExpr[] = [
            ...lastItemItems.slice(0, lastItemItems.length - 2),
            {
                ...(lastItemItems[lastItemItems.length - 2] as ConditionFolder),
                type: 'andnot',
            },
            extractConditionFolder(elseiflimit.value, scopeStack, 'and'),
            extractConditionFolder(elseIfNode.value, scopeStack, 'and', ['limit', 'else_if', 'else']),
        ];
        ifItem.items.push({
            type: 'and',
            items: newItem,
        });
    }
}

function handleElse(elseNode: Node, ifItem: ConditionFolder, scopeStack: Scope[]) {
    if (Array.isArray(elseNode.value)) {
        const lastItemItems = (ifItem.items[ifItem.items.length - 1] as ConditionFolder).items;
        const newItem: ConditionComplexExpr[] = [
            ...lastItemItems.slice(0, ifItem.items.length - 2),
            {
                ...(lastItemItems[ifItem.items.length - 2] as ConditionFolder),
                type: 'andnot',
            },
            extractConditionFolder(elseNode.value, scopeStack, 'and', ['limit', 'else_if', 'else']),
        ];
        ifItem.items.push({
            type: 'and',
            items: newItem,
        });
    }
}

function simplifyCondition(condition: ConditionComplexExpr): ConditionComplexExpr {
    if (typeof condition === 'boolean' || !('items' in condition)) {
        return condition;
    }

    if (condition.items.length === 0) {
        return condition.type === 'and' || condition.type === 'ornot';
    }

    if (condition.type === 'count') {
        if (condition.amount <= 0) {
            return true;
        } else if (condition.amount > condition.items.length) {
            return false;
        } else if (condition.amount === condition.items.length) {
            return simplifyCondition({ type: 'and', items: condition.items });
        }
    }

    if (condition.items.length === 1) {
        if (condition.type === 'and' || condition.type === 'or') {
            return simplifyCondition(condition.items[0]);
        }

        if (condition.type === 'andnot') {
            return simplifyCondition({ type: 'ornot', items: condition.items });
        }

        if (condition.type === 'ornot') {
            const child = condition.items[0];
            if (typeof child === 'object' && 'items' in child && (child.type === 'andnot' || child.type === 'ornot')) {
                return simplifyCondition({ type: child.type === 'andnot' ? 'and' : 'or', items: child.items });
            }
        }
    }

    const simplifiedItems: ConditionFolder['items'] = [];
    for (const item of condition.items) {
        const simplified = simplifyCondition(item);
        if (typeof simplified === 'boolean') {
            if (simplified) {
                if (condition.type === 'or') {
                    return true;
                } else if (condition.type === 'ornot') {
                    return false;
                }
            } else {
                if (condition.type === 'and') {
                    return false;
                } else if (condition.type === 'andnot') {
                    return true;
                }
            }
        } else {
            simplifiedItems.push(simplified);
        }
    }

    return {
        ...condition,
        items: simplifiedItems,
    };
}

function extractConditionalExprs(condition: ConditionComplexExpr, result: ConditionItem[] = []): ConditionItem[] {
    if (typeof condition === 'boolean') {
        return result;
    }

    if (!('items' in condition)) {
        if (result.every(e => !isEqual(e, condition))) {
            result.push(condition);
        }
        return result;
    }

    for (const item of condition.items) {
        extractConditionalExprs(item, result);
    }

    return result;
}

