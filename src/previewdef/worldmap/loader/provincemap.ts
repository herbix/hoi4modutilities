import { ProvinceMap, Province, ProvinceEdge, Warning, ProvinceDefinition, ProvinceBmp, ProvinceEdgeAdjacency, ProgressReporter, ProvinceGraph, Zone, ProvinceEdgeGraph, Point, Terrain, Region } from "../definitions";
import { FileLoader, mergeInLoadResult, LoadResult, pointEqual, sortItems, mergeRegions } from "./common";
import { SchemaDef, Enum } from "../../../hoiformat/schema";
import { readFileFromModOrHOI4AsJson, readFileFromModOrHOI4 } from "../../../util/fileloader";
import { parseBmp, BMP } from "../../../util/image/bmp/bmpparser";
import { TerrainDefinitionLoader } from "./terrain";
import { arrayToMap } from "../../../util/common";
import { localize } from "../../../util/i18n";

interface DefaultMap {
    definitions: string;
    provinces: string;
    adjacencies: string;
    continent: string;
}

const defaultMapSchema: SchemaDef<DefaultMap> = {
    definitions: 'string',
    provinces: 'string',
    adjacencies: 'string',
    continent: 'string',
};

export class DefaultMapLoader extends FileLoader<ProvinceMap> {
    private definitionsLoader: DefinitionsLoader | undefined;
    private provinceBmpLoader: ProvinceBmpLoader | undefined;
    private adjacenciesLoader: AdjacenciesLoader | undefined;
    private continentsLoader: ContinentsLoader | undefined;
    private terrainDefinitionLoader: TerrainDefinitionLoader;

    constructor(progressReporter: ProgressReporter) {
        super('map/default.map', progressReporter);
        this.terrainDefinitionLoader = new TerrainDefinitionLoader(progressReporter);
    }

    public async shouldReloadImpl(): Promise<boolean> {
        if (await super.shouldReloadImpl()) {
            return true;
        }

        return (await Promise.all([
            this.definitionsLoader,
            this.provinceBmpLoader,
            this.adjacenciesLoader,
            this.continentsLoader,
            this.terrainDefinitionLoader
        ].map(v => v?.shouldReload() ?? Promise.resolve(false)))).some(v => v);
    }

    protected async loadFromFile(warnings: Warning[], force: boolean): Promise<LoadResult<ProvinceMap>> {
        const progressReporter = this.progressReporter;

        const defaultMap = await loadDefaultMap(progressReporter);

        const provinceDefinitions = await (this.definitionsLoader = this.checkAndCreateLoader(this.definitionsLoader, 'map/' + defaultMap.definitions, DefinitionsLoader)).load(force);
        const provinceBmp = await (this.provinceBmpLoader = this.checkAndCreateLoader(this.provinceBmpLoader, 'map/' + defaultMap.provinces, ProvinceBmpLoader)).load(force);
        const adjacencies = await (this.adjacenciesLoader = this.checkAndCreateLoader(this.adjacenciesLoader, 'map/' + defaultMap.adjacencies, AdjacenciesLoader)).load(force);
        const continents = await (this.continentsLoader = this.checkAndCreateLoader(this.continentsLoader, 'map/' + defaultMap.continent, ContinentsLoader)).load(force);    
        const terrains = await this.terrainDefinitionLoader.load(force);

        const subLoaderResults = [ provinceDefinitions, provinceBmp, adjacencies, continents, terrains ];

        warnings.push(...mergeInLoadResult(subLoaderResults, 'warnings'));

        await progressReporter(localize('worldmap.progress.mergeandvalidateprovince', 'Merging and validating provinces...'));
    
        const { provinces, badProvinceId: badProvinceIdForMerge } =
            mergeProvinceDefinitions(provinceDefinitions.result, provinceBmp.result, ['map/' + defaultMap.definitions, 'map/' + defaultMap.provinces], warnings);
    
        validateProvinceContinents(provinces, continents.result, ['map/' + defaultMap.definitions, 'map/' + defaultMap.continent], warnings);
        validateProvinceTerrains(provinces, terrains.result, ['map/' + defaultMap.definitions, this.terrainDefinitionLoader.file], warnings);

        fillAdjacencyEdges(provinces, adjacencies.result, provinceBmp.result.height, ['map/' + defaultMap.provinces, 'map/' + defaultMap.definitions], warnings);
    
        const { sortedProvinces, badProvinceId } = sortProvinces(provinces, badProvinceIdForMerge, ['map/' + defaultMap.definitions], warnings);
    
        return {
            result: {
                width: provinceBmp.result.width,
                height: provinceBmp.result.height,
                colorByPosition: provinceBmp.result.colorByPosition, // width * height
                provinces: sortedProvinces, // count of provinces
                badProvincesCount: badProvinceId + 1,
                continents: continents.result,
                terrains: terrains.result,
            },
            dependencies: mergeInLoadResult(subLoaderResults, 'dependencies'),
            warnings,
        };
    }

