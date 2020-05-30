import * as vscode from 'vscode';
import { localize } from '../util/i18n';
import { error, debug } from '../util/debug';
import { getDocumentByUri } from '../util/vsccommon';
import { isEqual } from 'lodash';

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

                vscode.window.showTextDocument(this.uri, {
                    selection: new vscode.Range(document.positionAt(msg.start), document.positionAt(msg.end)),
                    viewColumn: vscode.ViewColumn.One
                });
            }
        });
        
        panel.onDidDispose(() => {
            this.dispose();
        });
    }
    
    protected updateDependencies(dependencies: string[]): void {
        if (this.cachedDependencies === undefined || !isEqual(this.cachedDependencies, dependencies)) {
            this.dependencyChangedEmitter.fire(dependencies);
            debug("dependencies: ", this.uri.fsPath, JSON.stringify(dependencies));
        }

        this.cachedDependencies = dependencies;
    }

    protected abstract getContent(document: vscode.TextDocument): Promise<string>;
}
