import * as vscode from 'vscode';
import * as path from 'path';;
import { hoiFileExpiryToken, listFilesFromModOrHOI4, readFileFromModOrHOI4 } from '../fileloader';
import { error } from '../debug';
import { UserError } from '../common';
import { Dependency, getDependenciesFromText } from '../dependency';
import { sendEvent } from '../telemetry';
export { Dependency } from '../dependency';

export class LoaderSession {
    private loadedLoader: Set<Loader<unknown, unknown>> = new Set();
    private shouldLoaderReload: Map<Loader<unknown, unknown>, boolean | 'checking'> = new Map();
    private cachedLoader: Record<string, Loader<unknown, unknown>> = {};
    public loadingLoader: Loader<unknown, unknown>[] = [];

    constructor(public force: boolean, private cancelled?: () => boolean) {
    }

    public isLoaded(loader: Loader<unknown, unknown>): boolean {
        return this.loadedLoader.has(loader);
    }

    public setLoaded(loader: Loader<unknown, unknown>) {
        this.loadedLoader.add(loader);
    }

    public checkingShouldReload(loader: Loader<unknown, unknown>) {
        this.shouldLoaderReload.set(loader, 'checking');
    }

    public setShouldReload(loader: Loader<unknown, unknown>) {
        this.shouldLoaderReload.set(loader, true);
    }

    public clearShouldReload(loader: Loader<unknown, unknown>) {
        this.shouldLoaderReload.delete(loader);
    }

    public shouldReload(loader: Loader<unknown, unknown>): boolean | 'checking' {
        return this.shouldLoaderReload.get(loader) ?? false;
    }

    public createOrGetCachedLoader<R extends Loader<unknown, unknown>>(file: string, loaderType: { new (file: string): R }): R {
        const cachedLoader = this.cachedLoader[file];
        if (cachedLoader instanceof loaderType) {
            return cachedLoader;
        } else {
            const loader = this.cachedLoader[file] = new loaderType(file);
            return loader;
        }
    }

    public forChild(): LoaderSession {
        const clone = { ...this };
        clone.loadingLoader = [ ...this.loadingLoader ];
        Object.setPrototypeOf(clone, Object.getPrototypeOf(this));
        return clone;
    }

    public throwIfCancelled(): void {
        if (this.cancelled?.call(this)) {
            throw new UserError('Load session cancelled.');
        }
    }
}

export type LoadResult<T, E={}> = { result: T, dependencies: string[] } & E;
export type LoadResultOD<T, E={}> = Omit<LoadResult<T, E>, 'dependencies'> & Partial<Pick<LoadResult<T, E>, 'dependencies'>> & E;
export abstract class Loader<T, E = {}> {
    private cachedValue: LoadResult<T, E> | undefined;

    protected onProgressEmitter = new vscode.EventEmitter<string>();
    public onProgress = this.onProgressEmitter.event;
    protected onLoadDoneEmitter = new vscode.EventEmitter<LoadResult<T, E>>();
    public onLoadDone = this.onLoadDoneEmitter.event;

    private loadingPromise: Promise<LoadResult<T, E>> | undefined = undefined;

    public disableTelemetry = false;

    constructor() {
    }

    async load(session: LoaderSession): Promise<LoadResult<T, E>> {
        session = session.forChild();

        // Load each loader at most one time in one session
        if (this.cachedValue === undefined || (!session.isLoaded(this) && (session.force || await this.shouldReload(session)))) {
            const loadStartTime = Date.now();

            session.loadingLoader.push(this);
            try {
                this.beforeLoadImpl(session);
                if (this.loadingPromise === undefined) {
                    this.cachedValue = await (this.loadingPromise = this.loadImpl(session));
                } else {
                    this.cachedValue = await this.loadingPromise;
                }
                session.setLoaded(this);
            } finally {
                this.loadingPromise = undefined;
                if (session.loadingLoader.pop() !== this) {
                    throw new Error('loadingLoader corrupted.');
                }
            }

            const timeElapsed = Date.now() - loadStartTime;

            if (timeElapsed > 500 && !this.disableTelemetry) {
                sendEvent('loader.loaddone',
                    { loaderType: this.constructor.name },
                    { timeElapsed, ...this.extraMesurements(this.cachedValue) });
            }
        }

        this.onLoadDoneEmitter.fire(this.cachedValue);
        return this.cachedValue;
    };