    private checkAndCreateLoader<T extends FileLoader<any>>(
        loader: T | undefined,
        file: string,
        constructor: { new(file: string, progressReporter: ProgressReporter): T }
    ): T {
        if (loader && loader.file === file) {
            return loader;
        }

        return new constructor(file, this.progressReporter);
    }

    public toString() {
        return `[DefaultMapLoader]`;
    }
}

class DefinitionsLoader extends FileLoader<ProvinceDefinition[]> {
    protected loadFromFile(warnings: Warning[]): Promise<ProvinceDefinition[]> {
        return loadDefinitions(this.file, this.progressReporter, warnings);
    }

    public toString() {
        return `[DefinitionsLoader: ${this.file}]`;
    }
}

class ProvinceBmpLoader extends FileLoader<ProvinceBmp> {
    protected loadFromFile(warnings: Warning[]): Promise<ProvinceBmp> {
        return loadProvincesBmp(this.file, this.progressReporter, warnings);
    }

    public toString() {
        return `[ProvinceBmpLoader: ${this.file}]`;
    }
}

class AdjacenciesLoader extends FileLoader<ProvinceEdgeAdjacency[]> {
    protected loadFromFile(warnings: Warning[]): Promise<ProvinceEdgeAdjacency[]> {
        return loadAdjacencies(this.file, this.progressReporter, warnings);
    }

    public toString() {
        return `[AdjacenciesLoader: ${this.file}]`;
    }
}

class ContinentsLoader extends FileLoader<string[]> {
    protected loadFromFile(): Promise<string[]> {
        return loadContinents(this.file, this.progressReporter);
    }

    public toString() {
        return `[ContinentsLoader: ${this.file}]`;
    }
}

async function loadDefaultMap(progressReporter: ProgressReporter): Promise<DefaultMap> {
    await progressReporter(localize('worldmap.progress.loadingdefaultmap', 'Loading default.map...'));

    const defaultMap = await readFileFromModOrHOI4AsJson<DefaultMap>('map/default.map', defaultMapSchema);
    (['definitions', 'provinces', 'adjacencies', 'continent'] as (keyof DefaultMap)[]).forEach(field => {
        if (!defaultMap[field]) {
            throw new Error(localize('worldmap.error.fieldnotindefaultmap', 'Field "{0}" is not found in default.map.', field));
        }
    });

    return defaultMap as DefaultMap;
}

async function loadDefinitions(definitionsFile: string, progressReporter: ProgressReporter, warnings: Warning[]): Promise<ProvinceDefinition[]> {
    await progressReporter(localize('worldmap.progress.loadingprovincedef', 'Loading province definitions...'));

    const [definitionsBuffer] = await readFileFromModOrHOI4(definitionsFile);
    const definition = definitionsBuffer.toString().split(/(?:\r\n|\n|\r)/).map(line => line.split(/[,;]/)).filter(v => v.length >= 8);

    return definition.map(row => convertRowToProvince(row, warnings));
}

