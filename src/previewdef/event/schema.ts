import { Node, Token } from "../../hoiformat/hoiparser";
import { Raw, SchemaDef, convertNodeToJson, HOIPartial, isSymbolNode } from "../../hoiformat/schema";
import { extractEffectValue, EffectItem, EffectComplexExpr } from "../../hoiformat/effect";
import { Scope, ScopeType } from "../../hoiformat/scope";
import { uniqBy } from "lodash";

export interface HOIEvents {
    eventItemsByNamespace: Record<string, HOIEvent[]>;
}

export type HOIEventType = 'country' | 'state' | 'unit_leader' | 'news' | 'operative_leader';

export interface HOIEvent {
    type: HOIEventType;
    id: string;
    title: string;
    namespace: string;
    picture: string;
    immediate: HOIEventOption;
    options: HOIEventOption[];
    token: Token | undefined;
    major: boolean;
    hidden: boolean;
    isTriggeredOnly: boolean;
    meanTimeToHappenBase: number;
    fire_only_once: boolean;
    file: string;
}

export interface HOIEventOption {
    name?: string;
    childEvents: ChildEvent[];
    token: Token | undefined;
}

export interface ChildEvent {
    scopeName: string;
    eventName: string;
}

interface EventFile {
    add_namespace: string[];
    country_event: EventDef[];
    news_event: EventDef[];
    state_event: EventDef[];
    unit_leader_event: EventDef[];
    operative_leader_event: EventDef[];
}

interface EventDef {
    id: string;
    title: string;
    picture: string;
    is_triggered_only: boolean;
    major: boolean;
    hidden: boolean;
    mean_time_to_happen: MeanTimeToHappen;
    fire_only_once: boolean;
    option: Raw[];
    immediate: Raw;
    _token: Token;
}

interface MeanTimeToHappen {
    base: number;
    factor: number;
    days: number;
    months: number;
    years: number;
}

interface EventOptionDef {
    name: string;
    trigger: Raw;
    ai_chance: string;
    original_recipient_only: boolean;
    _token: Token;
}

const eventOptionDefSchema: SchemaDef<EventOptionDef> = {
    name: "string",
    trigger: "raw",
    ai_chance: "string",
    original_recipient_only: "boolean",
};

const eventDefSchema: SchemaDef<EventDef> = {
    id: "string",
    title: "string",
    picture: "string",
    is_triggered_only: "boolean",
    major: "boolean",
    hidden: "boolean",
    fire_only_once: "boolean",
    mean_time_to_happen: {
        base: "number",
        factor: "number",
        days: "number",
        months: "number",
        years: "number",
    },
    option: {
        _innerType: "raw",
        _type: "array",
    },
    immediate: "raw",
};

const eventFileSchema: SchemaDef<EventFile> = {
    add_namespace: {
        _innerType: "string",
        _type: "array",
    },
    country_event: {
        _innerType: eventDefSchema,
        _type: "array",
    },
    news_event: {
        _innerType: eventDefSchema,
        _type: "array",
    },
    unit_leader_event: {
        _innerType: eventDefSchema,
        _type: "array",
    },
    state_event: {
        _innerType: eventDefSchema,
        _type: "array",
    },
    operative_leader_event: {
        _innerType: eventDefSchema,
        _type: "array",
    },
};

export function getEvents(node: Node, filePath: string): HOIEvents {
    const eventFile = convertNodeToJson<EventFile>(node, eventFileSchema);
    const eventItemsByNamespace: Record<string, HOIEvent[]> = {};
    for (const namespace of eventFile.add_namespace) {
        if (namespace) {
            eventItemsByNamespace[namespace] = [];
        }
    }

    fillEvents(eventFile.country_event, 'country', filePath, eventItemsByNamespace);
    fillEvents(eventFile.news_event, 'news', filePath, eventItemsByNamespace);
    fillEvents(eventFile.state_event, 'state', filePath, eventItemsByNamespace);
    fillEvents(eventFile.unit_leader_event, 'unit_leader', filePath, eventItemsByNamespace);
    fillEvents(eventFile.operative_leader_event, 'operative_leader', filePath, eventItemsByNamespace);

    return {
        eventItemsByNamespace,
    };
}

