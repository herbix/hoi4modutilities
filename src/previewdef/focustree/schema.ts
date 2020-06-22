import { Node, Token } from "../../hoiformat/hoiparser";
import { HOIPartial, CustomSymbol, SchemaDef, Position, convertNodeToJson, positionSchema, Raw } from "../../hoiformat/schema";
import { normalizeNumberLike } from "../../util/hoi4gui/common";
import { flatten, chain, isEqual } from 'lodash';
import { extractConditionValue, ConditionItem, ConditionComplexExpr } from "../../hoiformat/condition";
import { countryScope } from "../../hoiformat/scope";
import { useConditionInFocus } from "../../util/featureflags";

export interface FocusTree {
    focuses: Record<string, Focus>;
    allowBranchOptions: string[];
    conditionExprs: ConditionItem[];
    isSharedFocues: boolean;
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
    allowBranch: ConditionComplexExpr | undefined;
    relativePositionId: string | undefined;
    offset: Offset[];
    token: Token | undefined;
    file: string;
}

interface Offset {
    x: number;
    y: number;
    trigger: ConditionComplexExpr | undefined;
}

interface FocusTreeDef {
    id: CustomSymbol;
    shared_focus: CustomSymbol[];
    focus: FocusDef[];
    continuous_focus_position: Position;
}

interface FocusDef {
    id: CustomSymbol;
    icon: CustomSymbol;
    x: number;
    y: number;
    prerequisite: FocusOrORList[];
    mutually_exclusive: FocusOrORList[];
    relative_position_id: CustomSymbol;
    allow_branch: Raw; /* FIXME not symbol node */
    offset: OffsetDef[];
    _token: Token;
}

interface OffsetDef {
    x: number;
    y: number;
    trigger: Raw;
}

interface FocusOrORList {
    focus: CustomSymbol[];
    OR: CustomSymbol[];
}

interface FocusFile {
    focus_tree: FocusTreeDef[];
    shared_focus: FocusDef[];
}

const focusOrORListSchema: SchemaDef<FocusOrORList> = {
    focus: {
        _innerType: "symbol",
        _type: 'array',
    },
    OR: {
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
        _innerType: focusOrORListSchema,
        _type: 'array',
    },
    mutually_exclusive: {
        _innerType: focusOrORListSchema,
        _type: 'array',
    },
    relative_position_id: "symbol",
    allow_branch: 'raw',
    offset: {
        _innerType: {
            x: "number",
            y: "number",
            trigger: "raw",
        },
        _type: 'array',
    }
};

const focusTreeSchema: SchemaDef<FocusTreeDef> = {
    id: "symbol",
    shared_focus: {
        _innerType: "symbol",
        _type: "array",
    },
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

export function getFocusTree(node: Node, sharedFocusTrees: FocusTree[], filePath: string): FocusTree[] {
    const focusTrees: FocusTree[] = [];
    const file = convertNodeToJson<FocusFile>(node, focusFileSchema);

    if (file.shared_focus.length > 0) {
        const conditionExprs: ConditionItem[] = [];
        const focuses = getFocuses(file.shared_focus, conditionExprs, filePath);
        const sharedFocusTree = {
            focuses,
            allowBranchOptions: getAllowBranchOptions(focuses),
            conditionExprs,
            isSharedFocues: true,
        };
        focusTrees.push(sharedFocusTree);
        sharedFocusTrees = [sharedFocusTree, ...sharedFocusTrees];
    }

    for (const focusTree of file.focus_tree) {
        const conditionExprs: ConditionItem[] = [];
        const focuses = getFocuses(focusTree.focus, conditionExprs, filePath);
        
        if (useConditionInFocus) {
            for (const sharedFocus of focusTree.shared_focus) {
                if (!sharedFocus) {
                    continue;
                }
                addSharedFocus(focuses, sharedFocusTrees, sharedFocus._name, conditionExprs);
            }
        }

        focusTrees.push({
            focuses,
            allowBranchOptions: getAllowBranchOptions(focuses),
            continuousFocusPositionX: normalizeNumberLike(focusTree.continuous_focus_position?.x, 0) ?? 50,
            continuousFocusPositionY: normalizeNumberLike(focusTree.continuous_focus_position?.y, 0) ?? 1000,
            conditionExprs,
            isSharedFocues: false,
        });
    }

    return focusTrees;
}

function getFocuses(hoiFocuses: HOIPartial<FocusDef>[], conditionExprs: ConditionItem[], filePath: string): Record<string, Focus> {
    const focuses: Record<string, Focus> = {};
    let pendingFocuses: HOIPartial<FocusDef>[] = [];

    for (const hoiFocus of hoiFocuses) {
        const relativeTo = hoiFocus.relative_position_id?._name;
        if (relativeTo !== undefined && !(relativeTo in focuses)) {
            pendingFocuses.push(hoiFocus);
            continue;
        }

        const focus = getFocus(hoiFocus, relativeTo ? focuses[relativeTo] : null, conditionExprs, filePath);
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

            const focus = getFocus(hoiFocus, relativeTo ? focuses[relativeTo]: null, conditionExprs, filePath);
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
            const allPrerequisites = flatten(focus.prerequisite).filter(p => p in focuses);
            if (allPrerequisites.length === 0) {
                continue;
            }

            chain(allPrerequisites)
                .flatMap(p  => focuses[p].inAllowBranch)
                .forEach(ab => {
                    if (!focus.inAllowBranch.includes(ab)) {
                        focus.inAllowBranch.push(ab);
                        hasChangedInAllowBranch = true;
                    }
                })
                .value();
        }
    }

    return focuses;
}

