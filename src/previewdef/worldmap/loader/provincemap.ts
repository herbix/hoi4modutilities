import { ProvinceMap, Province, ProvinceEdge, WorldMapWarning, ProvinceDefinition, ProvinceBmp, ProvinceEdgeAdjacency, ProgressReporter, Terrain } from "../definitions";
import { FileLoader, mergeInLoadResult, LoadResult, sortItems } from "./common";
import { SchemaDef } from "../../../hoiformat/schema";
import { readFileFromModOrHOI4AsJson } from "../../../util/fileloader";
import { TerrainDefinitionLoader } from "./terrain";
import { arrayToMap, UserError } from "../../../util/common";
import { localize } from "../../../util/i18n";
import { LoaderSession } from "../../../util/loader/loader";
import { DefinitionsLoader } from "./provincedefinitions";
import { AdjacenciesLoader } from "./adjacencies";
import { ContinentsLoader } from "./continents";
import { ProvinceBmpLoader } from "./provincebmp";
import { RiverLoader } from "./river";

interface DefaultMap {
    definitions: string;
    provinces: string;
    adjacencies: string;
    continent: string;
    rivers: string;
}

const defaultMapSchema: SchemaDef<DefaultMap> = {
    definitions: 'string',
    provinces: 'string',
    adjacencies: 'string',
    continent: 'string',
    rivers: 'string',
};

export class DefaultMapLoader extends FileLoader<ProvinceMap> {
    private definitionsLoader: DefinitionsLoader | undefined;
    private provinceBmpLoader: ProvinceBmpLoader | undefined;
    private adjacenciesLoader: AdjacenciesLoader | undefined;
    private continentsLoader: ContinentsLoader | undefined;
    private terrainDefinitionLoader: TerrainDefinitionLoader;
    private riverLoader: RiverLoader | undefined;

    constructor() {
        super('map/default.map');
        this.terrainDefinitionLoader = new TerrainDefinitionLoader();
        this.terrainDefinitionLoader.onProgress(e => this.onProgressEmitter.fire(e));
    }

    public async shouldReloadImpl(session: LoaderSession): Promise<boolean> {
        if (await super.shouldReloadImpl(session)) {
            return true;
        }

        return (await Promise.all([
            this.definitionsLoader,
            this.provinceBmpLoader,
            this.adjacenciesLoader,
            this.continentsLoader,
            this.terrainDefinitionLoader,
            this.riverLoader,
        ].map(v => v?.shouldReload(session) ?? Promise.resolve(false)))).some(v => v);
    }

    protected async loadFromFile(session: LoaderSession): Promise<LoadResult<ProvinceMap>> {
        
        const defaultMap = await loadDefaultMap(e => this.fireOnProgressEvent(e));
        session.throwIfCancelled();

        const provinceDefinitions = await (this.definitionsLoader = this.checkAndCreateLoader(this.definitionsLoader, 'map/' + defaultMap.definitions, DefinitionsLoader)).load(session);
        session.throwIfCancelled();

        const provinceBmp = await (this.provinceBmpLoader = this.checkAndCreateLoader(this.provinceBmpLoader, 'map/' + defaultMap.provinces, ProvinceBmpLoader)).load(session);
        session.throwIfCancelled();

        const adjacencies = await (this.adjacenciesLoader = this.checkAndCreateLoader(this.adjacenciesLoader, 'map/' + defaultMap.adjacencies, AdjacenciesLoader)).load(session);
        session.throwIfCancelled();

        const continents = await (this.continentsLoader = this.checkAndCreateLoader(this.continentsLoader, 'map/' + defaultMap.continent, ContinentsLoader)).load(session);
        session.throwIfCancelled();

        const terrains = await this.terrainDefinitionLoader.load(session);
        session.throwIfCancelled();

        const rivers = await (this.riverLoader = this.checkAndCreateLoader(this.riverLoader, 'map/' + defaultMap.rivers, RiverLoader)).load(session);
        session.throwIfCancelled();

        const subLoaderResults = [ provinceDefinitions, provinceBmp, adjacencies, continents, terrains, rivers ];

        const warnings = mergeInLoadResult(subLoaderResults, 'warnings');

        await this.fireOnProgressEvent(localize('worldmap.progress.mergeandvalidateprovince', 'Merging and validating provinces...'));
    
        const { provinces, badProvinceId: badProvinceIdForMerge } =
            mergeProvinceDefinitions(provinceDefinitions.result, provinceBmp.result, ['map/' + defaultMap.definitions, 'map/' + defaultMap.provinces], warnings);
    
        validateProvinceContinents(provinces, continents.result, ['map/' + defaultMap.definitions, 'map/' + defaultMap.continent], warnings);
        validateProvinceTerrains(provinces, terrains.result, ['map/' + defaultMap.definitions], warnings);

        fillAdjacencyEdges(provinces, adjacencies.result, provinceBmp.result.height, ['map/' + defaultMap.provinces, 'map/' + defaultMap.definitions], warnings);
    
        const { sortedProvinces, badProvinceId } = sortProvinces(provinces, badProvinceIdForMerge, ['map/' + defaultMap.definitions], warnings);
    
        if (rivers.result.width !== provinceBmp.result.width || rivers.result.height !== provinceBmp.result.height) {
            warnings.push({
                relatedFiles: [this.provinceBmpLoader.file, this.riverLoader.file],
                text: localize('worldmap.warning.riversizenotmatch',
                    'Size of the rivers image ({0}x{1}) doesn\'t match size of province map image ({2}x{3}).',
                    rivers.result.width, rivers.result.height, provinceBmp.result.width, provinceBmp.result.height),
                source: [{ type: 'river', name: '', index: -1 }]
            });
        }

        return {
            result: {
                width: provinceBmp.result.width,
                height: provinceBmp.result.height,
                colorByPosition: provinceBmp.result.colorByPosition, // width * height
                provinces: sortedProvinces, // count of provinces
                badProvincesCount: badProvinceId + 1,
                continents: continents.result,
                terrains: terrains.result,
                rivers: rivers.result.rivers,
            },
            dependencies: mergeInLoadResult(subLoaderResults, 'dependencies'),
            warnings,
        };
    }

