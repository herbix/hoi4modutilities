import { Enum, SchemaDef } from "../../../hoiformat/schema";
import { StrategicRegion, Warning, Province, WarningSource, State, Terrain, Region } from "../definitions";
import { DefaultMapLoader } from "./provincemap";
import { FolderLoader, FileLoader, LoadResult, mergeInLoadResult, sortItems, mergeRegion, LoadResultOD } from "./common";
import { readFileFromModOrHOI4AsJson } from "../../../util/fileloader";
import { error } from "../../../util/debug";
import { localize } from "../../../util/i18n";
import { StatesLoader } from "./states";
import { arrayToMap } from "../../../util/common";
import { Token } from "../../../hoiformat/hoiparser";
import { LoaderSession } from "../../../util/loader/loader";
import { flatMap } from "lodash";

interface StrategicRegionFile {
    strategic_region: StrategicRegionDefinition[];
}

interface StrategicRegionDefinition {
    id: number;
    name: string;
    provinces: Enum;
    naval_terrain: string;
    _token: Token;
}

const strategicRegionFileSchema: SchemaDef<StrategicRegionFile> = {
    strategic_region: {
        _innerType: {
            id: "number",
            name: "string",
            provinces: "enum",
            naval_terrain: "string",
        },
        _type: "array",
    },
};

type StrategicRegionsLoaderResult = { strategicRegions: StrategicRegion[], badStrategicRegionsCount: number };
export class StrategicRegionsLoader extends FolderLoader<StrategicRegionsLoaderResult, StrategicRegionNoRegion[]> {
    constructor(private defaultMapLoader: DefaultMapLoader, private statesLoader: StatesLoader) {
        super('map/strategicregions', StrategicRegionLoader);
    }

    public async shouldReloadImpl(session: LoaderSession): Promise<boolean> {
        return await super.shouldReloadImpl(session) || await this.defaultMapLoader.shouldReload(session) || await this.statesLoader.shouldReload(session);
    }

    protected async loadImpl(session: LoaderSession): Promise<LoadResult<StrategicRegionsLoaderResult>> {
        await this.fireOnProgressEvent(localize('worldmap.progress.loadingstrategicregions', 'Loading strategic regions...'));
        return super.loadImpl(session);
    }

    protected async mergeFiles(fileResults: LoadResult<StrategicRegionNoRegion[]>[], session: LoaderSession): Promise<LoadResult<StrategicRegionsLoaderResult>> {
        const provinceMap = await this.defaultMapLoader.load(session);
        const stateMap = await this.statesLoader.load(session);

        await this.fireOnProgressEvent(localize('worldmap.progress.mapprovincestostrategicregions', 'Mapping provinces to strategic regions...'));

        const warnings = mergeInLoadResult(fileResults, 'warnings');
        const strategicRegions = flatMap(fileResults, c => c.result);

        const { width, provinces, terrains } = provinceMap.result;
        validateStrategicRegions(strategicRegions, terrains, warnings);

        const { sortedStrategicRegions, badStrategicRegionId } = sortStrategicRegions(strategicRegions, warnings);

        const { states, badStatesCount } = stateMap.result;
        const badStrategicRegionsCount = badStrategicRegionId + 1;

        const filledStrategicRegions: StrategicRegion[] = new Array(sortedStrategicRegions.length);
        for (let i = badStrategicRegionsCount; i < sortedStrategicRegions.length; i++) {
            if (sortedStrategicRegions[i]) {
                filledStrategicRegions[i] = calculateBoundingBox(sortedStrategicRegions[i], provinces, width, warnings);
            }
        }

        validateProvincesInStrategicRegions(provinces, states, filledStrategicRegions, badStatesCount, badStrategicRegionsCount, warnings);

        return {
            result: {
                strategicRegions: filledStrategicRegions,
                badStrategicRegionsCount,
            },
            dependencies: [this.folder + '/*'],
            warnings,
        };
    }

    public toString() {
        return `[StrategicRegionsLoader]`;
    }
}

