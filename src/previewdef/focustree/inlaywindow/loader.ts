import { ContentLoader, Dependency, LoaderSession, LoadResultOD } from '../../../util/loader/loader';
import { FocusInlayWindow, getFocusInlayWindows } from './schema';

export interface FocusInlayWindowLoaderResult {
    inlayWindows: FocusInlayWindow[];
}

export class FocusInlayWindowLoader extends ContentLoader<FocusInlayWindowLoaderResult> {
    protected async postLoad(content: string | undefined, dependencies: Dependency[], error: any, session: LoaderSession): Promise<LoadResultOD<FocusInlayWindowLoaderResult>> {
        if (error || (content === undefined)) {
            throw error;
        }

        return {
            result: {
                inlayWindows: getFocusInlayWindows(content, this.file),
            },
        };
    }
}
