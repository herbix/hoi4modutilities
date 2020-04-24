import * as vscode from 'vscode';
import * as path from 'path';
import { debounce } from 'lodash';
import { PreviewProviderDef } from './previewProviderDef';
import { focusTreePreviewDef } from './previewdef/focustree';
import { localize } from './util/i18n';
import { gfxPreviewDef } from './previewdef/gfx';
import { PreviewWebviewType, ShouldHideHoi4PreviewContextName } from './constants';
import { technologyPreviewDef } from './previewdef/technology';
import { arrayToMap, matchPathEnd } from './util/common';

interface PreviewMeta {
    uri: vscode.Uri;
    panel: vscode.WebviewPanel;
    previewProvider: PreviewProviderDef;
    debouncedUpdateMethod(document: vscode.TextDocument, panel: vscode.WebviewPanel): void;
}

class PreviewManager implements vscode.WebviewPanelSerializer {
    private _previews: Record<string, PreviewMeta> = {};

    private _previewProviders: PreviewProviderDef[] = [ focusTreePreviewDef, gfxPreviewDef, technologyPreviewDef ];
    private _previewProvidersMap: Record<string, PreviewProviderDef> = arrayToMap(this._previewProviders, 'type');

    private _updateSubscriptions: Map<string[], PreviewMeta[]> = new Map();
    private _cachedDebounceUpdateBySubscriptions: Record<string, () => void> = {};

    public showPreview(uri?: vscode.Uri): Promise<void> {
        return this.showPreviewImpl(uri);
    }

	public onCloseTextDocument(document: vscode.TextDocument): void {
        const key = document.uri.toString();
        this._previews[key]?.panel.dispose();
    }
    
	public onChangeTextDocument(e: vscode.TextDocumentChangeEvent): void {
        const document = e.document;
        const key = document.uri.toString();
        const preview = this._previews[key];
        if (preview !== undefined) {
            preview.debouncedUpdateMethod(document, preview.panel);
        }

        this.updatePreviewItemsInSubscription(document.uri);
    }

    public onChangeActiveTextEditor(textEditor: vscode.TextEditor | undefined): void {
        let shouldShowPreviewButton = false;
        if (textEditor) {
            if (this.findPreviewProvider(textEditor.document)) {
                shouldShowPreviewButton = true;
            }
        }

        vscode.commands.executeCommand('setContext', ShouldHideHoi4PreviewContextName, !shouldShowPreviewButton);
    }

    public async deserializeWebviewPanel(panel: vscode.WebviewPanel, state: any): Promise<void> {
        const uriStr = state?.uri as string | undefined;
        if (!uriStr) {
            panel.dispose();
            return;
        }

        try {
            const uri = vscode.Uri.parse(uriStr, true);
            await vscode.workspace.openTextDocument(uri);
            await this.showPreviewImpl(uri, panel);
        } catch (e) {
            console.error(e);
            panel.dispose();
        }
    }

