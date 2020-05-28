import * as vscode from 'vscode';
import * as path from 'path';;
import { hoiFileExpiryToken, listFilesFromModOrHOI4, readFileFromModOrHOI4AsJson } from './fileloader';
import { HOIPartial, SchemaDef } from '../hoiformat/schema';
import { error } from './debug';

export class LoaderSession {
    private static loaderSessions: LoaderSession[] = [];

    public static start() {
        const newSession = new LoaderSession();
        LoaderSession.loaderSessions.push(newSession);
        return newSession;
    }
    
    public static complete() {
        return LoaderSession.loaderSessions.pop();
    }

    public static get current() {
        return LoaderSession.loaderSessions.length > 0 ? LoaderSession.loaderSessions[LoaderSession.loaderSessions.length - 1] : undefined;
    }

    private loadedLoader: Set<Loader<unknown>> = new Set();
    private shouldLoaderReload: Map<Loader<unknown>, boolean> = new Map();

    public isLoaded(loader: Loader<unknown>): boolean {
        return this.loadedLoader.has(loader);
    }

    public setLoaded(loader: Loader<unknown>) {
        this.loadedLoader.add(loader);
    }

    public setShouldReload(loader: Loader<unknown>) {
        this.shouldLoaderReload.set(loader, true);
    }

    public shouldReload(loader: Loader<unknown>): boolean {
        return this.shouldLoaderReload.get(loader) ?? false;
    }
}

export type LoadResult<T, E={}> = { result: T, dependencies: string[] } & E;
export type LoadResultOD<T, E={}> = Omit<LoadResult<T, E>, 'dependencies'> & Partial<Pick<LoadResult<T, E>, 'dependencies'>> & E;
export abstract class Loader<T, E = {}> {
    private cachedValue: LoadResult<T, E> | undefined;
    protected onProgressEmitter = new vscode.EventEmitter<string>();
    public onProgress = this.onProgressEmitter.event;

    constructor() {
    }

    async load(force?: boolean): Promise<LoadResult<T, E>> {
        if (this.cachedValue === undefined || (!LoaderSession.current?.isLoaded(this) && (force || await this.shouldReload()))) {
            LoaderSession.current?.setLoaded(this);
            return this.cachedValue = await this.loadImpl(force ?? false);
        }

        return this.cachedValue;
    };

    public async shouldReload(): Promise<boolean> {
        if (LoaderSession.current?.shouldReload(this)) {
            return true;
        }

        const result = await this.shouldReloadImpl();
        if (result) {
            LoaderSession.current?.setShouldReload(this);
        }

        return result;
    };

    protected shouldReloadImpl(): Promise<boolean> {
        return Promise.resolve(false);
    }

    protected async fireOnProgressEvent(progress: string): Promise<void> {
        this.onProgressEmitter.fire(progress);
        await new Promise(resolve => setTimeout(resolve, 0));
    }

    protected abstract loadImpl(force: boolean): Promise<LoadResult<T, E>>;
}

export abstract class FileLoader<T, E={}> extends Loader<T, E> {
    private expiryToken: string = '';

    constructor(public file: string) {
        super();
    }

    public async shouldReloadImpl(): Promise<boolean> {
        return await hoiFileExpiryToken(this.file) !== this.expiryToken;
    }

    protected async loadImpl(force: boolean): Promise<LoadResult<T, E>> {
        this.expiryToken = await hoiFileExpiryToken(this.file);

        const result = await this.loadFromFile(force);

        return {
            ...result,
            dependencies: result.dependencies ? result.dependencies : [this.file],
        };
    }

    protected abstract loadFromFile(force: boolean): Promise<LoadResultOD<T, E>>;
}

export abstract class FolderLoader<T, TFile, E={}, EFile={}> extends Loader<T, E> {
    private fileCount: number = 0;
    private subLoaders: Record<string, FileLoader<TFile, EFile>> = {};

    constructor(
        public folder: string,
        private subLoaderConstructor: { new (file: string): FileLoader<TFile, EFile> },
    ) {
        super();
    }

    public async shouldReloadImpl(): Promise<boolean> {
        const files = await listFilesFromModOrHOI4(this.folder);
        if (this.fileCount !== files.length || files.some(f => !(f in this.subLoaders))) {
            return true;
        }

        return (await Promise.all(Object.values(this.subLoaders).map(l => l.shouldReload()))).some(v => v);
    }

    protected async loadImpl(force: boolean): Promise<LoadResult<T, E>> {
        const files = await listFilesFromModOrHOI4(this.folder);
        this.fileCount = files.length;

        const subLoaders = this.subLoaders;
        const newSubLoaders: Record<string, FileLoader<TFile, EFile>> = {};
        const fileResultPromises: Promise<LoadResult<TFile, EFile>>[] = [];

        for (const file of files) {
            let subLoader = subLoaders[file];
            if (!subLoader) {
                subLoader = new this.subLoaderConstructor(path.join(this.folder, file));
                subLoader.onProgress(e => this.onProgressEmitter.fire(e));
            }

            fileResultPromises.push(subLoader.load(force));
            newSubLoaders[file] = subLoader;
        }

        this.subLoaders = newSubLoaders;

        return this.mergeFiles(await Promise.all(fileResultPromises), force);
    }

    protected abstract mergeFiles(fileResults: LoadResult<TFile, EFile>[], force: boolean): Promise<LoadResult<T, E>>;
}

export abstract class SchemaFileLoader<T, R=HOIPartial<T> | undefined> extends FileLoader<R> {
    constructor(file: string, private schema: SchemaDef<T>) {
        super(file);
    }

    protected async loadFromFile(force: boolean): Promise<LoadResultOD<R>> {
        let result: HOIPartial<T> | undefined = undefined;
        try {
            result = await readFileFromModOrHOI4AsJson<T>(this.file, this.schema);
        } catch(e) {
            error(e);
        }

        return {
            result: this.postLoad(result),
        };
    }

    protected abstract postLoad(fileData: HOIPartial<T> | undefined): R;
}

export function mergeInLoadResult<K extends string, T extends { [k in K]: any[] }>(loadResults: T[], key: K): T[K] {
    return loadResults.reduce<T[K]>((p, c) => (p as any).concat(c[key]), [] as unknown as T[K]);
}