class StrategicRegionLoader extends FileLoader<StrategicRegionNoRegion[]> {
    protected async loadFromFile(): Promise<LoadResultOD<StrategicRegionNoRegion[]>> {
        const warnings: Warning[] = [];
        return {
            result: await loadStrategicRegion(this.file, warnings),
            warnings,
        };
    }

    public toString() {
        return `[StrategicRegionLoader: ${this.file}]`;
    }
}

type StrategicRegionNoRegion = Omit<StrategicRegion, keyof Region>;
async function loadStrategicRegion(file: string, globalWarnings: Warning[]): Promise<StrategicRegionNoRegion[]> {
    const result: StrategicRegionNoRegion[] = [];
    try {
        const data = await readFileFromModOrHOI4AsJson<StrategicRegionFile>(file, strategicRegionFileSchema);
        for (const strategicRegion of data.strategic_region) {
            const warnings: string[] = [];
            const id = strategicRegion.id ? strategicRegion.id : (warnings.push(localize('worldmap.warnings.strategicregionnoid', "A strategic region in \"{0}\" doesn't have id field.", file)), -1);
            const name = strategicRegion.name ? strategicRegion.name : (warnings.push(localize('worldmap.warnings.strategicregionnoname', "Strategic region {0} doesn't have name field.", id)), '');
            const provinces = strategicRegion.provinces._values.map(v => parseInt(v));
            const navalTerrain = strategicRegion.naval_terrain ?? null;

            if (provinces.length === 0) {
                warnings.push(localize('worldmap.warnings.strategicregionnoprovinces', "Strategic region {0} in \"{1}\" doesn't have provinces.", id, file));
            }

            globalWarnings.push(...warnings.map<Warning>(warning => ({
                source: [{ type: 'strategicregion', id }],
                relatedFiles: [file],
                text: warning,
            })));

            result.push({
                id,
                name,
                provinces,
                navalTerrain,
                file,
                token: strategicRegion._token ?? null,
            });
        }

    } catch (e) {
        error(e);
    }

    return result;
}

function validateStrategicRegions(strategicRegions: StrategicRegionNoRegion[], terrains: Terrain[], warnings: Warning[]): void {
    const terrainMap = arrayToMap(terrains, 'name');
    for (const strategicRegion of strategicRegions) {
        const terrain = strategicRegion.navalTerrain;
        if (terrain !== null) {
            const terrainObj = terrainMap[terrain];
            if (!terrainObj || !terrainObj.isNaval) {
                warnings.push({
                    source: [{
                        type: 'strategicregion',
                        id: strategicRegion.id,
                    }],
                    relatedFiles: [strategicRegion.file],
                    text: localize('worldmap.warnings.navalterrainnotdefined', 'Naval terrain "{0}" is not defined.', terrain),
                });
            }
        }
    }
}

function sortStrategicRegions(strategicRegions: StrategicRegionNoRegion[], warnings: Warning[]): { sortedStrategicRegions: StrategicRegionNoRegion[], badStrategicRegionId: number } {
    const { sorted, badId } = sortItems(
        strategicRegions,
        10000,
        (maxId) => { throw new Error(localize('worldmap.warnings.strategicregionidtoolarge', 'Max strategic region ID is too large: {0}.', maxId)); },
        (newStrategicRegion, existingStrategicRegion, badId) => warnings.push({
                source: [{ type: 'strategicregion', id: badId }],
                relatedFiles: [newStrategicRegion.file, existingStrategicRegion.file],
                text: localize('worldmap.warnings.strategicregionidconflict', "There're more than one strategic regions using ID {0}.", newStrategicRegion.id),
            }),
        (startId, endId) => warnings.push({
                source: [{ type: 'strategicregion', id: startId }],
                relatedFiles: [],
                text: localize('worldmap.warnings.strategicregionnotexist', "Strategic region with id {0} doesn't exist.", startId === endId ? startId : `${startId}-${endId}`),
            }),
    );

    return {
        sortedStrategicRegions: sorted,
        badStrategicRegionId: badId,
    };
}

