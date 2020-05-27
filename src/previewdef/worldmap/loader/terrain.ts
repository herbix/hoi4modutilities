import { CustomMap, Attachment, Enum, SchemaDef } from "../../../hoiformat/schema";
import { FileLoader, convertColor } from "./common";
import { Terrain, Warning, ProgressReporter } from "../definitions";
import { readFileFromModOrHOI4AsJson } from "../../../util/fileloader";

interface TerrainFile {
    categories: CustomMap<TerrainCategory>
}

interface TerrainCategory {
    color: Attachment<Enum>;
    naval_terrain: boolean;
}

const terrainFileSchema: SchemaDef<TerrainFile> = {
    categories: {
        _innerType: {
            color: {
                _innerType: "enum",
                _type: "attachment",
            },
            naval_terrain: "boolean",
        },
        _type: "map",
    },
};

export class TerrainDefinitionLoader extends FileLoader<Terrain[]> {
    constructor(progressReporter: ProgressReporter) {
        super('common/terrain/00_terrain.txt', progressReporter);
    }

    protected loadFromFile(warnings: Warning[], force: boolean): Promise<Terrain[]> {
        return loadTerrains(this.file);
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