    public async shouldReload(session: LoaderSession): Promise<boolean> {
        // Always return same value for shouldReload in one session
        const cachedShouldReload = session.shouldReload(this);
        if (cachedShouldReload === 'checking') {
            return false;
        }
        if (cachedShouldReload) {
            return true;
        }

        session.checkingShouldReload(this);
        const result = await this.shouldReloadImpl(session);
        if (result) {
            session.setShouldReload(this);
        } else {
            session.clearShouldReload(this);
        }

        return result;
    };

    protected shouldReloadImpl(session: LoaderSession): Promise<boolean> {
        return Promise.resolve(true);
    }

    protected beforeLoadImpl(session: LoaderSession): void {
    }

    protected async fireOnProgressEvent(progress: string): Promise<void> {
        this.onProgressEmitter.fire(progress);
        await new Promise(resolve => setTimeout(resolve, 0));
    }

    protected extraMesurements(result: LoadResult<T, E>): Record<string, number> {
        return {};
    };

    protected abstract loadImpl(session: LoaderSession): Promise<LoadResult<T, E>>;
}

export abstract class FileLoader<T, E={}> extends Loader<T, E> {
    private expiryToken: string = '';

    constructor(public file: string) {
        super();
    }

    public async shouldReloadImpl(session: LoaderSession): Promise<boolean> {
        return await hoiFileExpiryToken(this.file) !== this.expiryToken;
    }

    protected beforeLoadImpl(session: LoaderSession): void {
        checkLoaderSessionLoadingFile(session, this.file);
    }

    protected async loadImpl(session: LoaderSession): Promise<LoadResult<T, E>> {
        this.expiryToken = await hoiFileExpiryToken(this.file);

        const result = await this.loadFromFile(session);

        return {
            ...result,
            dependencies: result.dependencies ? result.dependencies : [this.file],
        };
    }

    protected abstract loadFromFile(session: LoaderSession): Promise<LoadResultOD<T, E>>;
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

    public async shouldReloadImpl(session: LoaderSession): Promise<boolean> {
        const files = await listFilesFromModOrHOI4(this.folder);
        if (this.fileCount !== files.length || files.some(f => !(f in this.subLoaders))) {
            return true;
        }

        return (await Promise.all(Object.values(this.subLoaders).map(l => l.shouldReload(session)))).some(v => v);
    }

    protected async loadImpl(session: LoaderSession): Promise<LoadResult<T, E>> {
        const files = await listFilesFromModOrHOI4(this.folder);
        this.fileCount = files.length;

        const subLoaders = this.subLoaders;
        const newSubLoaders: Record<string, FileLoader<TFile, EFile>> = {};
        const fileResultPromises: Promise<LoadResult<TFile, EFile>>[] = [];

        for (const file of files) {
            let subLoader = subLoaders[file];
            if (!subLoader) {
                subLoader = new this.subLoaderConstructor(path.join(this.folder, file));
                subLoader.disableTelemetry = true;
                subLoader.onProgress(e => this.onProgressEmitter.fire(e));
            }

            fileResultPromises.push(subLoader.load(session));
            newSubLoaders[file] = subLoader;
        }

        this.subLoaders = newSubLoaders;

        return this.mergeFiles(await Promise.all(fileResultPromises), session);
    }

    protected extraMesurements(result: LoadResult<T, E>) {
        return { ...super.extraMesurements(result), fileCount: this.fileCount };
    }

    protected abstract mergeFiles(fileResults: LoadResult<TFile, EFile>[], session: LoaderSession): Promise<LoadResult<T, E>>;
}

export abstract class ContentLoader<T, E={}> extends Loader<T, E> {
    private expiryToken: string = '';
    protected loaderDependencies = new LoaderDependencies();
    protected readDependency = true;

    constructor(public file: string, private contentProvider?: () => Promise<string>) {
        super();
    }

