import { Uri } from 'vscode';
import { IndexType } from './indexmanager';
import { sendEvent } from '../util/telemetry';

export abstract class IndexBase<T> {
    protected _globalIndex: Record<string, T> = {};
    protected _workspaceIndex: Record<string, T> = {};

    public abstract type: IndexType;
    public abstract includesFile(file: Uri): boolean;
    public abstract addWorkspaceIndex(file: Uri): void;
    public abstract removeWorkspaceIndex(file: Uri): void;
    public abstract buildIndex(index: Record<string, T>, estimatedSize: [number], options: { mod?: boolean; hoi4?: boolean; dlc?: boolean }): Promise<void>;
    
    public async buildGlobalIndex(): Promise<void> {
        const estimatedSize: [number] = [0];

        const options = { mod: false, dlc: false };
        await this.buildIndex(this._globalIndex, estimatedSize, options);

        // Prefer DLC files over base game files
        const optionsDlc = { mod: false, hoi4: false };
        await this.buildIndex(this._globalIndex, estimatedSize, optionsDlc);

        sendEvent(`index.${this.type}.global`, { size: estimatedSize[0].toString() });
    }

    public async buildWorkspaceIndex(): Promise<void> {
        const estimatedSize: [number] = [0];

        const options = { hoi4: false, dlc: false };
        await this.buildIndex(this._workspaceIndex, estimatedSize, options);

        sendEvent(`index.${this.type}.workspace`, { size: estimatedSize[0].toString() });
    }
    
    public clearIndex(): void {
        this._globalIndex = {};
        this._workspaceIndex = {};
    }

    public get(key: string): T | undefined {
        return this._workspaceIndex[key] ?? this._globalIndex[key];
    }
}