    private checkAndCreateLoader<T extends FileLoader<any>>(
        loader: T | undefined,
        file: string,
        constructor: { new(file: string): T }
    ): T {
        if (loader && loader.file === file) {
            return loader;
        }

        loader = new constructor(file);
        loader.onProgress(e => this.onProgressEmitter.fire(e));
        return loader;
    }

    protected extraMesurements(result: LoadResult<ProvinceMap>) {
        return {
            ...super.extraMesurements(result),
            width: result.result.width,
            height: result.result.height,
            provinceCount: result.result.provinces.length
        };
    }

    public toString() {
        return `[DefaultMapLoader]`;
    }
}

async function loadDefaultMap(progressReporter: ProgressReporter): Promise<DefaultMap> {
    await progressReporter(localize('worldmap.progress.loadingdefaultmap', 'Loading default.map...'));

    const defaultMap = await readFileFromModOrHOI4AsJson<DefaultMap>('map/default.map', defaultMapSchema);
    (['definitions', 'provinces', 'adjacencies', 'continent'] as (keyof DefaultMap)[]).forEach(field => {
        if (!defaultMap[field]) {
            throw new UserError(localize('worldmap.error.fieldnotindefaultmap', 'Field "{0}" is not found in default.map.', field));
        }
    });

    return defaultMap as DefaultMap;
}

function sortProvinces(provinces: Province[], badProvinceId: number, relatedFiles: string[], warnings: WorldMapWarning[]): { sortedProvinces: (Province | undefined)[], badProvinceId: number } {
    const { sorted, badId } = sortItems(
        provinces,
        200000,
        (maxId) => { throw new UserError(localize('worldmap.error.provinceidtoolarge', 'Max province id is too large: {0}.', maxId)); },
        (newProvince, existingProvince, badId) => warnings.push({
                source: [{ type: 'province', id: badId, color: existingProvince.color }],
                relatedFiles,
                text: localize('worldmap.warnings.provinceidconflict', "There're more than one rows for province id {0}. Set id to {1}.", newProvince.id, badProvinceId),
            }),
        (startId, endId) => warnings.push({
                source: [{ type: 'province', id: startId, color: -1 }],
                relatedFiles: [],
                text: localize('worldmap.warnings.provincenotexist', "Province with id {0} doesn't exist.", startId === endId ? startId : `${startId}-${endId}`),
            }),
        false,
        badProvinceId,
    );

    return {
        sortedProvinces: sorted,
        badProvinceId: badId,
    };
}


function mergeProvinceDefinitions(
    provinceDefinitions: ProvinceDefinition[],
    { provinces, colorToProvince }: ProvinceBmp,
    relatedFiles: string[],
    warnings: WorldMapWarning[]
): { provinces: Province[], badProvinceId: number } {
    const result: Province[] = [];
    const colorToProvinceId: Record<number, number> = {};

    for (const provinceDef of provinceDefinitions) {
        if (colorToProvinceId[provinceDef.color] !== undefined) {
            warnings.push({
                source: [provinceDef.id, colorToProvinceId[provinceDef.color]].map(id => ({ type: 'province', id, color: provinceDef.color })),
                relatedFiles: relatedFiles.slice(0, 1),
                text: localize('worldmap.warnings.provincecolorconflict', 'Province {0} has conflict color with province {1}.', provinceDef.id, colorToProvinceId[provinceDef.color]),
            });
        }

        colorToProvinceId[provinceDef.color] = provinceDef.id;
        const provinceInMap = colorToProvince[provinceDef.color];
        if (provinceInMap) {
            result.push({
                ...provinceDef,
                ...provinceInMap,
                edges: [],
            });

        } else {
            if (provinceDef.id !== 0) {
                warnings.push({
                    source: [{ type: 'province', id: provinceDef.id, color: provinceDef.color }],
                    relatedFiles: relatedFiles,
                    text: localize('worldmap.warnings.provincenotexistonmap', "Province {0} doesn't exist on map.", provinceDef.id),
                });
            }

            result.push({ ...provinceDef, boundingBox: { x: 0, y: 0, w: 0, h: 0 }, mass: 0, centerOfMass: { x: 0, y: 0 }, coverZones: [], edges: [] });
        }
    }

    let badId = -1;
    for (const provinceInMap of provinces) {
        const color = provinceInMap.color;
        if (colorToProvinceId[color]) {
            continue;
        }

        const useBadId = badId--;
        warnings.push({
            source: [{ type: 'province', id: useBadId, color }],
            relatedFiles,
            text: localize('worldmap.warnings.provincenotexistindef', "Province with color ({0}, {1}, {2}) in provinces bmp ({3}, {4}) doesn't exist in definitions.",
                (color >> 16) & 0xFF, (color >> 8) & 0xFF, color & 0xFF, provinceInMap.coverZones[0].x, provinceInMap.coverZones[0].y),
        });

        colorToProvinceId[color] = useBadId;
        result.push({
            ...provinceInMap,
            edges: [], id: useBadId, continent: 0, type: 'sea', coastal: false, terrain: ''
        });
    }

    for (const province of result) {
        const provinceInMap = colorToProvince[province.color];
        if (provinceInMap) {
            province.edges = provinceInMap.edges.map(e => ({...e, to: colorToProvinceId[e.toColor] ?? -1, type: ''}));
        }
    }

    for (const warning of warnings) {
        for (const source of warning.source) {
            if (source.type === 'province' && source.id === -1) {
                const provinceId = colorToProvinceId[source.color];
                if (provinceId !== undefined) {
                    source.id = provinceId;
                }
            }
        }
    }

    return { provinces: result, badProvinceId: badId };
}