    private async showPreviewImpl(requestUri?: vscode.Uri, panel?: vscode.WebviewPanel): Promise<void> {
        let document: vscode.TextDocument | undefined;
        if (requestUri === undefined) {
            document = vscode.window.activeTextEditor?.document;
        } else {
            document = this.getDocumentByUri(requestUri);
        }

        if (document === undefined) {
            if (requestUri === undefined) {
                vscode.window.showErrorMessage(localize('preview.noactivedoc', "No active document."));
            } else {
                vscode.window.showErrorMessage(localize('preview.cantfinddoc', "Can't find opened document {0}.", requestUri?.fsPath));
            }
            panel?.dispose();
            return;
        }

        const uri = document.uri;
        const key = uri.toString();
        if (key in this._previews) {
            this._previews[key].panel.reveal();
            panel?.dispose();
            return;
        }

        const previewProvider = this.findPreviewProvider(document);
        if (!previewProvider) {
            vscode.window.showInformationMessage(
                localize('preview.cantpreviewfile', "Can't preview this file.\nValid types: {0}.", Object.keys(this._previewProvidersMap).join(', ')));
            panel?.dispose();
            return;
        }

		const filename = path.basename(uri.path);
		panel = panel ?? vscode.window.createWebviewPanel(
            PreviewWebviewType,
            localize('preview.viewtitle', "HOI4: {0}", filename),
			vscode.ViewColumn.Two,
			{
                enableScripts: true
            }
        );

        const previewItem: PreviewMeta = {
            panel,
            uri,
            previewProvider,
            debouncedUpdateMethod: debounce((d, p) => {
                previewProvider.update(d, p, d);
            }, 1000, { trailing: true })
        };
        this._previews[key] = previewItem;
        this.addPreviewToSubscription(previewItem);

        panel.onDidDispose(() => {
            const preview = this._previews[key];
            if (preview) {
                if (preview.previewProvider.dispose) {
                    const document = this.getDocumentByUri(uri);
                    preview.previewProvider.dispose(document, preview.panel);
                }

                this.removePreviewFromSubscription(preview);
                delete this._previews[key];
            }
        });

        panel.webview.onDidReceiveMessage((msg) => {
            if (msg.command === 'navigate' && msg.start !== undefined) {
                const document = this.getDocumentByUri(uri);
                if (document === undefined) {
                    return;
                }

                vscode.window.showTextDocument(uri, {
                    selection: new vscode.Range(document.positionAt(msg.start), document.positionAt(msg.end)),
                    viewColumn: vscode.ViewColumn.One
                });
            }
        });

        previewProvider.show(document, panel);
    }

    private findPreviewProvider(document: vscode.TextDocument): PreviewProviderDef | undefined {
        for (const provider of this._previewProviders) {
            if (provider.canPreview(document)) {
                return provider;
            }
        }

        return undefined;
    }

    private getDocumentByUri(uri: vscode.Uri): vscode.TextDocument | undefined {
        return vscode.workspace.textDocuments.find(document => document.uri.toString() === uri.toString());
    }

    private addPreviewToSubscription(previewItem: PreviewMeta): void {
        if (!previewItem.previewProvider.updateWhenChange) {
            return;
        }

        for (const matchString of previewItem.previewProvider.updateWhenChange) {
            const subscriptions = this._updateSubscriptions.get(matchString);
            if (subscriptions) {
                subscriptions.push(previewItem);
            } else {
                this._updateSubscriptions.set(matchString, [ previewItem ]);
            }
        }
    }

    private removePreviewFromSubscription(previewItem: PreviewMeta): void {
        if (!previewItem.previewProvider.updateWhenChange) {
            return;
        }

        for (const matchString of previewItem.previewProvider.updateWhenChange) {
            const subscriptions = this._updateSubscriptions.get(matchString);
            if (subscriptions) {
                const newSubscriptions = subscriptions.filter(v => v !== previewItem);
                if (newSubscriptions.length === 0) {
                    this._updateSubscriptions.delete(matchString);
                } else {
                    this._updateSubscriptions.set(matchString, newSubscriptions);
                }
            }
        }
    }

    private getPreviewItemsNeedsUpdate(path: string): PreviewMeta[] {
        const result = [];
        for (const [ matchString, previewItems ] of this._updateSubscriptions.entries()) {
            if (matchPathEnd(path, matchString)) {
                result.push(...previewItems);
            }
        }

        return result;
    }

    private updatePreviewItemsInSubscription(uri: vscode.Uri): void {
        const path = uri.fsPath;
        const method = this._cachedDebounceUpdateBySubscriptions[path];
        if (method) {
            return method();
        }

        const newMethod = debounce(() => {
            delete this._cachedDebounceUpdateBySubscriptions[path];
            const document = this.getDocumentByUri(uri);
            if (document) {
                for (const otherPreview of this.getPreviewItemsNeedsUpdate(path)) {
                    const otherDocument = this.getDocumentByUri(otherPreview.uri);
                    if (otherDocument) {
                        otherPreview.previewProvider.update(otherDocument, otherPreview.panel, document);
                    }
                }
            }
        }, 1000, { trailing: true });
        this._cachedDebounceUpdateBySubscriptions[path] = newMethod;
        newMethod();
    }
}

export const previewManager = new PreviewManager();
