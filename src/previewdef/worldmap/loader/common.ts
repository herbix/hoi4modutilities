import * as path from 'path';
import { Zone, Point, ProgressReporter, Warning } from "../definitions";
import { hoiFileExpiryToken, readFileFromModOrHOI4, listFilesFromModOrHOI4 } from "../../../util/fileloader";
import { Attachment, Enum } from '../../../hoiformat/schema';
import { hsvToRgb } from '../../../util/common';

export function mergeBoundingBox(a: Zone, b: Zone, width: number): Zone {
    if (a.x + a.w < width * 0.25 && b.x > width * 0.75) {
        b = { ...b, x: b.x - width };
    }

    if (b.x + b.w < width * 0.25 && a.x > width * 0.75) {
        a = { ...a, x: a.x - width };
    }

    const l = Math.min(a.x, b.x);
    const t = Math.min(a.y, b.y);
    const r = Math.max(a.x + a.w, b.x + b.w);
    const bo = Math.max(a.y + a.h, b.y + b.h);
    return {
        x: l,
        y: t,
        w: r - l,
        h: bo - t,
    };
}

export function pointEqual(a: Point, b: Point): boolean {
    return a.x === b.x && a.y === b.y;
}

export function convertColor(color: Attachment<Enum> | undefined): number {
    if (!color) {
        return 0;
    }

    const vec = color._value._values.map(e => parseFloat(e));
    if (vec.length < 3) {
        return 0;
    }

    if (!color._attachment || color._attachment.toLowerCase() === 'rgb') {
        return (vec[0] << 16) | (vec[1] << 8) | vec[2];
    }

    if (color._attachment.toLowerCase() === 'hsv') {
        const { r, g, b } = hsvToRgb(vec[0], vec[1], vec[2]);
        return (r << 16) | (g << 8) | b;
    }

    return 0;
}


export type LoadResult<T> = { result: T, dependencies: string[], warnings: Warning[] };
export abstract class Loader<T> {
    private cachedValue: LoadResult<T> | undefined;

    constructor(protected progressReporter: ProgressReporter) {
    }

    async load(force?: boolean): Promise<LoadResult<T>> {
        if (this.cachedValue === undefined || force || await this.shouldReload()) {
            return this.cachedValue = await this.loadImpl(force ?? false);
        }

        return this.cachedValue;
    };

    public shouldReload(): Promise<boolean> {
        return Promise.resolve(false);
    };

    protected abstract loadImpl(force: boolean): Promise<LoadResult<T>>;
}

export abstract class FileLoader<T> extends Loader<T> {
    private expiryToken: string = '';

    constructor(public file: string, progressReporter: ProgressReporter) {
        super(progressReporter);
    }

    public async shouldReload(): Promise<boolean> {
        return await hoiFileExpiryToken(this.file) !== this.expiryToken;
    }

    protected async loadImpl(force: boolean): Promise<LoadResult<T>> {
        const warnings: Warning[] = [];
        this.expiryToken = await hoiFileExpiryToken(this.file);

        const result = await this.loadFromFile(warnings, force);

        if (typeof result !== 'object' || !('dependencies' in result)) {
            return {
                result,
                dependencies: [this.file],
                warnings,
            };
        } else {
            result.dependencies.push(this.file);
            return result;
        }
    }

    protected abstract loadFromFile(warnings: Warning[], force: boolean): Promise<T | LoadResult<T>>;
}

export abstract class FolderLoader<T, TFile> extends Loader<T> {
    private fileCount: number = 0;
    private subLoaders: Record<string, FileLoader<TFile>> = {};

    constructor(
        public folder: string,
        private subLoaderConstructor: { new (file: string, progressReporter: ProgressReporter): FileLoader<TFile> },
        progressReporter: ProgressReporter
    ) {
        super(progressReporter);
    }

    public async shouldReload(): Promise<boolean> {
        const files = await listFilesFromModOrHOI4(this.folder);
        if (this.fileCount !== files.length || files.some(f => !(f in this.subLoaders))) {
            return true;
        }

        return (await Promise.all(Object.values(this.subLoaders).map(l => l.shouldReload()))).some(v => v);
    }

    protected async loadImpl(force: boolean): Promise<LoadResult<T>> {
        const files = await listFilesFromModOrHOI4(this.folder);
        this.fileCount = files.length;

        const subLoaders = this.subLoaders;
        const newSubLoaders: Record<string, FileLoader<TFile>> = {};
        const fileResultPromises: Promise<LoadResult<TFile>>[] = [];

        for (const file of files) {
            let subLoader = subLoaders[file];
            if (!subLoader) {
                subLoader = new this.subLoaderConstructor(path.join(this.folder, file), this.progressReporter);
            }

            fileResultPromises.push(subLoader.load(force));
            newSubLoaders[file] = subLoader;
        }

        this.subLoaders = newSubLoaders;

        return this.mergeFiles(await Promise.all(fileResultPromises), force);
    }

    protected abstract mergeFiles(fileResults: LoadResult<TFile>[], force: boolean): Promise<LoadResult<T>>;
}

export function mergeInLoadResult<K extends 'warnings' | 'dependencies'>(loadResults: LoadResult<unknown>[], key: K): LoadResult<unknown>[K] {
    return loadResults.reduce<LoadResult<unknown>[K]>((p, c) => (p as any).concat(c[key]), []);
}

export function sortItems<T extends { id: number }>(
    items: T[],
    validMaxId: number,
    onMaxIdTooLarge: (maxId: number) => void,
    onConflict: (newItem: T, existingItem: T, badId: number) => void,
    onNotExist: (startId: number, endId: number) => void,
    reassignMinusOneId: boolean = true,
    badId: number = -1,
): { sorted: T[], badId: number } {
    const maxId = items.reduce((p, c) => c.id > p ? c.id : p, 0);
    if (maxId > validMaxId) {
        onMaxIdTooLarge(maxId);
    }

    const result: T[] = new Array(maxId + 1);
    items.forEach(p => {
        if (reassignMinusOneId && p.id === -1) {
            p.id = badId--;
        }
        if (result[p.id]) {
            const conflictItem = result[p.id];
            onConflict(p, conflictItem, badId);
            conflictItem.id = badId--;
            result[conflictItem.id] = conflictItem;
        }
        result[p.id] = p;
    });

    let lastNotExistStateId: number | undefined = undefined;
    for (let i = 1; i <= maxId; i++) {
        if (result[i]) {
            if (lastNotExistStateId !== undefined) {
                onNotExist(lastNotExistStateId, i - 1);
                lastNotExistStateId = undefined;
            }
        } else {
            if (lastNotExistStateId === undefined) {
                lastNotExistStateId = i;
            }
        }
    };

    return {
        sorted: result,
        badId,
    };
}
