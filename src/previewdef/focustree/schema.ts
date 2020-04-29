import { Node, Token, SymbolNode } from "../../hoiformat/hoiparser";
import { convertNodeFromFileToJson, Focus as SFocus, HOIPartial, CustomSymbol } from "../../hoiformat/schema";

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
    token: Token | undefined;
}

export function getFocusTree(node: Node): FocusTree[] {
    const focusTrees: FocusTree[] = [];
    const file = convertNodeFromFileToJson(node);

    for (const focusTree of file.focus_tree) {
        const focuses = getFocuses(focusTree.focus);
        focusTrees.push({
            focuses,
            allowBranchOptions: getAllowBranchOptions(focuses)
        });
    }

    if (file.shared_focus.length > 0) {
        const focuses = getFocuses(file.shared_focus);
        focusTrees.push({
            focuses,
            allowBranchOptions: getAllowBranchOptions(focuses)
        });
    }

    return focusTrees;
}

function getFocuses(hoiFocuses: HOIPartial<SFocus>[]): Record<string, Focus> {
    const focuses: Record<string, Focus> = {};
    let pendingFocuses: HOIPartial<SFocus>[] = [];

    for (const hoiFocus of hoiFocuses) {
        const relativeTo = hoiFocus.relative_position_id?._name;
        if (relativeTo !== undefined && !(relativeTo in focuses)) {
            pendingFocuses.push(hoiFocus);
            continue;
        }

        const focus = getFocus(hoiFocus, relativeTo ? focuses[relativeTo] : null);
        if (focus !== null) {
            focuses[focus.id] = focus;
        }
    }

    let pendingFocusesChanged = true;
    while (pendingFocusesChanged) {
        const newPendingFocus = [];
        pendingFocusesChanged = false;
        for (const hoiFocus of pendingFocuses) {
            const relativeTo = hoiFocus.relative_position_id?._name;
            if (relativeTo !== undefined && !(relativeTo in focuses)) {
                newPendingFocus.push(hoiFocus);
                continue;
            }

            const focus = getFocus(hoiFocus, relativeTo ? focuses[relativeTo]: null);
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

function getFocus(hoiFocus: HOIPartial<SFocus>, relativeToFocus: Focus | null): Focus | null {
    const id = hoiFocus.id?._name;
    let x = hoiFocus.x;
    let y = hoiFocus.y;

    if (id === undefined || x === undefined || y === undefined) {
        return null;
    }

    x += (relativeToFocus ? relativeToFocus.x : 0);
    y += (relativeToFocus ? relativeToFocus.y : 0);

    const exclusive = hoiFocus.mutually_exclusive
        .reduce((p, c) => p.concat(c.focus).concat(c.XOR), [] as (CustomSymbol | undefined)[])
        .filter((s): s is CustomSymbol => s !== undefined)
        .map(s => s._name);
    const prerequisite = hoiFocus.prerequisite
        .map(p => p.focus.concat(p.XOR).filter((s): s is CustomSymbol => s !== undefined).map(s => s._name));
    const icon = hoiFocus.icon?._name;
    const hasAllowBranch = hoiFocus.allow_branch.length > 0;

    return {
        id,
        icon,
        x,
        y,
        prerequisite,
        exclusive,
        hasAllowBranch,
        inAllowBranch: hasAllowBranch ? [id] : [],
        token: hoiFocus._token,
    };
}

function getAllowBranchOptions(focuses: Record<string, Focus>): string[] {
    return Object.values(focuses)
        .map(f => f.inAllowBranch)
        .reduce((p, c) => p.concat(c), [])
        .filter((v, i, a) => a.indexOf(v) === i);
}
