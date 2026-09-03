import * as vscode from 'vscode';
import { IndexType } from './indexmanager';
import { sendEvent } from '../util/telemetry';
import { contextContainer } from '../context';
import { getFilePathFromModOrHOI4 } from '../util/fileloader';
import { dirUri, getLastModifiedAsync, mkdirs, readFile, writeFile } from '../util/vsccommon';
import { createStopwatch, debug } from '../util/debug';

export abstract class IndexBase<T> {
    protected readonly globalIndex: Map<string, T> = new Map();
    protected readonly workspaceIndex: Map<string, T> = new Map();

    public abstract type: IndexType;
    public abstract includesFile(file: vscode.Uri): boolean;
    public abstract addWorkspaceIndex(file: vscode.Uri): void;
    public abstract removeWorkspaceIndex(file: vscode.Uri): void;
    protected abstract buildIndex(index: Map<string, T>, estimatedSize: [number], options: { mod?: boolean; hoi4?: boolean; dlc?: boolean }): Promise<void>;
    protected abstract getFiles(options: { mod?: boolean; hoi4?: boolean; dlc?: boolean }): Promise<string[]>;
    protected abstract validateIndexValue(value: unknown): value is T;

    public register(indexUpdatedEventEmitter: vscode.EventEmitter<void>): vscode.Disposable {
        return vscode.Disposable.from();
    }

    public async buildGlobalIndex(): Promise<void> {
        const stopwatch = createStopwatch();
        const cachedLastModified = await this.getCachedGlobalIndexLastModified();
        if (cachedLastModified !== undefined) {
            const mostRecent = await this.mostRecentlyChangedFileInGlobalIndex();
            if (cachedLastModified >= mostRecent) {
                try {
                    await this.loadCachedGlobalIndex();
                    sendEvent(`index.${this.type}.global`, { cached: 'true', elapsedTime: stopwatch.getElapsed().toString() });
                    return;
                } catch (e) {
                    debug(`Failed to load cached global index for ${this.type}: ${e}`);
                    this.globalIndex.clear();
                }
            }
        }

        const estimatedSize: [number] = [0];

        const options = { mod: false, dlc: false };
        await this.buildIndex(this.globalIndex, estimatedSize, options);

        // Prefer DLC files over base game files
        const optionsDlc = { mod: false, hoi4: false };
        await this.buildIndex(this.globalIndex, estimatedSize, optionsDlc);

        await this.saveCachedGlobalIndex();

        sendEvent(`index.${this.type}.global`, { size: estimatedSize[0].toString(), elapsedTime: stopwatch.getElapsed().toString() });
    }

    public async buildWorkspaceIndex(): Promise<void> {
        const stopwatch = createStopwatch();
        const estimatedSize: [number] = [0];

        const options = { hoi4: false, dlc: false };
        await this.buildIndex(this.workspaceIndex, estimatedSize, options);

        sendEvent(`index.${this.type}.workspace`, { size: estimatedSize[0].toString(), elapsedTime: stopwatch.getElapsed().toString() });
    }

    public clearIndex(): void {
        this.globalIndex.clear();
        this.workspaceIndex.clear();
    }

    public get(key: string): T | undefined {
        return this.workspaceIndex.get(key) ?? this.globalIndex.get(key);
    }

    private async mostRecentlyChangedFileInGlobalIndex(): Promise<number> {
        const option = { hoi4: true, dlc: true, mod: false };
        const files = await this.getFiles(option);
        const times = await Promise.all(files.map(async (f) => {
            const realPath = await getFilePathFromModOrHOI4(f, option);
            if (!realPath) {
                return undefined;
            }
            return getLastModifiedAsync(realPath);
        }));
        return times.filter((t): t is number => t !== undefined).reduce((a, b) => Math.max(a, b), 0);
    }

    private async getCachedGlobalIndexLastModified(): Promise<number | undefined> {
        const cachedIndexUri = this.getCachedGlobalIndexUri();
        if (!cachedIndexUri) {
            return undefined;
        }

        try {
            return await getLastModifiedAsync(cachedIndexUri);
        } catch (_) {
            return undefined;
        }
    }

    private async loadCachedGlobalIndex(): Promise<void> {
        const cachedIndexUri = this.getCachedGlobalIndexUri();
        if (!cachedIndexUri) {
            return;
        }

        const entries: unknown = JSON.parse((await readFile(cachedIndexUri)).toString());
        if (!Array.isArray(entries) || entries.some(entry =>
            !Array.isArray(entry) || entry.length !== 2 ||
            typeof entry[0] !== 'string' || !this.validateIndexValue(entry[1]))) {
            throw new Error('Invalid cached global index');
        }
        this.globalIndex.clear();
        for (const [key, value] of entries as [string, T][]) {
            this.globalIndex.set(key, value);
        }
    }

    private async saveCachedGlobalIndex(): Promise<void> {
        const cachedIndexUri = this.getCachedGlobalIndexUri();
        if (!cachedIndexUri) {
            return;
        }

        await mkdirs(dirUri(cachedIndexUri));
        await writeFile(cachedIndexUri, Buffer.from(JSON.stringify([...this.globalIndex])));
    }

    private getCachedGlobalIndexUri(): vscode.Uri | undefined {
        const globalStorageUri = contextContainer.current?.globalStorageUri;
        return globalStorageUri && vscode.Uri.joinPath(globalStorageUri, 'index', `${this.type}.json`);
    }
}
