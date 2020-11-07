import { CustomMap, DetailValue, Enum, SchemaDef } from "../../../hoiformat/schema";
import { FileLoader, convertColor, LoadResultOD, FolderLoader, mergeInLoadResult } from "./common";
import { MapLoaderExtra, Terrain } from "../definitions";
import { readFileFromModOrHOI4AsJson } from "../../../util/fileloader";
import { LoadResult, LoaderSession } from '../../../util/loader/loader';
import { localize } from '../../../util/i18n';

interface TerrainFile {
    categories: CustomMap<TerrainCategory>
}

interface TerrainCategory {
    color: DetailValue<Enum>;
    naval_terrain: boolean;
}

const terrainFileSchema: SchemaDef<TerrainFile> = {
    categories: {
        _innerType: {
            color: {
                _innerType: "enum",
                _type: "detailvalue",
            },
            naval_terrain: "boolean",
        },
        _type: "map",
    },
};

export class TerrainDefinitionLoader extends FolderLoader<Terrain[], Terrain[]> {
    constructor() {
        super('common/terrain', TerrainFileLoader);
    }
    
    protected mergeFiles(fileResults: LoadResult<Terrain[], MapLoaderExtra>[], session: LoaderSession): Promise<LoadResult<Terrain[], MapLoaderExtra>> {
        const results =  mergeInLoadResult(fileResults, 'result');
        const terrainMap: Record<string, Terrain> = {};
        const warnings = mergeInLoadResult(fileResults, 'warnings');

        for (const terrain of results) {
            if (terrain.name in terrainMap) {
                warnings.push({
                    source: [],
                    text: localize('worldmap.warnings.terraindefinedtwice', 'Terrain {0} is defined in two files: {1}, {2}.',
                        terrain.name, terrain.file, terrainMap[terrain.name].file),
                    relatedFiles: [terrain.file, terrainMap[terrain.name].file],
                });
            } else {
                terrainMap[terrain.name] = terrain;
            }
        }

        return Promise.resolve({
            result: Object.values(terrainMap),
            warnings,
            dependencies: [this.folder + '/*'],
        });
    }

    public toString() {
        return `[TerrainDefinitionLoader]`;
    }
}

export class TerrainFileLoader extends FileLoader<Terrain[]> {
    protected async loadFromFile(): Promise<LoadResultOD<Terrain[]>> {
        return {
            result: await loadTerrains(this.file),
            warnings: [],
        };
    }

    public toString() {
        return `[TerrainFileLoader ${this.file}]`;
    }
}

async function loadTerrains(file: string): Promise<Terrain[]> {
    const data = await readFileFromModOrHOI4AsJson<TerrainFile>(file, terrainFileSchema);
    return Object.values(data.categories._map).map<Terrain>(v => {
        const name = v._key;
        const color = convertColor(v._value.color);
        const isNaval = v._value.naval_terrain ?? false;
        return { name, color, isNaval, file };
    });
}
