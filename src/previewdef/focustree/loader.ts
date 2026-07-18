import { ContentLoader, LoadResultOD, Dependency, LoaderSession, mergeInLoadResult } from "../../util/loader/loader";
import { convertFocusFileNodeToJson, FocusTree, getFocusTreeWithFocusFile } from "./schema";
import { parseHoi4File } from "../../hoiformat/hoiparser";
import { localize } from "../../util/i18n";
import { uniq, flatten, chain } from "lodash";
import { gfxIndex } from "../../indexing/gfxindex";
import { sharedFocusIndex } from "../../indexing/sharedfocusindex";

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

        const constants = {};

        const file = convertFocusFileNodeToJson(parseHoi4File(content, localize('infile', 'In file {0}:\n', this.file)), constants);
        const focusTreeDependencies = dependencies.filter(d => d.type === 'focus').map(d => d.path);

        const sharedFocusFilesFromIndex = chain(file.focus_tree)
            .flatMap(focusTree => focusTree.shared_focus)
            .filter((sharedFocus): sharedFocus is string => sharedFocus !== undefined)
            .map(sharedFocus => sharedFocusIndex.get(sharedFocus))
            .filter((filePath): filePath is string => filePath !== undefined)
            .uniq()
            .value();

        for (const filePath of sharedFocusFilesFromIndex) {
            if (!focusTreeDependencies.includes(filePath) && filePath !== this.file) {
                focusTreeDependencies.push(filePath);
            }
        }

        const focusTreeDepFiles = await this.loaderDependencies.loadMultiple(focusTreeDependencies, session, FocusTreeLoader);

        const sharedFocusTrees = chain(focusTreeDepFiles)
            .flatMap(f => f.result.focusTrees)
            .filter(ft => ft.isSharedFocues)
            .value();

        const focusTrees = getFocusTreeWithFocusFile(file, sharedFocusTrees, this.file, constants);

        const focusGfxNames = chain(focusTrees)
            .flatMap(ft => Object.values(ft.focuses))
            .flatMap(f => [...f.icon.map(i => i.icon), f.overlay])
            .value();

        const gfxDependencies = [
            ...dependencies.filter(d => d.type === 'gfx').map(d => d.path),
            ...flatten(focusTreeDepFiles.map(f => f.result.gfxFiles)),
            ...await gfxIndex.getGfxContainerFiles(focusGfxNames),
        ];

        return {
            result: {
                focusTrees,
                gfxFiles: uniq([...gfxDependencies, focusesGFX]),
            },
            dependencies: uniq([
                this.file,
                focusesGFX,
                ...gfxDependencies,
                ...focusTreeDependencies,
                ...mergeInLoadResult(focusTreeDepFiles, 'dependencies')
            ]),
        };
    }

    public toString() {
        return `[FocusTreeLoader ${this.file}]`;
    }
}
