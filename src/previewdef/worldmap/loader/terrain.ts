import { CustomMap, DetailValue, Enum, SchemaDef } from "../../../hoiformat/schema";
import { FileLoader, convertColor, LoadResultOD } from "./common";
import { Terrain } from "../definitions";
import { readFileFromModOrHOI4AsJson } from "../../../util/fileloader";

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

export class TerrainDefinitionLoader extends FileLoader<Terrain[]> {
    constructor() {
        super('common/terrain/00_terrain.txt');
    }

    protected async loadFromFile(): Promise<LoadResultOD<Terrain[]>> {
        return {
            result: await loadTerrains(this.file),
            warnings: [],
        };
    }

    public toString() {
        return `[TerrainDefinitionLoader]`;
    }
}

async function loadTerrains(file: string): Promise<Terrain[]> {
    const data = await readFileFromModOrHOI4AsJson<TerrainFile>(file, terrainFileSchema);
    return Object.values(data.categories._map).map<Terrain>(v => {
        const name = v._key;
        const color = convertColor(v._value.color);
        const isNaval = v._value.naval_terrain ?? false;
        return { name, color, isNaval };
    });
}
