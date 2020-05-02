import * as vscode from 'vscode';
import { localize } from '../util/i18n';
import { error, debug } from '../util/debug';
import { getDocumentByUri } from '../util/common';
import { getFilePathFromModOrHOI4, readFileFromPath } from '../util/fileloader';

export interface PreviewDependency {
    gfx: string[];
    gui: string[];
    [other: string]: string[];
}

export const emptyPreviewDependency: PreviewDependency = {
    gfx: [],
    gui: [],
};

export abstract class PreviewBase {
    private cachedDependencies: PreviewDependency | undefined = undefined;

    private dependencyChangedEmitter = new vscode.EventEmitter<PreviewDependency>();
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
        const dependencies = await this.getDependencies(document);
        if (this.cachedDependencies === undefined || !PreviewBase.depencencyEqual(this.cachedDependencies, dependencies)) {
            this.dependencyChangedEmitter.fire(dependencies);
            debug("dependencies: ", document.uri.fsPath, JSON.stringify(dependencies));
        }

        this.cachedDependencies = dependencies;
        try {
            await this.updateWebviewContent(document, dependencies);
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

    public getDependencies(document: vscode.TextDocument | undefined): Promise<PreviewDependency> {
        return PreviewBase.getDependenciesFromDocument(document?.uri.fsPath ?? '', document?.getText(), this.getInitialDependencies());
    }

    protected getInitialDependencies(): PreviewDependency {
        return { gfx: [], gui: [] };
    }

    protected async updateWebviewContent(document: vscode.TextDocument, dependencies: PreviewDependency): Promise<void> {
        this.panel.webview.html = await this.getContent(document, dependencies);
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

    protected abstract getContent(document: vscode.TextDocument, dependencies: PreviewDependency): Promise<string>;

    private static depencencyEqual(a: PreviewDependency, b: PreviewDependency): boolean {
        return a !== b && Object.entries(a).every(([k, v]) => {
            const k2 = k as keyof PreviewDependency;
            const v1 = v as string[];
            const v2 = b[k2];
            return v1.length === v2.length && v1.every((i1, i) => i1 === v2[i]);
        });
    }

    private static async getDependenciesFromDocument(path: string, text: string | undefined, initialDependencies: PreviewDependency): Promise<PreviewDependency> {
        const result: PreviewDependency = initialDependencies;
        if (!text) {
            return result;
        }

        const accessed: Record<string, true> = {};
        const pending: string[] = [ 'start?' + path ];

        while (pending.length > 0) {
            const newPath = pending.shift()!;
            if (accessed[newPath]) {
                continue;
            }

            accessed[newPath] = true;
            try {
                const isStart = newPath === 'start?' + path;
                const content = isStart ? text : (await readFileFromPath(newPath))[0].toString();
                const relativePaths = PreviewBase.getDependencyFromText(content, result);
                if (isStart) {
                    relativePaths.push(...initialDependencies.gui);
                }

                const filteredRelativePaths = relativePaths.filter(v => !v.endsWith('.gfx'));
                pending.push(...(await Promise.all(filteredRelativePaths.map(p => getFilePathFromModOrHOI4(p)))).filter((p): p is string => p !== undefined));
            } catch (e) {
                error(e);
            }
        }

        Object.keys(result).forEach(k => result[k] = result[k].filter((v, i, a) => i === a.indexOf(v)));

        return result;
    }

    private static getDependencyFromText(text: string, result: PreviewDependency): string[] {
        const paths: string[] = [];
        const regex = /^\s*#!(?<type>gfx|gui):(?<path>.*\.(?<ext>gfx|gui))$/gm;
        let match = regex.exec(text);
        while (match) {
            const type = match.groups?.type as keyof PreviewDependency;
            const ext = match.groups?.ext!;
            if (type !== ext) {
                match = regex.exec(text);
                continue;
            }
            
            const path = match.groups?.path!;
            const pathValue = path.trim().replace(/\/\/+|\\+/g, '/');
            if (type === 'gui') {
                const gfxPathValue = path.trim().replace(/\.gui$/, '.gfx').replace(/\/\/+|\\+/g, '/');
                result.gfx.push(gfxPathValue);
            }

            paths.push(pathValue);
            result[type].push(pathValue);
            match = regex.exec(text);
        }

        return paths;
    }
}
