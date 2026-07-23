import { State, Province, WorldMapWarning, WorldMapWarningSource, Region, StateCategory, Resource, Bookmark, BookmarkDate, WithCondition } from "../definitions";
import { Enum, SchemaDef, CustomMap, DetailValue, Raw, convertNodeToJson } from "../../../hoiformat/schema";
import { readFileFromModOrHOI4AsJson } from "../../../util/fileloader";
import { error } from "../../../util/debug";
import { LoadResult, FolderLoader, FileLoader, mergeInLoadResult, sortItems, mergeRegion, convertColor, LoadResultOD } from "./common";
import { Token } from "../../../hoiformat/hoiparser";
import { arrayToMap, UserError } from "../../../util/common";
import { DefaultMapLoader } from "./provincemap";
import { localize } from "../../../util/i18n";
import { LoaderSession, mergeInLoadResultUnique } from "../../../util/loader/loader";
import { flatMap, isEqual } from "lodash";
import { ResourceDefinitionLoader } from "./resource";
import { bookmarkDateToString, BookmarksLoader, compareBookmarkDate, toBookmarkDate } from "./bookmarks";
import { ConditionComplexExpr, ConditionItem, extractConditionalExprs, simplifyCondition } from "../../../hoiformat/condition";
import { EffectComplexExpr, EffectItem, extractEffectValue } from "../../../hoiformat/effect";
import { Scope } from "../../../hoiformat/scope";

interface StateFile {
    state: StateDefinition[];
}

interface StateDefinition {
    id: number;
    name: string;
    manpower: number;
    state_category: string;
    history: Raw;
    provinces: Enum;
    impassable: boolean;
    resources: CustomMap<number>;
    _token: Token;
}

interface StateHistory {
    owner: string;
    controller: string;
    victory_points: Enum[];
    add_core_of: string[];
}

const stateFileSchema: SchemaDef<StateFile> = {
    state: {
        _innerType: {
            id: "number",
            name: "string",
            manpower: "number",
            state_category: "string",
            history: "raw",
            provinces: "enum",
            impassable: "boolean",
            resources: {
                _innerType: "number",
                _type: "map",
            },
        },
        _type: "array",
    },
};

const stateHistorySchema: SchemaDef<StateHistory> = {
    owner: "string",
    controller: "string",
    victory_points: {
        _innerType: "enum",
        _type: "array",
    },
    add_core_of: {
        _innerType: "string",
        _type: "array",
    },
};

interface StateCategoryFile {
    state_categories: CustomMap<StateCategoryDefinition>;
}

interface StateCategoryDefinition {
    color: DetailValue<Enum>;
}

const stateCategoryFileSchema: SchemaDef<StateCategoryFile> = {
    state_categories: {
        _innerType: {
            color: {
                _innerType: "enum",
                _type: "detailvalue",
            },
        },
        _type: "map",
    },
};

type StateNoBoundingBox = Omit<State, keyof Region>;

type StateLoaderResult = { states: State[], badStatesCount: number };
export class StatesLoader extends FolderLoader<StateLoaderResult, StateNoBoundingBox[], [() => BookmarksLoader]> {
    private categoriesLoader: StateCategoriesLoader;

    constructor(private defaultMapLoader: DefaultMapLoader, private resourcesLoader: ResourceDefinitionLoader, private bookmarksLoader: BookmarksLoader) {
        super('history/states', StateLoader, () => this.bookmarksLoader);
        this.categoriesLoader = new StateCategoriesLoader();
        this.categoriesLoader.onProgress(e => this.onProgressEmitter.fire(e));
    }

    public async shouldReloadImpl(session: LoaderSession): Promise<boolean> {
        return await super.shouldReloadImpl(session) || await this.defaultMapLoader.shouldReload(session)
            || await this.categoriesLoader.shouldReload(session) || await this.resourcesLoader.shouldReload(session)
            || await this.bookmarksLoader.shouldReload(session);
    }