async function loadProvincesBmp(provincesFile: string, progressReporter: ProgressReporter, warnings: Warning[]): Promise<ProvinceBmp> {
    await progressReporter(localize('worldmap.progress.loadingprovincebmp', 'Loading province bmp...',));

    const [provinceMapImageBuffer] = await readFileFromModOrHOI4(provincesFile);
    const provinceMapImage = parseBmp(provinceMapImageBuffer.buffer);
    
    await progressReporter(localize('worldmap.progress.calculatingregion', 'Calculating province region...'));

    const { colorByPosition, provinces: colorOnlyProvinces, colorToProvince } = getProvincesByPosition(provinceMapImage);
    
    const width = provinceMapImage.width;
    const height = provinceMapImage.height;
    const provincesWithZone = fillProvinceZones(colorOnlyProvinces, colorToProvince, colorByPosition, width, height, provincesFile, warnings);
    
    await progressReporter(localize('worldmap.progress.calculatingedge', 'Calculating province edges...'));
    
    const provinces = fillEdges(provincesWithZone, colorToProvince as Record<number, ColorContainer & ProvinceZoneDef>, colorByPosition, width, height);

    validateProvince(colorByPosition, width, height, provincesFile, warnings);

    return {
        width,
        height,
        colorByPosition,
        colorToProvince: colorToProvince as unknown as Record<number, ProvinceGraph>,
        provinces,
    };
}

async function loadAdjacencies(adjacenciesFile: string, progressReporter: ProgressReporter, warnings: Warning[]): Promise<ProvinceEdgeAdjacency[]> {
    await progressReporter(localize('worldmap.progress.loadingadjacencies', 'Loading adjecencies...'));

    const [adjecenciesBuffer] = await readFileFromModOrHOI4(adjacenciesFile);
    const adjecencies = adjecenciesBuffer.toString().split(/(?:\r\n|\n|\r)/).map(line => line.split(/[,;]/)).filter((v, i) => i > 0 && v.length >= 9);

    return adjecencies.map(row => convertRowToAdjacencies(row, warnings)).filter((v): v is ProvinceEdgeAdjacency => !!v);
}

async function loadContinents(continentFile: string, progressReporter: ProgressReporter): Promise<string[]> {
    await progressReporter(localize('worldmap.progress.loadingcontinents', 'Loading continents...'));
    return ['', ...(await readFileFromModOrHOI4AsJson<{ continents: Enum }>(continentFile, { continents: 'enum' })).continents._values];
}

function convertRowToProvince(row: string[], warnings: Warning[]): ProvinceDefinition {
    const r = parseInt(row[1]);
    const g = parseInt(row[2]);
    const b = parseInt(row[3]);
    const type = row[4];
    const continent = parseInt(row[7]);

    return {
        id: parseInt(row[0]),
        color: (r << 16) | (g << 8) | b,
        type,
        coastal: row[5].trim().toLowerCase() === 'true',
        terrain: row[6],
        continent,
    };
}

type ColorContainer = { color: number, warnings: [] };
function getProvincesByPosition(provinceMapImage: BMP): { colorByPosition: number[], provinces: ColorContainer[], colorToProvince: Record<number, ColorContainer> } {
    const colorByPosition: number[] = new Array(provinceMapImage.width * provinceMapImage.height);
    const bitmapData = provinceMapImage.data;
    const provinces: ColorContainer[] = [];
    const colorToProvince: Record<number, ColorContainer> = {};

    for (let y = provinceMapImage.height - 1, sy = 0, dy = (provinceMapImage.height - 1) * provinceMapImage.width;
        y >= 0;
        y--, sy += provinceMapImage.bytesPerRow, dy -= provinceMapImage.width) {
        for (let x = 0, sx = sy, dx = dy; x < provinceMapImage.width; x++, sx += 3, dx++) {
            const color = (bitmapData[sx + 2] << 16) | (bitmapData[sx + 1] << 8) | bitmapData[sx];
            const province = colorToProvince[color];
            if (province === undefined) {
                const newProvince: ColorContainer = { color, warnings: [] };

                provinces.push(newProvince);
                colorToProvince[color] = newProvince;
                colorByPosition[dx] = color;
            } else {
                colorByPosition[dx] = province.color;
            }
        }
    }

    return {
        colorByPosition,
        colorToProvince,
        provinces,
    };
}

