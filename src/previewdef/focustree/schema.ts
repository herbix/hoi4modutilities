import { Node, Token } from "../../hoiformat/hoiparser";
import { HOIPartial, SchemaDef, Position, convertNodeToJson, positionSchema, Raw, isSymbolNode } from "../../hoiformat/schema";
import { normalizeNumberLike } from "../../util/hoi4gui/common";
import { flatten, chain, isEqual } from 'lodash';
import { ConditionItem, ConditionComplexExpr, extractConditionValues, extractConditionValue } from "../../hoiformat/condition";
import { countryScope } from "../../hoiformat/scope";
import { useConditionInFocus } from "../../util/featureflags";
import { randomString, Warning } from "../../util/common";
import { localize } from "../../util/i18n";

export interface FocusTree {
    id: string;
    focuses: Record<string, Focus>;
    allowBranchOptions: string[];
    conditionExprs: ConditionItem[];
    isSharedFocues: boolean;
    continuousFocusPositionX?: number;
    continuousFocusPositionY?: number;
    warnings: FocusWarning[];
}

interface FocusIconWithCondition {
    icon: string | undefined;
    condition: ConditionComplexExpr;
}

export interface Focus {
    x: number;
    y: number;
    id: string;
    icon: FocusIconWithCondition[];
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

export interface FocusWarning extends Warning<string> {
    navigations?: { file: string, start: number, end: number }[];
}

interface Offset {
    x: number;
    y: number;
    trigger: ConditionComplexExpr | undefined;
}

interface FocusTreeDef {
    id: string;
    shared_focus: string[];
    focus: FocusDef[];
    continuous_focus_position: Position;
}

interface FocusDef {
    id: string;
    icon: Raw[];
    x: number;
    y: number;
    prerequisite: FocusOrORList[];
    mutually_exclusive: FocusOrORList[];
    relative_position_id: string;
    allow_branch: Raw[]; /* FIXME not symbol node */
    offset: OffsetDef[];
    _token: Token;
}

interface FocusIconDef {
    trigger: Raw;
    value: string;
}

interface OffsetDef {
    x: number;
    y: number;
    trigger: Raw[];
}

interface FocusOrORList {
    focus: string[];
    OR: string[];
}

interface FocusFile {
    focus_tree: FocusTreeDef[];
    shared_focus: FocusDef[];
    joint_focus: FocusDef[];
}

const focusOrORListSchema: SchemaDef<FocusOrORList> = {
    focus: {
        _innerType: "string",
        _type: 'array',
    },
    OR: {
        _innerType: "string",
        _type: 'array',
    },
};

const focusSchema: SchemaDef<FocusDef> = {
    id: "string",
    icon: {
        _innerType: 'raw',
        _type: 'array',
    },
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
    relative_position_id: "string",
    allow_branch: {
        _innerType: 'raw',
        _type: 'array',
    },
    offset: {
        _innerType: {
            x: "number",
            y: "number",
            trigger: {
                _innerType: 'raw',
                _type: 'array',
            },
        },
        _type: 'array',
    }
};

const focusTreeSchema: SchemaDef<FocusTreeDef> = {
    id: "string",
    shared_focus: {
        _innerType: "string",
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
    joint_focus: {
        _innerType: focusSchema,
        _type: "array",
    },
};

const focusIconSchema: SchemaDef<FocusIconDef> = {
    trigger: "raw",
    value: "string",
};

export function getFocusTree(node: Node, sharedFocusTrees: FocusTree[], filePath: string): FocusTree[] {
    const focusTrees: FocusTree[] = [];
    const constants = {};
    const file = convertNodeToJson<FocusFile>(node, focusFileSchema, constants);

    if (file.shared_focus.length > 0) {
        const conditionExprs: ConditionItem[] = [];
        const warnings: FocusWarning[] = [];
        const focuses = getFocuses([...file.shared_focus, ...file.joint_focus], conditionExprs, filePath, warnings, constants);
        const sharedFocusTree = {
            id: localize('focustree.sharedfocuses', '<Shared focuses>'),
            focuses,
            allowBranchOptions: getAllowBranchOptions(focuses),
            conditionExprs,
            isSharedFocues: true,
            warnings,
        };
        focusTrees.push(sharedFocusTree);
        sharedFocusTrees = [sharedFocusTree, ...sharedFocusTrees];
    }

    for (const focusTree of file.focus_tree) {
        const conditionExprs: ConditionItem[] = [];
        const warnings: FocusWarning[] = [];
        const focuses = getFocuses(focusTree.focus, conditionExprs, filePath, warnings, constants);
        
        if (useConditionInFocus) {
            for (const sharedFocus of focusTree.shared_focus) {
                if (!sharedFocus) {
                    continue;
                }
                addSharedFocus(focuses, filePath, sharedFocusTrees, sharedFocus, conditionExprs, warnings);
            }
        }

        validateRelativePositionId(focuses, warnings);

        focusTrees.push({
            id: focusTree.id ?? localize('focustree.ananymous', '<Anonymous focus tree>'),
            focuses,
            allowBranchOptions: getAllowBranchOptions(focuses),
            continuousFocusPositionX: normalizeNumberLike(focusTree.continuous_focus_position?.x, 0) ?? 50,
            continuousFocusPositionY: normalizeNumberLike(focusTree.continuous_focus_position?.y, 0) ?? 1000,
            conditionExprs,
            isSharedFocues: false,
            warnings,
        });
    }

    return focusTrees;
}

function getFocuses(hoiFocuses: HOIPartial<FocusDef>[], conditionExprs: ConditionItem[], filePath: string, warnings: FocusWarning[], constants: {}): Record<string, Focus> {
    const focuses: Record<string, Focus> = {};

    for (const hoiFocus of hoiFocuses) {
        const focus = getFocus(hoiFocus, conditionExprs, filePath, warnings, constants);
        if (focus !== null) {
            if (focus.id in focuses) {
                const otherFocus = focuses[focus.id];
                warnings.push({
                    text: localize('focustree.warnings.focusidconflict', "There're more than one focuses with ID {0} in file: {1}.", focus.id, filePath),
                    source: focus.id,
                    navigations: [
                        {
                            file: filePath,
                            start: focus.token?.start ?? 0,
                            end: focus.token?.end ?? 0,
                        },
                        {
                            file: filePath,
                            start: otherFocus.token?.start ?? 0,
                            end: otherFocus.token?.end ?? 0,
                        },
                    ]
                });
            }
            focuses[focus.id] = focus;
        }
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

function getFocus(hoiFocus: HOIPartial<FocusDef>, conditionExprs: ConditionItem[], filePath: string, warnings: FocusWarning[], constants: {}): Focus | null {
    const id = hoiFocus.id ?? `[missing_id_${randomString(8)}]`;

    if (!hoiFocus.id) {
        warnings.push({
            text: localize('focustree.warnings.focusnoid', "A focus defined in this file don't have ID: {0}.", filePath),
            source: id,
        });
    }

    const x = hoiFocus.x ?? 0;
    const y = hoiFocus.y ?? 0;
    const relativePositionId = hoiFocus.relative_position_id;

    const exclusive = chain(hoiFocus.mutually_exclusive)
        .flatMap(f => f.focus.concat(f.OR))
        .filter((s): s is string => s !== undefined)
        .value();
    const prerequisite = hoiFocus.prerequisite
        .map(p => p.focus.concat(p.OR).filter((s): s is string => s !== undefined));
    const icon = parseFocusIcon(hoiFocus.icon.filter((v): v is Raw => v !== undefined).map(v => v._raw), constants, conditionExprs);
    const hasAllowBranch = hoiFocus.allow_branch.length > 0;
    const allowBranchCondition = extractConditionValues(hoiFocus.allow_branch.filter((v): v is Raw => v !== undefined).map(v => v._raw.value), countryScope, conditionExprs).condition;
    const offset: Offset[] = hoiFocus.offset.map(o => ({
        x: o.x ?? 0,
        y: o.y ?? 0,
        trigger: o.trigger ? extractConditionValues(o.trigger.filter((v): v is Raw => v !== undefined).map(v => v._raw.value), countryScope, conditionExprs).condition : false,
    }));

    return {
        id,
        icon,
        x,
        y,
        relativePositionId,
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

function addSharedFocus(focuses: Record<string, Focus>, filePath: string, sharedFocusTrees: FocusTree[], sharedFocusId: string, conditionExprs: ConditionItem[], warnings: FocusWarning[]) {
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
                if (focus.id in focuses) {
                    const otherFocus = focuses[focus.id];
                    warnings.push({
                        text: localize('focustree.warnings.focusidconflict2', "There're more than one focuses with ID {0} in files: {1}, {2}.", focus.id, filePath, focus.file),
                        source: focus.id,
                        navigations: [
                            {
                                file: focus.file,
                                start: focus.token?.start ?? 0,
                                end: focus.token?.end ?? 0,
                            },
                            {
                                file: filePath,
                                start: otherFocus.token?.start ?? 0,
                                end: otherFocus.token?.end ?? 0,
                            },
                        ]
                    });
                }
                focuses[key] = focus;
                updateConditionExprsByFocus(focus, conditionExprs);
                hasChanged = true;
            }
        }
    }

    for (const warning of sharedFocusTree.warnings) {
        if (warning.source in focuses) {
            warnings.push(warning);
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

    for (const icon of focus.icon) {
        updateConditionExprs(icon.condition, conditionExprs);
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

function validateRelativePositionId(focuses: Record<string, Focus>, warnings: FocusWarning[]) {
    const relativePositionId: Record<string, Focus | undefined> = {};
    const relativePositionIdChain: string[] = [];
    const circularReported: Record<string, boolean> = {};

    for (const focus of Object.values(focuses)) {
        if (focus.relativePositionId === undefined) {
            continue;
        }

        if (!(focus.relativePositionId in focuses)) {
            warnings.push({
                text: localize('focustree.warnings.relativepositionidnotexist', 'Relative position ID of focus {0} not exist: {1}.', focus.id, focus.relativePositionId),
                source: focus.id,
            });
            continue;
        }

        relativePositionIdChain.length = 0;
        relativePositionId[focus.id] = focuses[focus.relativePositionId];
        let currentFocus: Focus | undefined = focus;
        while (currentFocus) {
            if (circularReported[currentFocus.id]) {
                break;
            }

            relativePositionIdChain.push(currentFocus.id);
            const nextFocus: Focus | undefined = relativePositionId[currentFocus.id];
            if (nextFocus && relativePositionIdChain.includes(nextFocus.id)) {
                relativePositionIdChain.forEach(r => circularReported[r] = true);
                relativePositionIdChain.push(nextFocus.id);
                warnings.push({
                    text: localize('focustree.warnings.relativepositioncircularref', "There're circular reference in relative position ID of these focuses: {0}.", relativePositionIdChain.join(' -> ')),
                    source: focus.id,
                });
                break;
            }
            currentFocus = nextFocus;
        }
    }
}

function parseFocusIcon(nodes: Node[], constants: {}, conditionExprs: ConditionItem[]): FocusIconWithCondition[] {
    return nodes.map(n => parseSingleFocusIcon(n, constants, conditionExprs)).filter((v): v is FocusIconWithCondition => v !== undefined);
}

function parseSingleFocusIcon(node: Node, constants: {}, conditionExprs: ConditionItem[]): FocusIconWithCondition {
    const stringResult = convertNodeToJson<string>(node, 'string', constants);
    if (stringResult) {
        return { icon: stringResult, condition: true };
    }
    
    const iconWithCondition = convertNodeToJson<FocusIconDef>(node, focusIconSchema, constants);
    return {
        icon: iconWithCondition.value,
        condition: iconWithCondition.trigger ? extractConditionValue(iconWithCondition.trigger._raw.value, countryScope, conditionExprs).condition : true,
    };
}
