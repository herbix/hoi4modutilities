import { ContentLoader, LoadResultOD, Dependency, LoaderSession } from "../../util/loader";
import { FocusTree, getFocusTree } from "./schema";
import { parseHoi4File } from "../../hoiformat/hoiparser";
import { localize } from "../../util/i18n";
import { distinct } from "../../util/common";

export interface FocusTreeLoaderResult {
    focusTrees: FocusTree[];
    gfxFiles: string[];
}

const focusesGFX = 'interface/goals.gfx';

export class FocusTreeLoader extends ContentLoader<FocusTreeLoaderResult> {
    protected async postLoad(content: string | undefined, dependencies: Dependency[], error: any, session: LoaderSession): Promise<LoadResultOD<FocusTreeLoaderResult>> {
        if (error || (content === undefined)) {
            throw error;
        }

        const gfxDependencies = dependencies.filter(d => d.type === 'gfx').map(d => d.path);
        const focusTrees = getFocusTree(parseHoi4File(content, localize('infile', 'In file {0}:\n', this.file)));

        return {
            result: {
                focusTrees,
                gfxFiles: distinct([...gfxDependencies, focusesGFX]),
            },
            dependencies: distinct([this.file, focusesGFX, ...gfxDependencies]),
        };
    }

    public toString() {
        return `[FocusTreeLoader ${this.file}]`;
    }
}