type ProvinceZoneDef = { coverZones: Zone[] } & Region;
function fillProvinceZones<T extends ColorContainer>(
    provincesWithoutCoverZones: (T & Partial<ProvinceZoneDef>)[],
    colorToProvince: Record<number, T & Partial<ProvinceZoneDef>>,
    colorByPosition: number[],
    width: number,
    height: number,
    file: string,
    warnings: Warning[],
): (T & ProvinceZoneDef)[] {
    const blockStack: Zone[] = [];
    const blockSize = 256;
    for (let x = 0; x < width; x += blockSize) {
        for (let y = 0; y < height; y += blockSize) {
            blockStack.push({ x, y, w: blockSize, h: blockSize });
        }
    }
    
    for (const province of provincesWithoutCoverZones) {
        province.coverZones = [];
    }

    const provinces = provincesWithoutCoverZones as (T & Partial<ProvinceZoneDef> & { coverZones: Zone[] })[];

    while (blockStack.length > 0) {
        const block = blockStack.pop()!;
        const t = block.y;
        const l = block.x;
        const b = block.y + block.h;
        const r = block.x + block.w;
        const color = colorByPosition[t * width + l];
        let sameColor = true;
        for (let y = t, yi = t * width; y < b; y++, yi += width) {
            for (let x = l, xi = yi + l; x < r; x++, xi++) {
                if (colorByPosition[xi] !== color) {
                    sameColor = false;
                    break;
                }
            }
            if (!sameColor) {
                break;
            }
        }

        if (sameColor) {
            colorToProvince[color].coverZones!.push(block);
        } else {
            const blockSize = block.w >> 1;
            blockStack.push({ ...block, w: blockSize, h: blockSize });
            blockStack.push({ ...block, x: block.x + blockSize, w: blockSize, h: blockSize });
            blockStack.push({ ...block, y: block.y + blockSize, w: blockSize, h: blockSize });
            blockStack.push({ x: block.x + blockSize, y: block.y + blockSize, w: blockSize, h: blockSize });
        }
    }

    for (const provinceWithoutRegion of provinces) {
        const province = Object.assign(provinceWithoutRegion, mergeRegions(provinceWithoutRegion.coverZones, width));
        if (province.boundingBox.w > width / 2 || province.boundingBox.h > height / 2) {
            warnings.push({
                source: [{ type: 'province', color: province.color, id: -1 }],
                relatedFiles: [file],
                text: localize('worldmap.warnings.provincetoolarge', 'The province is too large: {0}x{1}.', province.boundingBox.w, province.boundingBox.h),
            });
        }
    }

    return provinces as (T & ProvinceZoneDef)[];
}

