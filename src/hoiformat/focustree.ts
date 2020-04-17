import { Node, Token } from "./hoiparser";
import { isArray } from "util";
import { forEachNodeValue, getSymbolPropertyOrUndefined, getNumberPropertyOrUndefined, getPropertyNodes, getSymbolProperty } from "./hoinodeutils";

export interface FocusTree {
    focuses: Record<string, Focus>;
    allowBranchOptions: string[];
}

export interface Focus {
    x: number;
    y: number;
    id: string;
    icon: string | undefined;
    prerequisite: string[][];
    exclusive: string[];
    hasAllowBranch: boolean;
    inAllowBranch: string[];
    token: Token | null;
}

export function getFocusTree(node: Node): FocusTree[] {
    if (!isArray(node.value)) {
        return [];
    }

    const focusTrees: FocusTree[] = [];

    forEachNodeValue(node, ftnode => {
        if (ftnode.name !== 'focus_tree') {
            return;
        }

        const focuses = getFocuses(ftnode);
        focusTrees.push({
            focuses,
            allowBranchOptions: getAllowBranchOptions(focuses)
        });
    });

    const focuses = getFocuses(node, 'shared_focus');
    if (Object.keys(focuses).length > 0) {
        focusTrees.push({
            focuses,
            allowBranchOptions: getAllowBranchOptions(focuses)
        });
    }

    return focusTrees;
}

function getFocuses(node: Node, nodeName: string = 'focus'): Record<string, Focus> {
    if (!isArray(node.value)) {
        return {};
    }
    
    const focuses: Record<string, Focus> = {};
    let pendingFocuses: Node[] = [];

    forEachNodeValue(node, fnode => {
        if (fnode.name !== nodeName) {
            return;
        }

        const relativeTo = getSymbolPropertyOrUndefined(fnode, 'relative_position_id');
        if (relativeTo !== undefined && !(relativeTo in focuses)) {
            pendingFocuses.push(fnode);
            return;
        }

        const focus = getFocus(fnode, relativeTo ? focuses[relativeTo]: null);
        if (focus !== null) {
            focuses[focus.id] = focus;
        }
    });

    let pendingFocusesChanged = true;
    while (pendingFocuses && pendingFocusesChanged) {
        const newPendingFocus = [];
        pendingFocusesChanged = false;
        for (const fnode of pendingFocuses) {
            const relativeTo = getSymbolPropertyOrUndefined(fnode, 'relative_position_id');
            if (relativeTo !== undefined && !(relativeTo in focuses)) {
                newPendingFocus.push(fnode);
                continue;
            }

            const focus = getFocus(fnode, relativeTo ? focuses[relativeTo]: null);
            if (focus !== null) {
                focuses[focus.id] = focus;
                pendingFocusesChanged = true;
            }
        }
        pendingFocuses = newPendingFocus;
    }

    let hasChangedInAllowBranch = true;
    while (hasChangedInAllowBranch) {
        hasChangedInAllowBranch = false;
        for (const key in focuses) {
            const focus = focuses[key];
            const allPrerequisites = focus.prerequisite.reduce((p, v) => p.concat(v), []).filter(p => p in focuses);
            if (allPrerequisites.length === 0) {
                continue;
            }

            allPrerequisites
                .map(p => focuses[p].inAllowBranch)
                .reduce((p, c) => p.concat(c), [])
                .forEach(ab => {
                    if (!focus.inAllowBranch.includes(ab)) {
                        focus.inAllowBranch.push(ab);
                        hasChangedInAllowBranch = true;
                    }
                });
        }
    }

    return focuses;
}

function getFocus(fnode: Node, relativeToFocus: Focus | null): Focus | null {
    const id = getSymbolPropertyOrUndefined(fnode, 'id');
    let x = getNumberPropertyOrUndefined(fnode, 'x');
    let y = getNumberPropertyOrUndefined(fnode, 'y');

    if (id === undefined || x === undefined || y === undefined) {
        return null;
    }

    x += (relativeToFocus ? relativeToFocus.x : 0);
    y += (relativeToFocus ? relativeToFocus.y : 0);

    const exclusive = getPropertyNodes(fnode, 'mutually_exclusive')
        .reduce((p, exclusiveNode) => 
            p.concat(getSymbolProperty(exclusiveNode, 'focus')).concat(getSymbolProperty(exclusiveNode, 'OR'))
        , [] as string[]);
    const prerequisite = getPropertyNodes(fnode, 'prerequisite')
        .map(prerequisiteNode => getSymbolProperty(prerequisiteNode, 'focus').concat(getSymbolProperty(prerequisiteNode, 'OR')));
    const icon = getSymbolPropertyOrUndefined(fnode, 'icon');
    const hasAllowBranch = getPropertyNodes(fnode, 'allow_branch').length > 0;

    return {
        id,
        icon,
        x,
        y,
        prerequisite,
        exclusive,
        hasAllowBranch,
        inAllowBranch: hasAllowBranch ? [id] : [],
        token: fnode.nameToken
    };
}

function getAllowBranchOptions(focuses: Record<string, Focus>): string[] {
    return Object.values(focuses)
        .map(f => f.inAllowBranch)
        .reduce((p, c) => p.concat(c), [])
        .filter((v, i, a) => a.indexOf(v) === i);
}
