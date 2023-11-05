import { ConditionComplexExpr, ConditionItem, extractConditionValue, extractConditionValues } from "../../hoiformat/condition";
import { Node, Token } from "../../hoiformat/hoiparser";
import { CustomMap, Enum, HOIPartial, Raw, SchemaDef, convertNodeToJson } from "../../hoiformat/schema";
import { Warning, randomString } from "../../util/common";

export interface Mio {
    id: string;
    traits: Record<string, MioTrait>;
    conditionExprs: ConditionItem[];
    warnings: Warning<string>[];
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

    for (const traitDef of [...mioDef.trait, ...mioDef.add_trait]) {
        const trait = getTrait(traitDef, filePath, conditionExprs);
        traits[trait.id] = trait;
    }

    for (const traitDef of mioDef.override_trait) {
        overrideTrait(traitDef, traits, filePath, conditionExprs);
    }

    return {
        id,
        traits,
        conditionExprs,
        warnings: [],
    };
}

function getTrait(traitDef: HOIPartial<MioTraitDef>, filePath: string, conditionExprs: ConditionItem[]): MioTrait {
    const id = traitDef.token ?? `[missing_token_${randomString(8)}]`;
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

function overrideTrait(traitDef: HOIPartial<MioTraitDef>, traits: Record<string, MioTrait>, filePath: string, conditionExprs: ConditionItem[]) {
    const id = traitDef.token;
    if (!id) {
        return;
    }

    const trait = traits[id];
    if (!trait) {
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

