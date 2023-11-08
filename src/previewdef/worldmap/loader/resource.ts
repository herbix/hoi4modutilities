import { CustomMap, SchemaDef } from "../../../hoiformat/schema";
import { FileLoader, LoadResultOD, FolderLoader, mergeInLoadResult } from "./common";
import { MapLoaderExtra, Resource } from "../definitions";
import { readFileFromModOrHOI4AsJson } from "../../../util/fileloader";
import { LoadResult, LoaderSession } from '../../../util/loader/loader';
import { localize } from '../../../util/i18n';
import { getSpriteByGfxName } from "../../../util/image/imagecache";

interface ResourceFile {
    resources: CustomMap<ResourceDef>
}

interface ResourceDef {
    icon_frame: number;
}

const resourceFileSchema: SchemaDef<ResourceFile> = {
    resources: {
        _innerType: {
            icon_frame: "number",
        },
        _type: "map",
    },
};

const resourceGfxFile = 'interface/general_stuff.gfx';

export class ResourceDefinitionLoader extends FolderLoader<Resource[], Resource[]> {
    constructor() {
        super('common/resources', ResourceFileLoader);
    }
    
    protected mergeFiles(fileResults: LoadResult<Resource[], MapLoaderExtra>[], session: LoaderSession): Promise<LoadResult<Resource[], MapLoaderExtra>> {
        const results =  mergeInLoadResult(fileResults, 'result');
        const resourceMap: Record<string, Resource> = {};
        const warnings = mergeInLoadResult(fileResults, 'warnings');

        for (const resource of results) {
            if (resource.name in resourceMap) {
                warnings.push({
                    source: [],
                    text: localize('worldmap.warnings.resourcedefinedtwice', 'Resource {0} is defined in two files: {1}, {2}.',
                        resource.name, resource.file, resourceMap[resource.name].file),
                    relatedFiles: [resource.file, resourceMap[resource.name].file],
                });
            } else {
                resourceMap[resource.name] = resource;
            }
        }

        return Promise.resolve({
            result: Object.values(resourceMap),
            warnings,
            dependencies: [this.folder + '/*'],
        });
    }

    public toString() {
        return `[ResourceDefinitionLoader]`;
    }
}

export class ResourceFileLoader extends FileLoader<Resource[]> {
    protected async loadFromFile(): Promise<LoadResultOD<Resource[]>> {
        return {
            result: await loadResources(this.file),
            warnings: [],
            dependencies: [resourceGfxFile],
        };
    }

    public toString() {
        return `[ResourceFileLoader ${this.file}]`;
    }
}

async function loadResources(file: string): Promise<Resource[]> {
    const data = await readFileFromModOrHOI4AsJson<ResourceFile>(file, resourceFileSchema);
    const image = await getSpriteByGfxName('GFX_resources_strip', resourceGfxFile);
    return Object.values(data.resources._map).map<Resource>(v => {
        const name = v._key;
        const iconFrame = v._value.icon_frame ?? 0;
        const imageUri = image?.frames[iconFrame - 1]?.uri ?? image?.frames[0]?.uri ?? '';
        return { name, iconFrame, imageUri, file };
    });
}
