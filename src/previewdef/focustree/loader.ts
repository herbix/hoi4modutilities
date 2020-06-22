import { ContentLoader, LoadResultOD, Dependency, LoaderSession, LoadResult, mergeInLoadResult } from "../../util/loader";
import { FocusTree, getFocusTree } from "./schema";
import { parseHoi4File } from "../../hoiformat/hoiparser";
import { localize } from "../../util/i18n";
import { uniq, flatten, chain } from "lodash";
import { error as debugError } from "../../util/debug";

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
        
        const focusTreeDependencies = dependencies.filter(d => d.type === 'focus').map(d => d.path);
        const focusTreeDepFiles = (await Promise.all(focusTreeDependencies.map(async (dep) => {
            try {
                const focusTreeDepLoader = this.loaderDependencies.getOrCreate(dep, k => session.createOrGetCachedLoader(k, FocusTreeLoader), FocusTreeLoader);
                return await focusTreeDepLoader.load(session);
            } catch (e) {
                debugError(e);
                return undefined;
            }
        }))).filter((v): v is LoadResult<FocusTreeLoaderResult> => !!v);

        const sharedFocusTrees = chain(focusTreeDepFiles)
            .flatMap(f => f.result.focusTrees)
            .filter(ft => ft.isSharedFocues)
            .value();

        const focusTrees = getFocusTree(parseHoi4File(content, localize('infile', 'In file {0}:\n', this.file)), sharedFocusTrees, this.file);

        const gfxDependencies = [
            ...dependencies.filter(d => d.type === 'gfx').map(d => d.path),
            ...flatten(focusTreeDepFiles.map(f => f.result.gfxFiles))
        ];

        return {
            result: {
                focusTrees,
                gfxFiles: uniq([...gfxDependencies, focusesGFX]),
            },
            dependencies: uniq([this.file, focusesGFX, ...gfxDependencies, ...focusTreeDependencies]),
        };
    }

    public toString() {
        return `[FocusTreeLoader ${this.file}]`;
    }
}