function calculateBoundingBox(strategicRegionNoRegion: StrategicRegionNoRegion, provinces: (Province | undefined | null)[], width: number, warnings: Warning[]): StrategicRegion {
    return mergeRegion(
        strategicRegionNoRegion,
        'provinces',
        provinces,
        width, 
        provinceId => warnings.push({
                source: [{ type: 'strategicregion', id: strategicRegionNoRegion.id }],
                relatedFiles: [strategicRegionNoRegion.file],
                text: localize('worldmap.warnings.provinceinstrategicregionnotexist', "Province {0} used in strategic region {1} doesn't exist.", provinceId, strategicRegionNoRegion.id),
            }),
        () => warnings.push({
                source: [{ type: 'strategicregion', id: strategicRegionNoRegion.id }],
                relatedFiles: [strategicRegionNoRegion.file],
                text: localize('worldmap.warnings.strategicregionnovalidprovinces', "Strategic region {0} doesn't have valid provinces.", strategicRegionNoRegion.id),
            }),
    );
}

function validateProvincesInStrategicRegions(
    provinces: (Province | undefined | null)[],
    states: (State | undefined | null)[],
    strategicRegions: (StrategicRegion | undefined | null)[],
    badStatesCount: number,
    badStrategicRegionsCount: number,
    warnings: Warning[]
) {
    const provinceToStrategicRegion: Record<number, number> = {};

    for (let i = badStrategicRegionsCount; i < strategicRegions.length; i++) {
        const strategicRegion = strategicRegions[i];
        if (!strategicRegion) {
            continue;
        }

        strategicRegion.provinces.forEach(p => {
            const province = provinces[p];
            if (provinceToStrategicRegion[p] !== undefined) {
                if (!province) {
                    return;
                }

                warnings.push({
                    source: [
                        ...[strategicRegion.id, provinceToStrategicRegion[p]].map<WarningSource>(id => ({ type: 'strategicregion', id })),
                        { type: 'province', id: p, color: province.color }
                    ],
                    relatedFiles: [strategicRegion.file, strategicRegions[provinceToStrategicRegion[p]]!.file],
                    text: localize('worldmap.warnings.provinceinmultiplestrategicregions', 'Province {0} exists in multiple strategic regions: {1}, {2}.', p, provinceToStrategicRegion[p], strategicRegion.id),
                });
            } else {
                provinceToStrategicRegion[p] = strategicRegion.id;
            }
        });
    }

    for (let i = 1; i < provinces.length; i++) {
        const province = provinces[i];
        if (!province) {
            continue;
        }
        if (!(i in provinceToStrategicRegion)) {
            warnings.push({
                source: [{ type: 'province', id: i, color: province.color }],
                relatedFiles: [],
                text: localize('worldmap.warnings.provincenostrategicregion', 'Province {0} is not in any strategic region.', i),
            });
        }
    }

    for (let i = badStatesCount; i < states.length; i++) {
        const state = states[i];
        if (!state) {
            continue;
        }

        const strategicRegionId = state.provinces
            .filter(p => provinces[p])
            .map<[number, number]>(p => [p, provinceToStrategicRegion[p]])
            .filter(p => p[1] !== undefined);

        const strategicRegionIdCount: Record<number, number> = {};
        strategicRegionId.forEach(([_, sr]) => strategicRegionIdCount[sr] = (strategicRegionIdCount[sr] ?? 0) + 1);
        const entries = Object.entries(strategicRegionIdCount);
        if (entries.length > 1) {
            entries.sort((a, b) => b[1] - a[1]);
            const mostStrategicRegionId = parseInt(entries[0][0]);
            const badProvinces = strategicRegionId.filter(([_, sr]) => sr !== mostStrategicRegionId).map(v => v[0]);
            warnings.push({
                source: [
                    ...badProvinces.map<WarningSource>(id => ({ type: 'province', id, color: provinces[id]?.color ?? -1 })),
                    { type: 'state', id: i },
                ],
                relatedFiles: [state.file],
                text: localize('worldmap.warnings.stateinmultiplestrategicregions', 'In state {0}, province {1} are not belong to same strategic region as other provinces.', i, badProvinces.join(', ')),
            });
        }
    }
}