    public async shouldReloadImpl(session: LoaderSession): Promise<boolean> {
        if (this.contentProvider === undefined) {
            return await hoiFileExpiryToken(this.file) !== this.expiryToken || this.loaderDependencies.shouldReload(session);
        } else {
            return true;
        }
    }

    protected beforeLoadImpl(session: LoaderSession): void {
        checkLoaderSessionLoadingFile(session, this.file);
    }

    protected async loadImpl(session: LoaderSession): Promise<LoadResult<T, E>> {
        const dependencies: string[] = [this.file];

        if (this.contentProvider === undefined) {
            this.expiryToken = await hoiFileExpiryToken(this.file);
        }

        let content: string | undefined = undefined;
        let errorValue: any = undefined;
        try {
            content = this.contentProvider === undefined ?
                (await readFileFromModOrHOI4(this.file))[0].toString('utf-8').replace(/^\uFEFF/, '') :
                await this.contentProvider();
        } catch(e) {
            error(e);
            errorValue = e;
        }

        const dependenciesFromText = this.readDependency && content ? getDependenciesFromText(content) : [];
        const result = await this.postLoad(content, dependenciesFromText, errorValue, session);
        this.loaderDependencies.flip();

        return {
            ...result,
            dependencies: result.dependencies ? result.dependencies : dependencies,
        };
    }

    protected abstract postLoad(content: string | undefined, dependencies: Dependency[], error: any, session: LoaderSession): Promise<LoadResultOD<T, E>>;
}

type PromiseValue<P> = P extends Promise<infer K> ? K : P;
class LoaderDependencies {
    public current: Record<string, Loader<unknown, unknown>> = {};
    private newValues: Record<string, Loader<unknown, unknown>> = {};

    public async shouldReload(session: LoaderSession): Promise<boolean> {
        // Don't use Promise.all because it will cause infinite loop when there are circular dependencies.
        for (const loader of Object.values(this.current)) {
            if (await loader.shouldReload(session)) {
                return true;
            }
        }
        return false;
    }

    public getOrCreate<R extends Loader<unknown, unknown>>(key: string, factory: (key: string) => R, type: { new (...args: any[]): R }): R {
        const loader = this.current[key];
        if (loader && loader instanceof type) {
            this.newValues[key] = loader;
            return loader;
        } else {
            const newLoader = factory(key);
            this.newValues[key] = newLoader;
            return newLoader;
        }
    }

    public async loadMultiple<R extends Loader<unknown, unknown>>(dependencies: string[], session: LoaderSession, type: { new (...args: any[]): R }) {
        type Result = PromiseValue<ReturnType<R['load']>>;
        const loadDep = async (dep: string) => {
            try {
                const eventsDepLoader = this.getOrCreate(dep, k => session.createOrGetCachedLoader(k, type), type);
                return (await eventsDepLoader.load(session)) as PromiseValue<ReturnType<R['load']>>;
            } catch (e) {
                error(e);
                return undefined;
            }
        };

        // Don't use parallel loading because A -> B -> C will cause dead lock.
        //                                    |--> C -> B
        // return (await Promise.all(dependencies.map(loadDep))).filter((v): v is Result => !!v);
        const result: Result[] = [];
        for (const dependency of dependencies) {
            const value = await loadDep(dependency);
            if (value !== undefined) {
                result.push(value);
            }
        }

        return result;
    }

    public flip() {
        this.current = this.newValues;
        this.newValues = {};
    }
}

export function mergeInLoadResult<K extends string, T extends { [k in K]: any[] }>(loadResults: T[], key: K): T[K] {
    return loadResults.reduce<T[K]>((p, c) => (p as any).concat(c[key]), [] as unknown as T[K]);
}

function checkLoaderSessionLoadingFile(session: LoaderSession, file: string) {
    const length = session.loadingLoader.length - 1;
    for (let i = 0; i < length; i++) {
        const loader = session.loadingLoader[i];
        if ('file' in loader && (loader as any).file === file) {
            throw new UserError('Circular dependency when loading file. Loading loaders: ' + session.loadingLoader);
        }
    }
}
