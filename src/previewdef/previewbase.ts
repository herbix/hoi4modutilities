import * as vscode from 'vscode';
import { localize } from '../util/i18n';
import { error, debug } from '../util/debug';
import { getDocumentByUri, isFileScheme } from '../util/vsccommon';
import { isEqual } from 'lodash';
import { getFilePathFromMod, readFileFromModOrHOI4 } from '../util/fileloader';
import * as path from 'path';
import { mkdirs, writeFile, isSamePath } from '../util/nodecommon';
import { sendByMessage } from '../util/telemetry';

export abstract class PreviewBase {
    private cachedDependencies: string[] | undefined = undefined;

    private dependencyChangedEmitter = new vscode.EventEmitter<string[]>();
    public onDependencyChanged = this.dependencyChangedEmitter.event;

    private disposeEmitter = new vscode.EventEmitter<undefined>();
    public onDispose = this.disposeEmitter.event;

    private disposed = false;

    constructor(
        readonly uri: vscode.Uri,
        readonly panel: vscode.WebviewPanel,
    ) {
        this.registerEvents(panel);
    }

    public async onDocumentChange(document: vscode.TextDocument, changedDocument?: vscode.TextDocument): Promise<void> {
        try {
            this.panel.webview.html = await this.getContent(document);
        } catch(e) {
            error(e);
        }
    }
    
    public dispose(): void {
        this.dependencyChangedEmitter.dispose();
        this.disposed = true;
        this.disposeEmitter.fire();
        this.disposeEmitter.dispose();
    }

    public get isDisposed(): boolean {
        return this.disposed;
    }

    public async initializePanelContent(document: vscode.TextDocument): Promise<void> {
        this.panel.webview.html = localize('loading', 'Loading...');
        await this.onDocumentChange(document, document);
    }

    protected registerEvents(panel: vscode.WebviewPanel): void {
        panel.webview.onDidReceiveMessage((msg) => {
            if (msg.command === 'navigate' && msg.start !== undefined) {
                const document = getDocumentByUri(this.uri);
                if (document === undefined) {
                    return;
                }

                if (msg.file === undefined) {
                    vscode.window.showTextDocument(this.uri, {
                        selection: new vscode.Range(document.positionAt(msg.start), document.positionAt(msg.end)),
                        viewColumn: vscode.ViewColumn.One
                    });
                } else {
                    this.openOrCopyFile(msg.file, msg.start, msg.end);
                }
            } else if (msg.command === 'telemetry') {
                sendByMessage(msg);
            }
        });
        
        panel.onDidDispose(() => {
            this.dispose();
        });
    }
    
    protected updateDependencies(dependencies: string[]): void {
        if (this.cachedDependencies === undefined || !isEqual(this.cachedDependencies, dependencies)) {
            this.dependencyChangedEmitter.fire(dependencies);
            debug("dependencies: ", this.uri.toString(), JSON.stringify(dependencies));
        }

        this.cachedDependencies = dependencies;
    }

    protected async openOrCopyFile(file: string, start: number | undefined, end: number | undefined): Promise<void> {
        const filePathInMod = await getFilePathFromMod(file);
        if (filePathInMod !== undefined) {
            const filePathInModWithoutOpened = filePathInMod.replace('opened?', '');
            const document = vscode.workspace.textDocuments.find(d => isFileScheme(d.uri) && isSamePath(d.uri.fsPath, filePathInModWithoutOpened))
                ?? await vscode.workspace.openTextDocument(filePathInModWithoutOpened);
            await vscode.window.showTextDocument(document, {
                selection: start !== undefined && end !== undefined ? new vscode.Range(document.positionAt(start), document.positionAt(end)) : undefined,
                viewColumn: vscode.ViewColumn.One,
            });
            return;
        }
        
        if (!vscode.workspace.workspaceFolders?.length) {
            await vscode.window.showErrorMessage(localize('preview.mustopenafolder', 'Must open a folder before opening "{0}".', file));
            return;
        }

        let targetFolderUri = vscode.workspace.workspaceFolders[0].uri;
        if (vscode.workspace.workspaceFolders.length >= 1) {
            const folder = await vscode.window.showWorkspaceFolderPick({ placeHolder: localize('preview.selectafolder', 'Select a folder to copy "{0}"', file) });
            if (!folder) {
                return;
            }

            targetFolderUri = folder.uri;
        }

        if (!isFileScheme(targetFolderUri)) {
            await vscode.window.showErrorMessage(localize('preview.selectedfoldernotondisk', 'Selected target folder is not on disk: "{0}".', targetFolderUri.toString()));
            return;
        }

        try {
            const targetFolder = targetFolderUri.fsPath;
            const [buffer] = await readFileFromModOrHOI4(file);
            const targetPath = path.join(targetFolder, file);
            await mkdirs(path.dirname(targetPath));
            await writeFile(targetPath, buffer);

            const document = await vscode.workspace.openTextDocument(targetPath);
            await vscode.window.showTextDocument(document, {
                selection: start !== undefined && end !== undefined ? new vscode.Range(document.positionAt(start), document.positionAt(end)) : undefined,
                viewColumn: vscode.ViewColumn.One,
            });

        } catch (e) {
            await vscode.window.showErrorMessage(localize('preview.failedtoopen', 'Failed to open file "{0}": {1}.', file, e.toString()));
        }
    }

    protected abstract getContent(document: vscode.TextDocument): Promise<string>;
}
