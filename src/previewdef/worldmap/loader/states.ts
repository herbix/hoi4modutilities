import { State, Province, WorldMapWarning, WorldMapWarningSource, Region, StateCategory, Resource } from "../definitions";
import { Enum, SchemaDef, CustomMap, DetailValue } from "../../../hoiformat/schema";
import { readFileFromModOrHOI4AsJson } from "../../../util/fileloader";
import { error } from "../../../util/debug";
import { LoadResult, FolderLoader, FileLoader, mergeInLoadResult, sortItems, mergeRegion, convertColor, LoadResultOD } from "./common";
import { Token } from "../../../hoiformat/hoiparser";
import { arrayToMap, UserError } from "../../../util/common";
import { DefaultMapLoader } from "./provincemap";
import { localize } from "../../../util/i18n";
import { LoaderSession } from "../../../util/loader/loader";
import { flatMap } from "lodash";
import { ResourceDefinitionLoader } from "./resource";

interface StateFile {
    state: StateDefinition[];
}

interface StateDefinition {
    id: number;
    name: string;
    manpower: number;
    state_category: string;
    history: StateHistory;
    provinces: Enum;
    impassable: boolean;
    resources: CustomMap<number>;
    _token: Token;
}

interface StateHistory {
    owner: string;
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
            history: {
                owner: "string",
                victory_points: {
                    _innerType: "enum",
                    _type: "array",
                },
                add_core_of: {
                    _innerType: "string",
                    _type: "array",
                },
            },
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
export class StatesLoader extends FolderLoader<StateLoaderResult, StateNoBoundingBox[]> {
    private categoriesLoader: StateCategoriesLoader;

    constructor(private defaultMapLoader: DefaultMapLoader, private resourcesLoader: ResourceDefinitionLoader) {
        super('history/states', StateLoader);
        this.categoriesLoader = new StateCategoriesLoader();
        this.categoriesLoader.onProgress(e => this.onProgressEmitter.fire(e));
    }

    public async shouldReloadImpl(session: LoaderSession): Promise<boolean> {
        return await super.shouldReloadImpl(session) || await this.defaultMapLoader.shouldReload(session)
            || await this.categoriesLoader.shouldReload(session) || await this.resourcesLoader.shouldReload(session);
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
        };
    }

    public toString() {
        return `[StatesLoader]`;
    }
}

class StateLoader extends FileLoader<StateNoBoundingBox[]> {
    protected async loadFromFile(): Promise<LoadResultOD<StateNoBoundingBox[]>> {
        const warnings: WorldMapWarning[] = [];
        return {
            result: await loadState(this.file, warnings),
            warnings,
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

async function loadState(stateFile: string, globalWarnings: WorldMapWarning[]): Promise<StateNoBoundingBox[]> {
    try {
        const data = await readFileFromModOrHOI4AsJson<StateFile>(stateFile, stateFileSchema);
        const result: StateNoBoundingBox[] = [];

        for (const state of data.state) {
            const warnings: string[] = [];
            const id = state.id ? state.id : (warnings.push(localize('worldmap.warnings.statenoid', "A state in {0} doesn't have id field.", stateFile)), -1);
            const name = state.name ? state.name : (warnings.push(localize('worldmap.warnings.statenoname', "The state doesn't have name field.")), '');
            const manpower = state.manpower ?? 0;
            const category = state.state_category ? state.state_category : (warnings.push(localize('worldmap.warnings.statenocategory', "The state doesn't have category field.")), '');
            const owner = state.history?.owner;
            const provinces = state.provinces._values.map(v => parseInt(v));
            const cores = state.history?.add_core_of.map(v => v).filter((v, i, a): v is string => v !== undefined && i === a.indexOf(v)) ?? [];
            const impassable = state.impassable ?? false;
            const victoryPointsArray = state.history?.victory_points.filter(v => v._values.length >= 2).map(v => v._values.slice(0, 2).map(v => parseInt(v)) as [number, number]) ?? [];
            const victoryPoints = arrayToMap(victoryPointsArray, "0", v => v[1]);
            const resources = arrayToMap(
                Object.values(state.resources._map), '_key', v => v._value);

            if (provinces.length === 0) {
                globalWarnings.push({
                    source: [{ type: 'state', id }],
                    relatedFiles: [stateFile],
                    text: localize('worldmap.warnings.statenoprovinces', "State {0} in \"{1}\" doesn't have provinces.", id, stateFile),
                });
            }

            for (const vpPair of victoryPointsArray) {
                if (!provinces.includes(vpPair[0])) {
                    warnings.push(localize('worldmap.warnings.provincenothere', 'Province {0} not included in this state. But victory points defined here.', vpPair[0]));
                }
            }

            globalWarnings.push(...warnings.map<WorldMapWarning>(warning => ({
                source: [{ type: 'state', id }],
                relatedFiles: [stateFile],
                text: warning,
            })));

            result.push({
                id, name, manpower, category, owner, provinces, cores, impassable, victoryPoints, resources,
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