function fillEvents(eventDefs: HOIPartial<EventDef>[], type: HOIEventType, filePath: string, eventItemsByNamespace: Record<string, HOIEvent[]>) {
    for (const eventDef of eventDefs) {
        const converted = convertEvent(eventDef, filePath, type);
        if (converted) {
            const listOfNamespace = eventItemsByNamespace[converted.namespace];
            if (listOfNamespace) {
                listOfNamespace.push(converted);
            }
        }
    }
}

function eventTypeToScopeType(eventType: HOIEventType): ScopeType {
    switch (eventType) {
        case 'country':
        case 'news':
            return 'country';
        case 'state':
            return 'state';
        case 'unit_leader':
            return 'leader';
        case 'operative_leader':
            return 'operative';
        default:
            return 'unknown';
    }
}

function convertEvent<T extends HOIEventType>(eventDef: HOIPartial<EventDef>, file: string, type: T): HOIEvent & { type: T } | undefined {
    if (!eventDef.id) {
        return undefined;
    }

    const id = eventDef.id;
    const title = eventDef.title ?? (id + '.t');
    const namespace = id.split('.')[0];
    const picture = eventDef.picture ?? '';

    const scopeType = eventTypeToScopeType(type);
    const scope: Scope = { scopeName: `{event_target}`, scopeType };

    const immediate = convertOption(eventDef.immediate, scope);
    const options = eventDef.option.map(o => convertOption(o, scope));

    const meanTimeToHappenBase = eventDef.mean_time_to_happen ?
        Math.floor(eventDef.mean_time_to_happen.factor ??
            eventDef.mean_time_to_happen.base ??
            eventDef.mean_time_to_happen.days ??
            (eventDef.mean_time_to_happen.months ? Math.floor(eventDef.mean_time_to_happen.months) * 30 : undefined) ??
            (eventDef.mean_time_to_happen.years ? Math.floor(eventDef.mean_time_to_happen.years) * 365 : undefined) ??
            1) :
        1;

    return {
        type,
        id,
        title,
        namespace,
        picture,
        file,
        immediate,
        options,
        token: eventDef._token,
        major: !!eventDef.major,
        hidden: !!eventDef.hidden,
        isTriggeredOnly: !!eventDef.is_triggered_only,
        meanTimeToHappenBase,
        fire_only_once: !!eventDef.fire_only_once,
    };
}

function convertOption(optionRaw: Raw | undefined, scope: Scope): HOIEventOption {
    if (optionRaw === undefined) {
        return { childEvents: [], token: undefined };
    }

    const optionDef = convertNodeToJson<EventOptionDef>(optionRaw._raw, eventOptionDefSchema);
    const name = optionDef.name;
    
    const effect = extractEffectValue(optionRaw._raw.value, scope);
    const childEventItems = findChildEventItems(effect.effect);
    const childEvents = childEventItems
        .map(item => ({ scopeName: item.scopeName, eventName: getEventId(item.node) }))
        .filter((e): e is ChildEvent => e.eventName !== undefined);
    const uniqueChildEvents = uniqBy(childEvents, e => e.eventName + '@' + e.scopeName);

    return {
        name,
        childEvents: uniqueChildEvents,
        token: optionDef._token,
    };
}

const eventTypes = ['country_event', 'news_event', 'state_event', 'unit_leader_event', 'operative_leader_event'];

function findChildEventItems(effect: EffectComplexExpr, result: EffectItem[] = []): EffectItem[] {
    if (effect === null) {
        return result;
    }

    if ('nodeContent' in effect) {
        if (effect.node.name && eventTypes.includes(effect.node.name?.toLowerCase())) {
            result.push(effect);
        }
    } else if ('condition' in effect) {
        effect.items.forEach(item => findChildEventItems(item, result));
    } else {
        effect.items.forEach(item => findChildEventItems(item.effect, result));
    }

    return result;
}

function getEventId(node: Node): string | undefined {
    if (isSymbolNode(node.value)) {
        return node.value.name;
    }

    if (typeof node.value === 'string') {
        return node.value;
    }

    const callEventDef = convertNodeToJson<{ id: string }>(node, { id: "string" });
    return callEventDef.id;
}
