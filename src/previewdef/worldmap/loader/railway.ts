import { readFileFromModOrHOI4 } from "../../../util/fileloader";
import { localize } from "../../../util/i18n";
import { LoaderSession } from "../../../util/loader/loader";
import { Province, Railway, SupplyNode, WorldMapWarning } from "../definitions";
import { FileLoader, LoadResult, LoadResultOD } from "./common";
import { DefaultMapLoader } from "./provincemap";

type RailwayLoaderResult = { railways: Railway[]; };
export class RailwayLoader extends FileLoader<RailwayLoaderResult> {
    constructor(private defaultMapLoader: DefaultMapLoader) {
        super("map/railways.txt");
    }

    public async shouldReloadImpl(session: LoaderSession): Promise<boolean> {
        return await super.shouldReloadImpl(session) || await this.defaultMapLoader.shouldReload(session);
    }
    
    protected async loadImpl(session: LoaderSession): Promise<LoadResult<RailwayLoaderResult>> {
        await this.fireOnProgressEvent(localize('worldmap.progress.loadingrailways', 'Loading railways...'));
        return super.loadImpl(session);
    }
    
    protected async loadFromFile(session: LoaderSession): Promise<LoadResultOD<RailwayLoaderResult>> {
        const provinceMap = await this.defaultMapLoader.load(session);
        const warnings: WorldMapWarning[] = [];
        return {
            result: {
                railways: await loadRailway(provinceMap.result.provinces, this.file, warnings)
            },
            warnings,
        };
    }

    public toString() {
        return `[RailwayLoader: ${this.file}]`;
    }
}

async function loadRailway(provinces: (Province | null | undefined)[], file: string, warnings: WorldMapWarning[]): Promise<Railway[]> {
    const [railwaysBuffer] = await readFileFromModOrHOI4(file);
    const railwaysRaw = railwaysBuffer.toString().split(/(?:\r\n|\n|\r)/).map(line => line.split(/\s+/).map(v => parseInt(v))).filter(v => v.length >= 3);
    const railways = railwaysRaw.map((line, index) => {
        if (line[1] + 2 > line.length) {
            warnings.push({
                source: [{ type: 'railway', id: index }],
                relatedFiles: [file],
                text: localize('worldmap.warnings.railwaylinecountnotenough', 'Not enough provinces in railway: {0}', line),
            });
        }
        return {
            level: line[0],
            provinces: line.slice(2, Math.min(line[1] + 2, line.length)),
        };
    });

    validateRailways(provinces, file, railways, warnings);

    return railways;
}

function validateRailways(provinces: (Province | null | undefined)[], file: string, railways: Railway[], warnings: WorldMapWarning[]): void {
    railways.forEach(railway => {
        railway.provinces.forEach((provinceId, index) => {
            const province = provinces[provinceId];
            if (!province) {
                warnings.push({
                    source: [{ type: 'railway', id: index }, { type: 'province', id: provinceId, color: 0 }],
                    text: localize('worldmap.warnings.provincenotexist', 'Province with id {0} doesn\'t exist.', provinceId),
                    relatedFiles: [file],
                });
            } else if (index > 0) {
                const lastProvinceId = railway.provinces[index - 1];
                const hasEdge = province.edges.filter(e => e.to === lastProvinceId && e.type !== 'impassable').length > 0;
                if (!hasEdge) {
                    warnings.push({
                        source: [{ type: 'railway', id: index }, { type: 'province', id: provinceId, color: 0 }, { type: 'province', id: lastProvinceId, color: 0 }],
                        text: localize('worldmap.warnings.provincenotadjacent', 'Province {0}, {1} are not adjacent.', provinceId, lastProvinceId),
                        relatedFiles: [file],
                    });
                }
            }
        });
    });
}

type SupplyNodeLoaderResult = { supplyNodes: SupplyNode[]; };
export class SupplyNodeLoader extends FileLoader<SupplyNodeLoaderResult> {
    constructor(private defaultMapLoader: DefaultMapLoader) {
        super("map/supply_nodes.txt");
    }

    public async shouldReloadImpl(session: LoaderSession): Promise<boolean> {
        return await super.shouldReloadImpl(session) || await this.defaultMapLoader.shouldReload(session);
    }
    
    protected async loadImpl(session: LoaderSession): Promise<LoadResult<SupplyNodeLoaderResult>> {
        await this.fireOnProgressEvent(localize('worldmap.progress.loadingsupplynodes', 'Loading supply nodes...'));
        return super.loadImpl(session);
    }
    
    protected async loadFromFile(session: LoaderSession): Promise<LoadResultOD<SupplyNodeLoaderResult>> {
        const provinceMap = await this.defaultMapLoader.load(session);
        const warnings: WorldMapWarning[] = [];
        return {
            result: {
                supplyNodes: await loadSupplyNodes(provinceMap.result.provinces, this.file, warnings)
            },
            warnings,
        };
    }

    public toString() {
        return `[SupplyNodeLoader: ${this.file}]`;
    }
}

async function loadSupplyNodes(provinces: (Province | null | undefined)[], file: string, warnings: WorldMapWarning[]): Promise<SupplyNode[]> {
    const [supplyNodesBuffer] = await readFileFromModOrHOI4(file);
    const supplyNodesRaw = supplyNodesBuffer.toString().split(/(?:\r\n|\n|\r)/).map(line => line.split(/\s+/).map(v => parseInt(v))).filter(v => v.length >= 2);
    const supplyNodes = supplyNodesRaw.map((line, index) => {
        const provinceId = line[1];
        if (!provinces[provinceId]) {
            warnings.push({
                source: [{ type: 'supplynode', id: index }, { type: 'province', id: provinceId, color: 0 }],
                text: localize('worldmap.warnings.provincenotexist', 'Province with id {0} doesn\'t exist.', provinceId),
                relatedFiles: [file],
            });
        }
        return {
            level: line[0],
            province: provinceId,
        };
    });

    return supplyNodes;
}

