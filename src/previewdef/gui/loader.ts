import { chain, flatMap } from "lodash";
import { GuiFile, guiFileSchema } from "../../hoiformat/gui";
import { parseHoi4File } from "../../hoiformat/hoiparser";
import { convertNodeToJson, HOIPartial } from "../../hoiformat/schema";
import { localize } from "../../util/i18n";
import { ContentLoader, Dependency, LoaderSession, LoadResultOD, mergeInLoadResult } from "../../util/loader/loader";

export interface GuiFileLoaderResult {
    guiFiles: { file: string, data: HOIPartial<GuiFile> }[];
    gfxFiles: string[];
}

export class GuiFileLoader extends ContentLoader<GuiFileLoaderResult> {
    protected async postLoad(content: string | undefined, dependencies: Dependency[], error: any, session: LoaderSession): Promise<LoadResultOD<GuiFileLoaderResult>> {
        if (error || (content === undefined)) {
            throw error;
        }

        const gfxDependencies = [this.file.replace(/.gui$/, '.gfx'), ...dependencies.filter(d => d.type === 'gfx').map(d => d.path)];
        const guiDependencies = dependencies.filter(d => d.type === 'gui').map(d => d.path);

        const guiDepFiles = await this.loaderDependencies.loadMultiple(guiDependencies, session, GuiFileLoader);

        const guiFile = convertNodeToJson<GuiFile>(parseHoi4File(content, localize('infile', 'In file {0}:\n', this.file)), guiFileSchema);

        return {
            result: {
                gfxFiles: chain(gfxDependencies).concat(flatMap(guiDepFiles, r => r.result.gfxFiles)).uniq().value(),
                guiFiles: chain(guiDepFiles).flatMap(r => r.result.guiFiles).concat({ file: this.file, data: guiFile }).uniq().value(),
            },
            dependencies: chain([this.file]).concat(gfxDependencies, mergeInLoadResult(guiDepFiles, 'dependencies')).uniq().value(),
        };
    }

    public toString() {
        return `[GuiFileLoader ${this.file}]`;
    }
}