function sortProvinces(provinces: Province[], badProvinceId: number, relatedFiles: string[], warnings: Warning[]): { sortedProvinces: (Province | undefined)[], badProvinceId: number } {
    const { sorted, badId } = sortItems(
        provinces,
        200000,
        (maxId) => { throw new Error(localize('worldmap.error.provinceidtoolarge', 'Max province id is too large: {0}.', maxId)); },
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

type EdgeDef = { edges: ProvinceEdgeGraph[] };
function fillEdges<T extends ColorContainer>(
    provincesWithoutEdges: (T & Partial<EdgeDef>)[],
    colorToProvinceWithoutEdges: Record<number, T & Partial<EdgeDef>>,
    colorByPosition: number[],
    width: number,
    height: number
): (T & EdgeDef)[] {
    const accessedPixels = new Array<boolean>(colorByPosition.length).fill(false);

    for (const province of provincesWithoutEdges) {
        province.edges = [];
    }

    const provinces = provincesWithoutEdges as (T & EdgeDef)[];
    const colorToProvince = colorToProvinceWithoutEdges as Record<number, T & EdgeDef>;

    for (let y = 0, yi = 0; y < height; y++, yi += width) {
        for (let x = 0, xi = yi; x < width; x++, xi++) {
            if (accessedPixels[xi]) {
                continue;
            }

            fillEdgesOfProvince(xi, colorToProvince, colorByPosition, accessedPixels, width, height);
        }
    }

    return provinces as (T & EdgeDef)[];
}

function fillEdgesOfProvince<T extends EdgeDef>(
    index: number,
    colorToProvince: Record<number, T>,
    colorByPosition: number[],
    accessedPixels: boolean[],
    width: number,
    height: number
): void {
    const color = colorByPosition[index];
    const edgePixels = findEdgePixels(index, accessedPixels, color, colorByPosition, width, height);
    const edgePixelsByAdjecentProvince: Record<number, [Point, Point][]> = {};
    edgePixels.forEach(([p, line]) => {
        let lines = edgePixelsByAdjecentProvince[p];
        if (lines === undefined) {
            edgePixelsByAdjecentProvince[p] = lines = [];
        }
        lines.push(line);
    });

    const province = colorToProvince[color]!;
    for (const [key, value] of Object.entries(edgePixelsByAdjecentProvince)) {
        const numKey = parseInt(key);
        const edgeSetIndex = province.edges.findIndex(e => e.toColor === numKey);
        const edgeSet: ProvinceEdgeGraph = edgeSetIndex !== -1 ? province.edges[edgeSetIndex] : { toColor: numKey, path: [] };
        const concatedEdges = concatEdges(value);
        edgeSet.path.push(...concatedEdges);
        if (edgeSetIndex === -1) {
            province.edges.push(edgeSet);
        }
    }
}

const indicesToOffset: [number, number][][] = [
    [[0, 1], [0, 0]],
    [[0, 0], [1, 0]],
    [[1, 0], [1, 1]],
    [[1, 1], [0, 1]],
];
function findEdgePixels(index: number, accessedPixels: boolean[], color: number, colorByPosition: number[], width: number, height: number) {
    const edgePixels: [number, [Point, Point]][] = [];
    const pixelStack: number[] = [ index ];
    const indices: number[] = new Array(4);

    while (pixelStack.length > 0) {
        const pixelIndex = pixelStack.pop()!;
        if (accessedPixels[pixelIndex]) {
            continue;
        }

        const x = pixelIndex % width;
        const y = Math.floor(pixelIndex / width);

        indices[0] = x === 0 ? pixelIndex + width - 1 : pixelIndex - 1;
        indices[1] = pixelIndex - width;
        indices[2] = x === width - 1 ? pixelIndex - width + 1 : pixelIndex + 1;
        indices[3] = y === height - 1 ? -1 : pixelIndex + width;

        for (let i = 0; i < 4; i++) {
            const adjecentIndex = indices[i];
            if (adjecentIndex < 0) {
                edgePixels.push([-1, indicesToOffset[i].map(([xOff, yOff]) => ({ x: x + xOff, y: y + yOff })) as [Point, Point]]);
            } else {
                const adjecentColor = colorByPosition[adjecentIndex];
                if (color !== adjecentColor) {
                    edgePixels.push([adjecentColor, indicesToOffset[i].map(([xOff, yOff]) => ({ x: x + xOff, y: y + yOff })) as [Point, Point]]);
                } else {
                    pixelStack.push(adjecentIndex);
                }
            }
        }

        accessedPixels[pixelIndex] = true;
    }

    return edgePixels;
}

function concatEdges(edges: [Point, Point][]): Point[][] {
    const result: Point[][] = [];
    const accessedEdges = new Array<boolean>(edges.length).fill(false);
    for (let i = 0; i < edges.length; i++) {
        if (accessedEdges[i]) {
            continue;
        }

        const edge: Point[] = edges[i];
        accessedEdges[i] = true;

        let foundNew = true;
        while (foundNew) {
            foundNew = false;
            const headTail = edges.findIndex((e, i) => !accessedEdges[i] && pointEqual(edge[0], e[1]));
            if (headTail !== -1) {
                accessedEdges[headTail] = foundNew = true;
                edge.unshift(edges[headTail][0]);
            }

            const tailHead = edges.findIndex((e, i) => !accessedEdges[i] && pointEqual(edge[edge.length - 1], e[0]));
            if (tailHead !== -1) {
                accessedEdges[tailHead] = foundNew = true;
                edge.push(edges[tailHead][1]);
            }
        }

        const newEdge: Point[] = [];
        let lastPoint: Point = edge[0];
        for (const point of edge) {
            if (newEdge.length < 2) {
                newEdge.push(point);
            } else {
                if (point.x === lastPoint.x || point.y === lastPoint.y) {
                    newEdge[newEdge.length - 1] = point;
                } else {
                    lastPoint = newEdge[newEdge.length - 1];
                    newEdge.push(point);
                }
            }
        }

        result.push(newEdge);
    }

    return result;
}

function convertRowToAdjacencies(adjacency: string[], warnings: Warning[]): ProvinceEdgeAdjacency | undefined {
    const from = parseInt(adjacency[0]);
    const to = parseInt(adjacency[1]);
    const type = adjacency[2];
    const through = parseInt(adjacency[3]);
    const startX = parseInt(adjacency[4]);
    const startY = parseInt(adjacency[5]);
    const stopX = parseInt(adjacency[6]);
    const stopY = parseInt(adjacency[7]);
    const rule = adjacency[8];

    if (from === -1 || to === -1) {
        return undefined;
    }

    const start: Point | undefined = !isNaN(startX) && !isNaN(startY) && startX !== -1 && startY !== -1 ? { x: startX, y: startY } : undefined;
    const stop: Point | undefined = !isNaN(stopX) && !isNaN(stopY) && stopX !== -1 && stopY !== -1 ? { x: stopX, y: stopY } : undefined;

    return {
        from,
        to,
        type,
        through,
        start,
        stop,
        rule,
        row: adjacency,
    };
}

function mergeProvinceDefinitions(
    provinceDefinitions: ProvinceDefinition[],
    { provinces, colorToProvince }: ProvinceBmp,
    relatedFiles: string[],
    warnings: Warning[]
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

function validateProvinceContinents(provinces: Province[], continents: string[], relatedFiles: string[], warnings: Warning[]) {
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

function validateProvinceTerrains(provinces: Province[], terrains: Terrain[], relatedFiles: string[], warnings: Warning[]) {
    const terrainMap = arrayToMap(terrains, 'name');
    for (const province of provinces) {
        const terrain = province.terrain;
        const terrainObj = terrainMap[terrain];
        if (!terrainObj || terrainObj.isNaval) {
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

function fillAdjacencyEdges(provinces: (Province | undefined)[], adjacencies: ProvinceEdgeAdjacency[], height: number, relatedFiles: string[], warnings: Warning[]) {
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

function validateProvince(colorByPosition: number[], width: number, height: number, file: string, warnings: Warning[]) {
    const i = new Array(4);
    for (let y = 1, y0 = width, index = width; y < height; y++, y0 += width) {
        for (let x = 0; x < width; x++, index++) {
            i[0] = index;
            i[1] = index + (x === width - 1 ? -width : 0) + 1;
            i[2] = i[0] - width;
            i[3] = i[1] - width;
            i.forEach((v, i0) => {
                i[i0] = colorByPosition[v];
            });
            if (i[0] !== i[1] && i[0] !== i[2] && i[0] !== i[3] && i[1] !== i[2] && i[1] !== i[3] && i[2] !== i[3]) {
                const colors = i.filter((v, i, a) => a.indexOf(v) === i);
                warnings.push({
                    source: colors.map(color => ({ color, id: -1, type: 'province' })),
                    relatedFiles: [file],
                    text: localize('worldmap.warnings.xcrossing', 'Map invalid X crossing at: ({0}, {1}).', x, y - 1),
                });
            }
        }
    }
}
