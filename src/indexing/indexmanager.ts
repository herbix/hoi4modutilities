import * as vscode from 'vscode';
import { arrayToMap, debounceByInput } from '../util/common';
import { IndexBase } from './indexbase';
import { localize } from '../util/i18n';
import { gfxIndex } from './gfxindex';
import { ConfigurationKey } from '../constants';
import { getConfiguration } from '../util/vsccommon';
import { sharedFocusIndex } from './sharedfocusindex';

export type IndexType = 'gfx' | 'sharedfocus' | 'localisation';

class IndexManager {
    private _indices: IndexBase<unknown>[] = [
        gfxIndex,
        sharedFocusIndex,
    ];
    private _indexMap: Record<IndexType, IndexBase<unknown>> = arrayToMap(this._indices, 'type');
    private _indexInitializedEventEmitter = new vscode.EventEmitter<void>();
    private _enabledIndexTypes: IndexType[] = getConfiguration().indexing;

    public onInitialized = this._indexInitializedEventEmitter.event;

    public register(): vscode.Disposable {
        const disposables: vscode.Disposable[] = [];
        const task = this.buildAllIndex();
        vscode.window.setStatusBarMessage('$(loading~spin) ' + localize('TODO', 'Building index...'), task);
        task.then(() => {
            vscode.window.showInformationMessage(localize('TODO', 'Building index done.'));
            this._indexInitializedEventEmitter.fire();
        });
        disposables.push(vscode.workspace.onDidChangeWorkspaceFolders(this.onChangeWorkspaceFolders, this));
        disposables.push(vscode.workspace.onDidChangeTextDocument(this.onChangeTextDocument, this));
        disposables.push(vscode.workspace.onDidCloseTextDocument(this.onCloseTextDocument, this));
        disposables.push(vscode.workspace.onDidCreateFiles(this.onCreateFiles, this));
        disposables.push(vscode.workspace.onDidDeleteFiles(this.onDeleteFiles, this));
        disposables.push(vscode.workspace.onDidRenameFiles(this.onRenameFiles, this));
        disposables.push(vscode.workspace.onDidChangeConfiguration(this.onChangeConfiguration, this));
        disposables.push(this._indexInitializedEventEmitter);
        
        return vscode.Disposable.from(...disposables);
    }

    private onChangeWorkspaceFolders(_: vscode.WorkspaceFoldersChangeEvent): void {
        const task = this.buildWorkspaceIndex();
        vscode.window.setStatusBarMessage('$(loading~spin) ' + localize('TODO', 'Building workspace index...'), task);
        task.then(() => {
            vscode.window.showInformationMessage(localize('TODO', 'Building workspace index done.'));
            this._indexInitializedEventEmitter.fire();
        });
    }

    private onChangeTextDocument(e: vscode.TextDocumentChangeEvent): void {
        this.onChangeTextDocumentImpl(e.document.uri);
    }
    
    private onChangeTextDocumentImpl = debounceByInput(
        (file: vscode.Uri) => {
            for (const index of this._indices) {
                if (index.includesFile(file)) {
                    index.removeWorkspaceIndex(file);
                    index.addWorkspaceIndex(file);
                }
            }
        },
        file => file.toString(),
        1000,
        { trailing: true }
    );

    private onCloseTextDocument(e: vscode.TextDocument): void {
        for (const index of this._indices) {
            if (index.includesFile(e.uri)) {
                index.removeWorkspaceIndex(e.uri);
                index.addWorkspaceIndex(e.uri);
            }
        }
    }

    private onCreateFiles(e: vscode.FileCreateEvent): void {
        for (const index of this._indices) {
            for (const file of e.files) {
                if (index.includesFile(file)) {
                    index.addWorkspaceIndex(file);
                }
            }
        }
    }

    private onDeleteFiles(e: vscode.FileDeleteEvent): void {
        for (const index of this._indices) {
            for (const file of e.files) {
                if (index.includesFile(file)) {
                    index.removeWorkspaceIndex(file);
                }
            }
        }
    }

    private onRenameFiles(e: vscode.FileRenameEvent): void {
        for (const index of this._indices) {
            for (const { oldUri, newUri } of e.files) {
                if (index.includesFile(oldUri)) {
                    index.removeWorkspaceIndex(oldUri);
                }
                if (index.includesFile(newUri)) {
                    index.addWorkspaceIndex(newUri);
                }
            }
        }
    }

    private onChangeConfiguration(e: vscode.ConfigurationChangeEvent): void {
        if (e.affectsConfiguration(`${ConfigurationKey}.indexing`)) {
            const previousEnabledIndexTypes = this._enabledIndexTypes;
            this._enabledIndexTypes = [...getConfiguration().indexing];
            const task = this.buildAllIndex(previousEnabledIndexTypes);
            vscode.window.setStatusBarMessage('$(loading~spin) ' + localize('TODO', 'Building index...'), task);
            task.then(() => {
                vscode.window.showInformationMessage(localize('TODO', 'Building index done.'));
                this._indexInitializedEventEmitter.fire();
            });
        }
    }

    private async buildAllIndex(previousEnabledIndexTypes: IndexType[] = []): Promise<void> {
        const tasks: Promise<void>[] = [];
        for (const index of this._indices) {
            if (previousEnabledIndexTypes.includes(index.type) === this._enabledIndexTypes.includes(index.type)) {
                continue;
            }
            index.clearIndex();
            if (this._enabledIndexTypes.includes(index.type)) {
                tasks.push(index.buildGlobalIndex());
                tasks.push(index.buildWorkspaceIndex());
            }
        }
        await Promise.all(tasks);
    }

    private async buildWorkspaceIndex(): Promise<void> {
        const tasks: Promise<void>[] = [];
        for (const index of this._indices) {
            if (this._enabledIndexTypes.includes(index.type)) {
                tasks.push(index.buildWorkspaceIndex());
            }
        }
        await Promise.all(tasks);
    }
}

export const indexManager = new IndexManager();
