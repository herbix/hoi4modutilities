import { ContentLoader, Dependency, LoaderSession, LoadResultOD, mergeInLoadResult } from '../../util/loader/loader';
import { convertFocusFileNodeToJson, FocusStyle, FocusTree, getFocusStyles, getFocusTreeWithFocusFile, getGfxNameForSearchFilter } from './schema';
import { parseHoi4File } from '../../hoiformat/hoiparser';
import { localize } from '../../util/i18n';
import { chain, flatten, isEqual, uniq, uniqBy, uniqWith } from 'lodash';
import { gfxIndex } from '../../indexing/gfxindex';
import { sharedFocusIndex } from '../../indexing/sharedfocusindex';
import { HOIPartial } from '../../hoiformat/schema';
import { GuiFile } from '../../hoiformat/gui';
import { GuiFileLoader } from '../gui/loader';
import { FocusInlayWindow } from './inlaywindow/schema';
import { FocusInlayWindowLoader } from './inlaywindow/loader';
import { arrayToMap } from '../../util/common';
import { sortConditionExprs } from '../../hoiformat/condition';
import { guiIndex } from '../../indexing/guiindex';

export interface FocusTreeLoaderResult {
    focusTrees: FocusTree[];
    styles: FocusStyle[];
    gfxFiles: string[];
    guiFiles: { file: string, data: HOIPartial<GuiFile> }[];
    inlayWindows: FocusInlayWindow[];
}

export const defaultFocusStyle: FocusStyle = {
    default: true,
    name: 'default_style',
    unavailable: 'GFX_focus_unavailable',
    completed: 'GFX_focus_completed',
    available: 'GFX_focus_can_start',
    current: 'GFX_focus_current',
};

const focusesGFX = ['interface/goals.gfx', 'interface/nationalfocusview.gfx'];
const defaultStyleFile = 'common/national_focus/00_titlebar_styles.txt';
const focusesGui = 'interface/nationalfocusview.gui';

export class FocusTreeLoader extends ContentLoader<FocusTreeLoaderResult> {
    protected async postLoad(content: string | undefined, dependencies: Dependency[], error: any, session: LoaderSession): Promise<LoadResultOD<FocusTreeLoaderResult>> {
        if (error || (content === undefined)) {
            throw error;
        }

        const constants = {};

        const file = convertFocusFileNodeToJson(parseHoi4File(content, localize('infile', 'In file {0}:\n', this.file)), constants);
        
        // focus dependencies: focus style, shared/joint focuses
        const focusTreeDependencies = dependencies.filter(d => d.type === 'focus').map(d => d.path);
        focusTreeDependencies.push(defaultStyleFile);

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
        const focusStyles = getFocusStyles(file); 

        // gfx dependencies
        const focusGfxNames = chain(focusTrees)
            .flatMap(ft => Object.values(ft.focuses))
            .flatMap(f => [...f.icon.map(i => i.icon), f.overlay, ...f.searchFilters.map(getGfxNameForSearchFilter)])
            .uniq()
            .value();

        const gfxDependencies = [
            ...dependencies.filter(d => d.type === 'gfx').map(d => d.path),
            ...flatten(focusTreeDepFiles.map(f => f.result.gfxFiles)),
            ...await gfxIndex.getGfxContainerFiles(focusGfxNames),
        ];
        
        // inlay window dependencies
        const focusInlayWindowDependencies = uniq([
            ...chain(focusTrees).flatMap(ft => ft.inlayWindows).map(iw => `common/focus_inlay_windows/${iw.id}.txt`).value(),
            ...dependencies.filter(d => d.type === 'focus_inlay_window').map(d => d.path),
        ]);

        const focusInlayWindowDepFiles = await this.loaderDependencies.loadMultiple(focusInlayWindowDependencies, session, FocusInlayWindowLoader);
        const allInlayWindows = arrayToMap(chain(focusInlayWindowDepFiles).flatMap(f => f.result.inlayWindows).value(), 'id');
        const inlayWindows: FocusInlayWindow[] = [];
        for (const focusTree of focusTrees) {
            for (const inlayWindow of focusTree.inlayWindows) {
                const inlayWindowData = allInlayWindows[inlayWindow.id];
                if (inlayWindowData) {
                    inlayWindows.push(inlayWindowData);
                    if (inlayWindowData.conditionExprs.length > 0) {
                        focusTree.conditionExprs = uniqWith([...focusTree.conditionExprs, ...inlayWindowData.conditionExprs], isEqual);
                    }
                }
            }
            sortConditionExprs(focusTree.conditionExprs);
        }

        // gui dependencies
        const guiDependencies = [focusesGui, ...dependencies.filter(d => d.type === 'gui').map(d => d.path)];
        for (const inlayWindow of inlayWindows) {
            const guiFile = guiIndex.get(inlayWindow.windowName)?.file;
            if (guiFile && !guiDependencies.includes(guiFile)) {
                guiDependencies.push(guiFile);
            }
        }
        const guiDepFiles = await this.loaderDependencies.loadMultiple(guiDependencies, session, GuiFileLoader);

        return {
            result: {
                focusTrees,
                styles: uniqBy([...focusStyles, ...focusTreeDepFiles.flatMap(f => f.result.styles)], 'name'),
                gfxFiles: uniq([...gfxDependencies, ...focusesGFX]),
                guiFiles: chain(guiDepFiles).flatMap(r => r.result.guiFiles).uniq().value(),
                inlayWindows,
            },
            dependencies: uniq([
                this.file,
                ...focusesGFX,
                ...gfxDependencies,
                ...focusTreeDependencies,
                ...guiDependencies,
                ...focusInlayWindowDependencies,
                ...mergeInLoadResult(focusTreeDepFiles, 'dependencies'),
                ...mergeInLoadResult(guiDepFiles, 'dependencies'),
                ...mergeInLoadResult(focusInlayWindowDepFiles, 'dependencies'),
            ]),
        };
    }

    public toString() {
        return `[FocusTreeLoader ${this.file}]`;
    }
}