    protected async loadImpl(session: LoaderSession): Promise<LoadResult<StateLoaderResult>> {
        await this.fireOnProgressEvent(localize('worldmap.progress.loadingstates', 'Loading states...'));
        return super.loadImpl(session);
    }

    protected async mergeFiles(fileResults: LoadResult<StateNoBoundingBox[]>[], session: LoaderSession): Promise<LoadResult<StateLoaderResult>> {
        const provinceMap = await this.defaultMapLoader.load(session);
        const stateCategories = await this.categoriesLoader.load(session);
        const resources = arrayToMap((await this.resourcesLoader.load(session)).result, 'name');

        await this.fireOnProgressEvent(localize('worldmap.progress.mapprovincestostates', 'Mapping provinces to states...'));

        const warnings = mergeInLoadResult([stateCategories, ...fileResults], 'warnings');
        const conditionExprs = mergeInLoadResultUnique(fileResults, 'conditionExprs', (a, b) => a.nodeContent === b.nodeContent && a.scopeName === b.scopeName);
        const { provinces, width, height } = provinceMap.result;

        const states = flatMap(fileResults, c => c.result);

        const { sortedStates, badStateId } = sortStates(states, warnings);

        const filledStates: State[] = new Array(sortedStates.length);
        for (let i = badStateId + 1; i < sortedStates.length; i++) {
            if (sortedStates[i]) {
                const state = calculateBoundingBox(sortedStates[i], provinces, width, height, warnings);
                filledStates[i] = state;

                if (!(state.category in stateCategories.result)) {
                    warnings.push({
                        source: [{ type: 'state', id: i }],
                        relatedFiles: [ state.file ],
                        text: localize('worldmap.warnings.statecategorynotexist', "State category of state {0} is not defined: {1}.", i, state.category),
                    });
                }

                for (const key in state.resources) {
                    if (state.resources[key] !== undefined && !(key in resources)) {
                        warnings.push({
                            source: [{ type: 'state', id: i }],
                            relatedFiles: [ state.file ],
                            text: localize('worldmap.warnings.resourcenotexist', "Resource {0} used in state {1} is not defined.", key, i),
                        });
                    }
                }
            }
        }

        const badStatesCount = badStateId + 1;
        validateProvinceInState(provinces, filledStates, badStatesCount, warnings);

        return {
            result: {
                states: filledStates,
                badStatesCount,
            },
            dependencies: [this.folder + '/*', ...stateCategories.dependencies],
            warnings,
            conditionExprs,
        };
    }

    public toString() {
        return `[StatesLoader]`;
    }
}

class StateLoader extends FileLoader<StateNoBoundingBox[]> {
    constructor(file: string, private bookmarkLoaderGetter: () => BookmarksLoader) {
        super(file);
    }

    protected async loadFromFile(session: LoaderSession): Promise<LoadResultOD<StateNoBoundingBox[]>> {
        const bookmarks = await this.bookmarkLoaderGetter().load(session);
        const conditionExprs: ConditionItem[] = [];
        const warnings: WorldMapWarning[] = [];
        return {
            result: await loadState(this.file, warnings, bookmarks.result.bookmarks, conditionExprs),
            warnings,
            conditionExprs,
        };
    }

    public toString() {
        return `[StateLoader: ${this.file}]`;
    }
}

class StateCategoriesLoader extends FolderLoader<Record<string, StateCategory>, StateCategory[]> {
    constructor() {
        super('common/state_category', StateCategoryLoader);
    }

    protected async loadImpl(session: LoaderSession): Promise<LoadResult<Record<string, StateCategory>>> {
        await this.fireOnProgressEvent(localize('worldmap.progress.loadstatecategories', 'Loading state categories...'));
        return super.loadImpl(session);
    }

