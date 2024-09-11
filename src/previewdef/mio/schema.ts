import { ConditionComplexExpr, ConditionItem, extractConditionValue, extractConditionValues } from "../../hoiformat/condition";
import { Node, Token } from "../../hoiformat/hoiparser";
import { CustomMap, Enum, HOIPartial, Raw, SchemaDef, convertNodeToJson } from "../../hoiformat/schema";
import { Warning, randomString } from "../../util/common";
import { localize } from "../../util/i18n";

export interface Mio {
    id: string;
    traits: Record<string, MioTrait>;
    conditionExprs: ConditionItem[];
    warnings: MioWarning[];
}

export interface MioWarning extends Warning<string> {
    navigations?: { file: string, start: number, end: number }[];
}

export type TraitEffect = 'equiment' | 'production' | 'organization';

export interface MioTrait {
    id: string;
    name: string;
    icon: string | undefined;
    anyParent: string[];
    allParents: string[];
    exclusive: string[];
    parent: {
        traits: string[];
        numNeeded: number;
    } | undefined;
    x: number;
    y: number;
    relativePositionId: string | undefined;
    visible: ConditionComplexExpr;
    hasVisible: boolean;
    specialTraitBackground: boolean;
    effects: TraitEffect[];
    token: Token | undefined;
    file: string;
}

interface MioDef {
    include: string;
    trait: MioTraitDef[];
    add_trait: MioTraitDef[];
    override_trait: MioTraitDef[];
    remove_trait: Enum;
}

interface MioTraitDef {
    token: string;
    name: string;
    icon: string;
    any_parent: Enum;
    all_parents: Enum;
    parent: {
        traits: Enum;
        num_parents_needed: number;
    };
    mutually_exclusive: Enum;
    position: {
        x: number;
        y: number;
    };
    relative_position_id: string;
    special_trait_background: boolean;
    visible: Raw;
    equipment_bonus: Raw;
    production_bonus: Raw;
    organization_modifier: Raw;
    _token: Token;
}

type MioFile = CustomMap<MioDef>;

const mioTraitSchema: SchemaDef<MioTraitDef> = {
    token: "string",
    name: "string",
    icon: "string",
    any_parent: "enum",
    all_parents: "enum",
    parent: {
        traits: "enum",
        num_parents_needed: "number",
    },
    mutually_exclusive: "enum",
    position: {
        x: "number",
        y: "number",
    },
    relative_position_id: "string",
    visible: "raw",
    special_trait_background: "boolean",
    equipment_bonus: "raw",
    production_bonus: "raw",
    organization_modifier: "raw",
};

const mioSchema: SchemaDef<MioDef> = {
    include: "string",
    trait: {
        _innerType: mioTraitSchema,
        _type: "array",
    },
    add_trait: {
        _innerType: mioTraitSchema,
        _type: "array",
    },
    override_trait: {
        _innerType: mioTraitSchema,
        _type: "array",
    },
    remove_trait: "enum",
};

const mioFileSchema: SchemaDef<MioFile> = {
    _innerType: mioSchema,
    _type: "map",
};

export function getMiosFromFile(node: Node, dependentMios: Mio[], filePath: string): Mio[] {
    const file = convertNodeToJson<MioFile>(node, mioFileSchema);
    const dependencies: Mio[] = [...dependentMios];
    const result: Mio[] = [];

    for (const key in file._map) {
        const mio = getMio(file._map[key], dependencies, filePath);
        dependencies.push(mio);
        if (!file._map[key]._value.include) {
            result.push(mio);
        }
    }

    // Run twice in case dependent mio is in current file.
    for (const key in file._map) {
        if (file._map[key]._value.include) {
            const mio = getMio(file._map[key], dependencies, filePath);
            result.push(mio);
        }
    }

    return result;
}

function getMio(mioDefItem: { _key: string, _value: HOIPartial<MioDef> }, dependentMios: Mio[], filePath: string): Mio {
    const id = mioDefItem._key;
    const mioDef = mioDefItem._value;
    const baseMio = mioDef.include ? dependentMios.find(m => m.id === mioDef.include) : undefined;
    const traits = baseMio?.traits ? {...baseMio.traits} : {};
    const conditionExprs = baseMio?.conditionExprs ? [...baseMio.conditionExprs] : [];
    const warnings: MioWarning[] = [];

    if (mioDef.include && mioDef.trait.length > 0) {
        warnings.push({
            source: id,
            text: localize('miopreview.warnings.traitAndIncludeCheck1', 'Military industrial organization {0} has include property. It should use add_trait, remove_trait or override_trait instead of trait.', id),
        });
    }

    if (!mioDef.include && (mioDef.add_trait.length > 0 || mioDef.override_trait.length > 0 || mioDef.remove_trait._values.length > 0)) {
        warnings.push({
            source: id,
            text: localize('miopreview.warnings.traitAndIncludeCheck2', 'Military industrial organization {0} doesn\'t have include property. It should use trait instead of add_trait, remove_trait or override_trait.', id),
        });
    }

    for (const traitDef of [...mioDef.trait, ...mioDef.add_trait]) {
        const trait = getTrait(traitDef, filePath, warnings, conditionExprs);
        if (traits[trait.id]) {
            warnings.push({
                source: id,
                text: localize('miopreview.warnings.traitConflict', 'There\'re more than one trait with ID {0} in military industrial organization {1} in files: {2}, {3}.', trait.id, id, traits[trait.id].file, filePath),
            });
        }
        traits[trait.id] = trait;
    }

    for (const traitDef of mioDef.override_trait) {
        overrideTrait(traitDef, traits, filePath, warnings, conditionExprs);
    }

    for (const traitId of mioDef.remove_trait._values) {
        if (traitId && traits[traitId]) {
            traits[traitId] = {
                ...traits[traitId],
                hasVisible: true,
                visible: false,
            };
        }
    }

    validateRelativePositionId(traits, warnings);

    return {
        id,
        traits,
        conditionExprs,
        warnings,
    };
}