function getFocus(hoiFocus: HOIPartial<FocusDef>, relativeToFocus: Focus | null, conditionExprs: ConditionItem[], filePath: string): Focus | null {
    const id = hoiFocus.id?._name;
    let x = hoiFocus.x;
    let y = hoiFocus.y;

    if (id === undefined || x === undefined || y === undefined) {
        return null;
    }

    const exclusive = chain(hoiFocus.mutually_exclusive)
        .flatMap(f => f.focus.concat(f.OR))
        .filter((s): s is CustomSymbol => s !== undefined)
        .map('_name')
        .value();
    const prerequisite = hoiFocus.prerequisite
        .map(p => p.focus.concat(p.OR).filter((s): s is CustomSymbol => s !== undefined).map(s => s._name));
    const icon = hoiFocus.icon?._name;
    const hasAllowBranch = hoiFocus.allow_branch !== undefined;
    const allowBranchCondition = hoiFocus.allow_branch ? extractConditionValue(hoiFocus.allow_branch._rawValue, countryScope, conditionExprs).condition : undefined;
    const offset: Offset[] = hoiFocus.offset.map(o => ({
        x: o.x ?? 0,
        y: o.y ?? 0,
        trigger: o.trigger ? extractConditionValue(o.trigger._rawValue, countryScope, conditionExprs).condition : false,
    }));

    return {
        id,
        icon,
        x,
        y,
        relativePositionId: relativeToFocus?.id,
        prerequisite,
        exclusive,
        hasAllowBranch,
        inAllowBranch: hasAllowBranch ? [id] : [],
        allowBranch: allowBranchCondition,
        offset,
        token: hoiFocus._token,
        file: filePath,
    };
}

function addSharedFocus(focuses: Record<string, Focus>, sharedFocusTrees: FocusTree[], sharedFocusId: string, conditionExprs: ConditionItem[]) {
    const sharedFocusTree = sharedFocusTrees.find(sft => sharedFocusId in sft.focuses);
    if (!sharedFocusTree) {
        return;
    }

    const sharedFocuses = sharedFocusTree.focuses;

    focuses[sharedFocusId] = sharedFocuses[sharedFocusId];
    updateConditionExprsByFocus(sharedFocuses[sharedFocusId], conditionExprs);

    let hasChanged = true;
    while (hasChanged) {
        hasChanged = false;
        for (const key in sharedFocuses) {
            if (key in focuses) {
                continue;
            }

            const focus = sharedFocuses[key];
            const allPrerequisites = flatten(focus.prerequisite).filter(p => p in sharedFocuses);
            if (allPrerequisites.length === 0) {
                continue;
            }

            if (allPrerequisites.every(p => p in focuses)) {
                focuses[key] = focus;
                updateConditionExprsByFocus(focus, conditionExprs);
                hasChanged = true;
            }
        }
    }
}

function updateConditionExprsByFocus(focus: Focus, conditionExprs: ConditionItem[]) {
    if (focus.allowBranch) {
        updateConditionExprs(focus.allowBranch, conditionExprs);
    }

    for (const offset of focus.offset) {
        if (offset.trigger) {
            updateConditionExprs(offset.trigger, conditionExprs);
        }
    }
}

function updateConditionExprs(expr: ConditionComplexExpr, conditionExprs: ConditionItem[]) {
    if (typeof expr === 'boolean') {
        return;
    }

    if (!('items' in expr)) {
        if (!conditionExprs.some(e => isEqual(expr, e))) {
            conditionExprs.push(expr);
        }
        return;
    }

    for (const item of expr.items) {
        updateConditionExprs(item, conditionExprs);
    }
}

function getAllowBranchOptions(focuses: Record<string, Focus>): string[] {
    return chain(focuses)
        .filter(f => f.hasAllowBranch && f.allowBranch !== true)
        .map(f => f.id)
        .uniq()
        .value();
}