    protected async mergeFiles(fileResults: LoadResult<StateCategory[]>[]): Promise<LoadResult<Record<string, StateCategory>>> {
        const warnings = mergeInLoadResult(fileResults, 'warnings');
        const categories: Record<string, StateCategory> = {};

        fileResults.forEach(result => result.result.forEach(category => {
            if (category.name in categories) {
                warnings.push({
                    source: [{ type: 'statecategory', name: category.name }],
                    relatedFiles: [category.file, categories[category.name].file],
                    text: localize('worldmap.warnings.statecategoryconflict', "There're multiple state categories have name \"{0}\".", category.name),
                });
            }

            categories[category.name] = category;
        }));
    
        return {
            result: categories,
            dependencies: [this.folder + '/*'],
            warnings,
        };
    }

    public toString() {
        return `[StateCategoriesLoader]`;
    }
}

class StateCategoryLoader extends FileLoader<StateCategory[]> {
    protected async loadFromFile(): Promise<LoadResultOD<StateCategory[]>> {
        const warnings: WorldMapWarning[] = [];
        return {
            result: await loadStateCategory(this.file, warnings),
            warnings,
        };
    }

    public toString() {
        return `[StateCategoryLoader: ${this.file}]`;
    }
}

async function loadState(stateFile: string, globalWarnings: WorldMapWarning[], bookmarks: Bookmark[], conditionExprs: ConditionItem[]): Promise<StateNoBoundingBox[]> {
    try {
        const data = await readFileFromModOrHOI4AsJson<StateFile>(stateFile, stateFileSchema);
        const result: StateNoBoundingBox[] = [];

        for (const state of data.state) {
            const warnings: string[] = [];
            const id = state.id ? state.id : (warnings.push(localize('worldmap.warnings.statenoid', "A state in {0} doesn't have id field.", stateFile)), -1);
            const name = state.name ? state.name : (warnings.push(localize('worldmap.warnings.statenoname', "The state doesn't have name field.")), '');
            const manpower = state.manpower ?? 0;
            const category = state.state_category ? state.state_category : (warnings.push(localize('worldmap.warnings.statenocategory', "The state doesn't have category field.")), '');
            const provinces = state.provinces._values.map(v => parseInt(v));
            const impassable = state.impassable ?? false;
            const resources = arrayToMap(
                Object.values(state.resources._map), '_key', v => v._value);
            const { owner, controller, victoryPoints, cores } = loadStateHistory(id, state.history, bookmarks, conditionExprs);

            if (provinces.length === 0) {
                globalWarnings.push({
                    source: [{ type: 'state', id }],
                    relatedFiles: [stateFile],
                    text: localize('worldmap.warnings.statenoprovinces', "State {0} in \"{1}\" doesn't have provinces.", id, stateFile),
                });
            }

            for (const vpProvince of Object.keys(victoryPoints)) {
                if (!provinces.includes(parseInt(vpProvince))) {
                    warnings.push(localize('worldmap.warnings.provincenothere', 'Province {0} not included in this state. But victory points defined here.', vpProvince));
                }
            }

            globalWarnings.push(...warnings.map<WorldMapWarning>(warning => ({
                source: [{ type: 'state', id }],
                relatedFiles: [stateFile],
                text: warning,
            })));

            result.push({
                id, name, manpower, category, owner, controller, provinces, cores, impassable, victoryPoints, resources,
                file: stateFile,
                token: state._token ?? null,
            });
        }

        return result;
    } catch (e) {
        error(e);
        return [];
    }
}