function validateRelativePositionId(traits: Record<string, MioTrait>, warnings: MioWarning[]) {
    const relativePositionId: Record<string, MioTrait | undefined> = {};
    const relativePositionIdChain: string[] = [];
    const circularReported: Record<string, boolean> = {};

    for (const trait of Object.values(traits)) {
        if (trait.relativePositionId === undefined) {
            continue;
        }

        if (!(trait.relativePositionId in traits)) {
            warnings.push({
                text: localize('miopreview.warnings.relativepositionidnotexist', 'Relative position ID of trait {0} not exist: {1}.', trait.id, trait.relativePositionId),
                source: trait.id,
            });
            continue;
        }

        relativePositionIdChain.length = 0;
        relativePositionId[trait.id] = traits[trait.relativePositionId];
        let currentTrait: MioTrait | undefined = trait;
        while (currentTrait) {
            if (circularReported[currentTrait.id]) {
                break;
            }

            relativePositionIdChain.push(currentTrait.id);
            const nextFocus: MioTrait | undefined = relativePositionId[currentTrait.id];
            if (nextFocus && relativePositionIdChain.includes(nextFocus.id)) {
                relativePositionIdChain.forEach(r => circularReported[r] = true);
                relativePositionIdChain.push(nextFocus.id);
                warnings.push({
                    text: localize('miopreview.warnings.relativepositioncircularref', "There're circular reference in relative position ID of these traits: {0}.", relativePositionIdChain.join(' -> ')),
                    source: trait.id,
                });
                break;
            }
            currentTrait = nextFocus;
        }
    }
}

function getTrait(traitDef: HOIPartial<MioTraitDef>, filePath: string, warnings: MioWarning[], conditionExprs: ConditionItem[]): MioTrait {
    const id = traitDef.token ?? `[missing_token_${randomString(8)}]`;

    if (!traitDef.token) {
        warnings.push({
            text: localize('miopreview.warnings.traitnoid', "A trait defined in this file don't have token property: {0}.", filePath),
            source: id,
        });
    }

    const x = traitDef.position?.x ?? 0;
    const y = traitDef.position?.y ?? 0;
    const name = traitDef.name ?? '';
    const parent = traitDef.parent && traitDef.parent.traits._values.length > 0 ? {
        traits: traitDef.parent.traits._values,
        numNeeded: traitDef.parent.num_parents_needed ?? 1,
    } : undefined;

    const visible = traitDef.visible ? extractConditionValue(traitDef.visible._raw.value, { scopeName: '', scopeType: 'mio' }, conditionExprs).condition : true;
    const effects: TraitEffect[] = [];
    if (traitDef.equipment_bonus?._raw.value) {
        effects.push('equiment');
    }
    if (traitDef.production_bonus?._raw.value) {
        effects.push('production');
    }
    if (traitDef.organization_modifier?._raw.value) {
        effects.push('organization');
    }

    return {
        id,
        name,
        icon: traitDef.icon,
        x,
        y,
        anyParent: traitDef.any_parent._values,
        allParents: traitDef.all_parents._values,
        parent,
        exclusive: traitDef.mutually_exclusive._values,
        relativePositionId: traitDef.relative_position_id,
        visible,
        hasVisible: traitDef.visible !== undefined,
        specialTraitBackground: traitDef.special_trait_background ?? false,
        effects,
        token: traitDef._token,
        file: filePath,
    };
}

function overrideTrait(traitDef: HOIPartial<MioTraitDef>, traits: Record<string, MioTrait>, filePath: string, warnings: MioWarning[], conditionExprs: ConditionItem[]) {
    const id = traitDef.token;
    if (!id) {
        warnings.push({
            text: localize('miopreview.warnings.overridetraitnoid', "An override_trait defined in this file don't have token property: {0}.", filePath),
            source: `unknown`,
        });
        return;
    }

    const trait = traits[id];
    if (!trait) {
        warnings.push({
            text: localize('miopreview.warnings.overridetraitidnotexist', "An override_trait referenced a trait that doesn't exist: {0}.", id),
            source: id,
        });
        return;
    }

    trait.name = traitDef.name ?? trait.name;
    trait.icon = traitDef.icon ?? trait.icon;
    trait.x = traitDef.position?.x ?? trait.x;
    trait.y = traitDef.position?.y ?? trait.y;
    trait.anyParent = traitDef.any_parent._values.length > 0 ? traitDef.any_parent._values : trait.anyParent;
    trait.allParents = traitDef.all_parents._values.length > 0 ? traitDef.all_parents._values : trait.allParents;
    trait.parent = traitDef.parent && traitDef.parent.traits._values.length > 0 ? {
        traits: traitDef.parent.traits._values,
        numNeeded: traitDef.parent.num_parents_needed ?? 1,
    } : trait.parent;
    trait.exclusive = traitDef.mutually_exclusive._values.length > 0 ? traitDef.mutually_exclusive._values : trait.exclusive;
    trait.relativePositionId = traitDef.relative_position_id ?? trait.relativePositionId;
    trait.specialTraitBackground = traitDef.special_trait_background ?? trait.specialTraitBackground;
    trait.visible = traitDef.visible ?
        extractConditionValue(traitDef.visible._raw.value, { scopeName: '', scopeType: 'mio' }, conditionExprs).condition :
        trait.visible;
    trait.hasVisible = traitDef.visible !== undefined || trait.hasVisible;
    if (traitDef._token) {
        trait.token = traitDef._token;
        trait.file = filePath;
    }
}