function validateProvinceContinents(provinces: Province[], continents: string[], relatedFiles: string[], warnings: WorldMapWarning[]) {
    for (const province of provinces) {
        const continent = province.continent;
        if (continent >= continents.length || continent < 0) {
            warnings.push({
                source: [{
                    type: 'province',
                    id: province.id,
                    color: province.color,
                }],
                relatedFiles,
                text: localize('worldmap.warnings.continentnotdefined', 'Continent {0} is not defined.', continent),
            });
        }
        if (province.type === 'land' && (continent === 0 || isNaN(continent)) && province.id !== 0) {
            warnings.push({
                source: [{
                    type: 'province',
                    id: province.id,
                    color: province.color,
                }],
                relatedFiles,
                text: localize('worldmap.warnings.provincenocontinent', 'Land province {0} must belong to a continent.', province.id),
            });
        }
    }
}

function validateProvinceTerrains(provinces: Province[], terrains: Terrain[], relatedFiles: string[], warnings: WorldMapWarning[]) {
    const terrainMap = arrayToMap(terrains, 'name');
    for (const province of provinces) {
        const terrain = province.terrain;
        const terrainObj = terrainMap[terrain];
        if (!terrainObj) {
            warnings.push({
                source: [{
                    type: 'province',
                    id: province.id,
                    color: province.color,
                }],
                relatedFiles,
                text: localize('worldmap.warnings.terrainnotdefined', 'Terrain "{0}" is not defined.', terrain),
            });
        }
    }
}

function fillAdjacencyEdges(provinces: (Province | undefined)[], adjacencies: ProvinceEdgeAdjacency[], height: number, relatedFiles: string[], warnings: WorldMapWarning[]) {
    for (const { row, from, to, through, start: saveStart, stop: saveStop, rule, type } of adjacencies) {

        if (!provinces[from] || !provinces[to]) {
            warnings.push({
                source: [{ type: 'province', id: from, color: -1 }],
                relatedFiles,
                text: localize('worldmap.warnings.adjacencynotexist', 'Adjacency not from or to an existing province: {0}, {1}', row[0], row[1]),
            });
            continue;
        }

        const resultThrough = through !== undefined && !isNaN(through) && through !== -1 ? through : undefined;
        if (resultThrough && !provinces[resultThrough]) {
            warnings.push({
                source: [{ type: 'province', id: resultThrough, color: -1 }],
                relatedFiles,
                text: localize('worldmap.warnings.adjacencythroughnotexist', 'Adjacency not through an existing province: {0}', row[3]),
            });
            continue;
        }

        const start = saveStart ? { ...saveStart, y: height - saveStart.y } : undefined;
        const stop = saveStop ? { ...saveStop, y: height - saveStop.y } : undefined;

        const existingEdgeInFrom = provinces[from]!.edges.find(e => e.to === to);
        if (existingEdgeInFrom) {
            Object.assign<ProvinceEdge, Partial<ProvinceEdge>>(existingEdgeInFrom, { through: resultThrough, start, stop, rule, type });
        } else {
            provinces[from]!.edges.push({ to, through: resultThrough, start, stop, rule, type, path: [] });
        }
        
        const existingEdgeInTo = provinces[to]!.edges.find(e => e.to === from);
        if (existingEdgeInTo) {
            Object.assign<ProvinceEdge, Partial<ProvinceEdge>>(existingEdgeInTo, { through: resultThrough, start, stop, rule, type });
        } else {
            provinces[to]!.edges.push({ to: from, through: resultThrough, start: stop, stop: start, rule, type, path: [] });
        }
    }
}