function loadStateHistory(
    stateId: number,
    rawHistory: Raw | undefined,
    bookmarks: Bookmark[],
    conditionExprs: ConditionItem[]
): Pick<State, 'owner' | 'controller' | 'victoryPoints' | 'cores'> {
    const history = rawHistory?._raw ? convertNodeToJson<StateHistory>(rawHistory?._raw, stateHistorySchema) : undefined;
    const defaultOwner = history?.owner;
    const defaultController = history?.controller;
    const cores = history?.add_core_of.filter((v, i, a): v is string => v !== undefined && i === a.indexOf(v)).map(v => ({ value: v, condition: true })) ?? [];
    const victoryPointsArray = history?.victory_points.filter(v => v._values.length >= 2).map(v => v._values.slice(0, 2).map(v => parseInt(v)) as [number, number]) ?? [];
    const victoryPoints = arrayToMap(victoryPointsArray, "0", v => v[1]);
    
    if (bookmarks.length === 0) {
        return {
            owner: defaultOwner ? [{ value: defaultOwner, condition: true }] : [],
            controller: defaultController ? [{ value: defaultController, condition: true }] : [],
            victoryPoints,
            cores,
        };
    }

    // to flatten the history items into a list of {date, effect, condition} and sort by date
    const scope: Scope = { scopeName: `State ${stateId}`, scopeType: 'state' };
    const dateHistory = rawHistory?._raw ? convertNodeToJson<CustomMap<Raw>>(rawHistory?._raw, { _innerType: "raw", _type: "map" }) : undefined;
    const dateHistoryEffects: { date: BookmarkDate, effects: { effect: EffectItem, condition: ConditionComplexExpr }[] }[] = [];
    for (const {_key, _value} of Object.values(dateHistory?._map ?? {})) {
        if (!_key.match(/^\d{4}\.\d{1,2}\.\d{1,2}$/)) {
            continue;
        }

        if (!_value?._raw.value) {
            continue;
        }
        
        const effect = extractEffectValue(_value?._raw.value, scope);
        dateHistoryEffects.push({ date: toBookmarkDate(_key), effects: findHistoryItems(effect.effect) });
    }
    dateHistoryEffects.sort((a, b) => compareBookmarkDate(a.date, b.date));

    const owner: WithCondition<string>[] = [];
    if (defaultOwner) {
        owner.push({ value: defaultOwner, condition: true });
    }

    const controller: WithCondition<string>[] = [];
    if (defaultController) {
        controller.push({ value: defaultController, condition: true });
    }

    if (dateHistoryEffects.some(e => e.effects.length > 0)) {
        const bookmarkConditions: ConditionItem[] = [];
        for (let i = 0; i < bookmarks.length; i++) {
            bookmarkConditions.push({ scopeName: '', nodeContent: bookmarkDateToString(bookmarks[i].date) });
        }

        let bookmarkCondition: ConditionComplexExpr = true;
        for (let i = 0, j = 0; i < bookmarks.length && j < dateHistoryEffects.length;) {
            const bookmark = bookmarks[i];
            const dateHistoryEffect = dateHistoryEffects[j];
            if (compareBookmarkDate(dateHistoryEffect.date, bookmark.date) >= 0) {
                i++;
                bookmarkCondition = { type: 'or', items: bookmarkConditions.slice(i) };
                continue;
            }
            for (const { effect, condition } of dateHistoryEffect.effects) {
                extractFromEffect(stateId, scope, effect, condition, bookmarkCondition, owner, controller, cores, conditionExprs);
            }
            j++;
        }
        owner.reverse();
        controller.reverse();
    }

    return { owner, controller, victoryPoints, cores };
}

const historyItemTypes = [
    'owner', 'transfer_state_to', 'transfer_state',
    'controller', 'set_state_controller', 'set_state_controller_to',
    'add_core_of', 'remove_core_of',
    // TODO 'add_victory_points', 'set_victory_points',
];
function findHistoryItems(
    effect: EffectComplexExpr,
    conditions: ConditionComplexExpr[] = [],
    result: { effect: EffectItem, condition: ConditionComplexExpr }[] = []
): { effect: EffectItem, condition: ConditionComplexExpr }[] {
    if (effect === null) {
        return result;
    }

    if ('nodeContent' in effect) {
        if (effect.node.name && historyItemTypes.includes(effect.node.name?.toLowerCase())) {
            result.push({ effect, condition: simplifyCondition({ type: 'and', items: conditions }) });
        }
    } else if ('condition' in effect) {
        effect.items.forEach(item => findHistoryItems(item, conditions.concat(effect.condition), result));
    } else {
        effect.items.forEach(item => findHistoryItems(item.effect, conditions, result));
    }

    return result;
}

