import { TechnologyTree, getTechnologyTrees } from "./schema";
import { HOIPartial, convertNodeToJson } from "../../hoiformat/schema";
import { GuiFile, guiFileSchema } from "../../hoiformat/gui";
import { ContentLoader, Dependency, LoadResultOD, LoaderSession, LoadResult, mergeInLoadResult } from "../../util/loader";
import { parseHoi4File } from "../../hoiformat/hoiparser";
import { localize } from "../../util/i18n";
import { distinct } from "../../util/common";
import { error as debugError } from "../../util/debug";

export interface TechnologyTreeLoaderResult {
    technologyTrees: TechnologyTree[];
    guiFiles: { file: string, data: HOIPartial<GuiFile> }[];
    gfxFiles: string[];
}

export interface GuiFileLoaderResult {
    guiFiles: { file: string, data: HOIPartial<GuiFile> }[];
    gfxFiles: string[];
}

const technologyUIGfxFiles = ['interface/countrytechtreeview.gfx', 'interface/countrytechnologyview.gfx'];
const technologiesGFX = 'interface/technologies.gfx';
const relatedGfxFiles = [...technologyUIGfxFiles, technologiesGFX];
const guiFilePath = 'interface/countrytechtreeview.gui';

export class TechnologyTreeLoader extends ContentLoader<TechnologyTreeLoaderResult> {
    protected async postLoad(content: string | undefined, dependencies: Dependency[], error: any, session: LoaderSession): Promise<LoadResultOD<TechnologyTreeLoaderResult>> {
        if (error || (content === undefined)) {
            throw error;
        }

        const gfxDependencies = [...relatedGfxFiles, ...dependencies.filter(d => d.type === 'gfx').map(d => d.path)];
        const technologyTrees = getTechnologyTrees(parseHoi4File(content, localize('infile', 'In file {0}:\n', this.file)));
        const guiDependencies = [guiFilePath, ...dependencies.filter(d => d.type === 'gui').map(d => d.path)];
        
        const guiDepFiles = (await Promise.all(guiDependencies.map(async (dep) => {
            try {
                const guiDepLoader = this.loaderDependencies.getOrCreate(dep, k => session.createOrGetCachedLoader(k, GuiFileLoader), GuiFileLoader);
                return await guiDepLoader.load(session);
            } catch (e) {
                debugError(e);
                return undefined;
            }
        }))).filter((v): v is LoadResult<GuiFileLoaderResult> => !!v);
        
        this.loaderDependencies.flip();

        return {
            result: {
                technologyTrees,
                gfxFiles: distinct([...gfxDependencies, ...guiDepFiles.map(r => r.result.gfxFiles).reduce((p, c) => p.concat(c), [])]),
                guiFiles: distinct(guiDepFiles.map(r => r.result.guiFiles).reduce((p, c) => p.concat(c), []))
            },
            dependencies: distinct([this.file, ...gfxDependencies, ...mergeInLoadResult(guiDepFiles, 'dependencies')]),
        };
    }

    public toString() {
        return `[TechnologyTreeLoader ${this.file}]`;
    }
}

export class GuiFileLoader extends ContentLoader<GuiFileLoaderResult> {
    protected async postLoad(content: string | undefined, dependencies: Dependency[], error: any, session: LoaderSession): Promise<LoadResultOD<GuiFileLoaderResult>> {
        if (error || (content === undefined)) {
            throw error;
        }

        const gfxDependencies = [this.file.replace(/.gui$/, '.gfx'), ...dependencies.filter(d => d.type === 'gfx').map(d => d.path)];
        const guiDependencies = dependencies.filter(d => d.type === 'gui').map(d => d.path);

        const guiDepFiles = (await Promise.all(guiDependencies.map(async (dep) => {
            try {
                const guiDepLoader = this.loaderDependencies.getOrCreate(dep, k => session.createOrGetCachedLoader(k, GuiFileLoader), GuiFileLoader);
                return await guiDepLoader.load(session);
            } catch (e) {
                debugError(e);
                return undefined;
            }
        }))).filter((v): v is LoadResult<GuiFileLoaderResult> => !!v);

        this.loaderDependencies.flip();

        const guiFile = convertNodeToJson<GuiFile>(parseHoi4File(content, localize('infile', 'In file {0}:\n', this.file)), guiFileSchema);

        return {
            result: {
                gfxFiles: distinct([...gfxDependencies, ...guiDepFiles.map(r => r.result.gfxFiles).reduce((p, c) => p.concat(c), [])]),
                guiFiles: distinct([{ file: this.file, data: guiFile }, ...guiDepFiles.map(r => r.result.guiFiles).reduce((p, c) => p.concat(c), [])])
            },
            dependencies: distinct([this.file, ...gfxDependencies, ...mergeInLoadResult(guiDepFiles, 'dependencies')]),
        };
    }

    public toString() {
        return `[GuiFileLoader ${this.file}]`;
    }
}
