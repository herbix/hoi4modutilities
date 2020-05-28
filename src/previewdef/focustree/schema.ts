import { Node, Token } from "../../hoiformat/hoiparser";
import { HOIPartial, CustomSymbol, SchemaDef, Position, convertNodeToJson, positionSchema } from "../../hoiformat/schema";
import { normalizeNumberLike } from "../../util/hoi4gui/common";

export interface FocusTree {
    focuses: Record<string, Focus>;
    allowBranchOptions: string[];
    continuousFocusPositionX?: number;
    continuousFocusPositionY?: number;
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

interface FocusTreeDef {
    id: CustomSymbol;
    shared_focus: CustomSymbol;
    focus: FocusDef[];
    continuous_focus_position: Position;
}

interface FocusDef {
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

interface FocusOrXORList {
    focus: CustomSymbol[];
    XOR: CustomSymbol[];
}

interface FocusFile {
    focus_tree: FocusTreeDef[];
    shared_focus: FocusDef[];
}

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

const focusSchema: SchemaDef<FocusDef> = {
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

const focusTreeSchema: SchemaDef<FocusTreeDef> = {
    id: "symbol",
    shared_focus: "symbol",
    focus: {
        _innerType: focusSchema,
        _type: 'array',
    },
    continuous_focus_position: positionSchema,
};

const focusFileSchema: SchemaDef<FocusFile> = {
    focus_tree: {
        _innerType: focusTreeSchema,
        _type: "array",
    },
    shared_focus: {
        _innerType: focusSchema,
        _type: "array",
    },
};

export function getFocusTree(node: Node): FocusTree[] {
    const focusTrees: FocusTree[] = [];
    const file = convertNodeToJson<FocusFile>(node, focusFileSchema);

    for (const focusTree of file.focus_tree) {
        const focuses = getFocuses(focusTree.focus);
        focusTrees.push({
            focuses,
            allowBranchOptions: getAllowBranchOptions(focuses),
            continuousFocusPositionX: normalizeNumberLike(focusTree.continuous_focus_position?.x, 0) ?? 50,
            continuousFocusPositionY: normalizeNumberLike(focusTree.continuous_focus_position?.y, 0) ?? 1000,
        });
    }

    if (file.shared_focus.length > 0) {
        const focuses = getFocuses(file.shared_focus);
        focusTrees.push({
            focuses,
            allowBranchOptions: getAllowBranchOptions(focuses),
        });
    }

    return focusTrees;
}

function getFocuses(hoiFocuses: HOIPartial<FocusDef>[]): Record<string, Focus> {
    const focuses: Record<string, Focus> = {};
    let pendingFocuses: HOIPartial<FocusDef>[] = [];

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

function getFocus(hoiFocus: HOIPartial<FocusDef>, relativeToFocus: Focus | null): Focus | null {
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