function extractFromEffect(
    stateId: number,
    scope: Scope,
    effect: EffectItem,
    condition: ConditionComplexExpr,
    bookmarkCondition: ConditionComplexExpr,
    owner: WithCondition<string>[],
    controller: WithCondition<string>[],
    cores: WithCondition<string>[],
    conditionExprs: ConditionItem[]) {

    const nodeName = effect.node.name?.toLowerCase();
    // transfer_state_to = TAG
    if ((nodeName === 'owner' || nodeName === 'transfer_state_to') && effect.scopeName === scope.scopeName) {
        const value = convertNodeToJson<string>(effect.node, 'string');
        if (!value) {
            return;
        }
        const combinedCondition = simplifyCondition({ type: 'and', items: [condition, bookmarkCondition] });
        extractConditionalExprs(combinedCondition, conditionExprs);
        owner.push({ value, condition: combinedCondition });
    }
    // TAG = { transfer_state = PREV }
    if (nodeName === 'transfer_state') {
        const value = convertNodeToJson<string>(effect.node, 'string');
        if (!value) {
            return;
        }
        if (parseInt(value) === stateId ||
            (value.toLowerCase() === 'prev' && effect.scopeStack.length > 1 && isEqual(effect.scopeStack[effect.scopeStack.length - 2], scope)) ||
            value.toLowerCase() === 'root') {
            const combinedCondition = simplifyCondition({ type: 'and', items: [condition, bookmarkCondition] });
            extractConditionalExprs(combinedCondition, conditionExprs);
            owner.push({ value: effect.scopeName, condition: combinedCondition });
        }
    }
    // set_state_controller_to = TAG
    if ((nodeName === 'controller' || nodeName === 'set_state_controller_to') && effect.scopeName === scope.scopeName) {
        const value = convertNodeToJson<string>(effect.node, 'string');
        if (!value) {
            return;
        }
        const combinedCondition = simplifyCondition({ type: 'and', items: [condition, bookmarkCondition] });
        extractConditionalExprs(combinedCondition, conditionExprs);
        controller.push({ value, condition: combinedCondition });
    }
    // TAG = { set_state_controller = PREV }
    if (nodeName === 'set_state_controller') {
        const value = convertNodeToJson<string>(effect.node, 'string');
        if (!value) {
            return;
        }
        if (parseInt(value) === stateId ||
            (value.toLowerCase() === 'prev' && effect.scopeStack.length > 1 && isEqual(effect.scopeStack[effect.scopeStack.length - 2], scope)) ||
            value.toLowerCase() === 'root') {
            const combinedCondition = simplifyCondition({ type: 'and', items: [condition, bookmarkCondition] });
            extractConditionalExprs(combinedCondition, conditionExprs);
            controller.push({ value: effect.scopeName, condition: combinedCondition });
        }
    }
    // add_core_of = TAG
    if (nodeName === 'add_core_of' && effect.scopeName === scope.scopeName) {
        const value = convertNodeToJson<string>(effect.node, 'string');
        if (!value) {
            return;
        }
        const combinedCondition = simplifyCondition({ type: 'and', items: [condition, bookmarkCondition] });
        let item = cores.find(c => c.value === value);
        if (!item) {
            item = { value, condition: false };
            cores.push(item);
        }
        item.condition = simplifyCondition({ type: 'or', items: [item.condition, combinedCondition] });
        extractConditionalExprs(item.condition, conditionExprs);
    }
    // remove_core_of = TAG
    if (nodeName === 'remove_core_of' && effect.scopeName === scope.scopeName) {
        const value = convertNodeToJson<string>(effect.node, 'string');
        if (!value) {
            return;
        }
        const combinedCondition = simplifyCondition({ type: 'and', items: [condition, bookmarkCondition] });
        const item = cores.find(c => c.value === value);
        // No need to remove if doesn't exist.
        if (item) {
            item.condition = simplifyCondition({ type: 'and', items: [item.condition, { type: 'ornot', items: [combinedCondition] }] });
            extractConditionalExprs(item.condition, conditionExprs);
        }
    }
}

function sortStates(states: StateNoBoundingBox[], warnings: WorldMapWarning[]): { sortedStates: StateNoBoundingBox[], badStateId: number } {
    const { sorted, badId } = sortItems(
        states,
        10000,
        (maxId) => { throw new UserError(localize('worldmap.warnings.stateidtoolarge', 'Max state id is too large: {0}', maxId)); },
        (newState, existingState, badId) => warnings.push({
                source: [{ type: 'state', id: badId }],
                relatedFiles: [newState.file, existingState.file],
                text: localize('worldmap.warnings.stateidconflict', "There're more than one states using state id {0}.", newState.id),
            }),
        (startId, endId) => warnings.push({
                source: [{ type: 'state', id: startId }],
                relatedFiles: [],
                text: localize('worldmap.warnings.statenotexist', "State with id {0} doesn't exist.", startId === endId ? startId : `${startId}-${endId}`),
            }),
    );

    return {
        sortedStates: sorted,
        badStateId: badId,
    };
}

function calculateBoundingBox(noBoundingBoxState: StateNoBoundingBox, provinces: (Province | undefined | null)[], width: number, height: number, warnings: WorldMapWarning[]): State {
    const state = mergeRegion(
        noBoundingBoxState,
        'provinces',
        provinces,
        width, 
        provinceId => warnings.push({
                source: [{ type: 'state', id: noBoundingBoxState.id }],
                relatedFiles: [noBoundingBoxState.file],
                text: localize('worldmap.warnings.stateprovincenotexist', "Province {0} used in state {1} doesn't exist.", provinceId, noBoundingBoxState.id),
            }),
        () => warnings.push({
                source: [{ type: 'state', id: noBoundingBoxState.id }],
                relatedFiles: [noBoundingBoxState.file],
                text: localize('worldmap.warnings.statenovalidprovinces', "State {0} in doesn't have valid provinces.", noBoundingBoxState.id),
            })
    );

    if (state.boundingBox.w > width / 2 || state.boundingBox.h > height / 2) {
        warnings.push({
            source: [{ type: 'state', id: state.id }],
            relatedFiles: [state.file],
            text: localize('worldmap.warnings.statetoolarge', 'State {0} is too large: {1}x{2}.', state.id, state.boundingBox.w, state.boundingBox.h),
        });
    }

    return state;
}

function validateProvinceInState(provinces: (Province | undefined | null)[], states: (State | undefined | null)[], badStatesCount: number, warnings: WorldMapWarning[]) {
    const provinceToState: Record<number, number> = {};

    for (let i = badStatesCount; i < states.length; i++) {
        const state = states[i];
        if (!state) {
            continue;
        }

        state.provinces.forEach(p => {
            const province = provinces[p];
            if (provinceToState[p] !== undefined) {
                if (!province) {
                    return;
                }

                warnings.push({
                    source: [
                        ...[state.id, provinceToState[p]].map<WorldMapWarningSource>(id => ({ type: 'state', id })),
                        { type: 'province', id: p, color: province.color }
                    ],
                    relatedFiles: [state.file, states[provinceToState[p]]!.file],
                    text: localize('worldmap.warnings.provinceinmultistates', 'Province {0} exists in multiple states: {1}, {2}.', p, provinceToState[p], state.id),
                });
            } else {
                provinceToState[p] = state.id;
            }

            if (province?.type === 'sea') {
                warnings.push({
                    source: [
                        { type: 'state', id: state.id },
                        { type: 'province', id: p, color: province.color },
                    ],
                    relatedFiles: [state.file],
                    text: localize('worldmap.warnings.statehassea', "Sea province {0} shouldn't belong to a state.", p),
                });
            }
        });
    }
}

async function loadStateCategory(file: string, warning: WorldMapWarning[]): Promise<StateCategory[]> {
    try {
        const data = await readFileFromModOrHOI4AsJson<StateCategoryFile>(file, stateCategoryFileSchema);
        const result: StateCategory[] = [];

        for (const categories of Object.values(data.state_categories._map)) {
            const name = categories._key;
            const color = convertColor(categories._value.color);

            result.push({ name, color, file });
        }

        return result;
    } catch (e) {
        error(e);
        return [];
    }
}

