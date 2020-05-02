import * as vscode from 'vscode';
import * as path from 'path';
import { focusTreePreviewDef } from './focustree';
import { localize } from '../util/i18n';
import { gfxPreviewDef } from './gfx';
import { PreviewWebviewType, ShouldHideHoi4PreviewContextName } from '../constants';
import { technologyPreviewDef } from './technology';
import { arrayToMap, matchPathEnd, debounceByInput, getDocumentByUri } from '../util/common';
import { debug, error } from '../util/debug';
import { PreviewBase, PreviewDependency } from './previewbase';
import { contextContainer } from '../context';

export interface PreviewProviderDef {
    type: string;
    canPreview(document: vscode.TextDocument): boolean;
    previewContructor: new (uri: vscode.Uri, panel: vscode.WebviewPanel) => PreviewBase;
}

export class PreviewManager implements vscode.WebviewPanelSerializer {
    private _previews: Record<string, PreviewBase> = {};

    private _previewProviders: PreviewProviderDef[] = [ focusTreePreviewDef, gfxPreviewDef, technologyPreviewDef ];
    private _previewProvidersMap: Record<string, PreviewProviderDef> = arrayToMap(this._previewProviders, 'type');

    private _updateSubscriptions: Map<string[], PreviewBase[]> = new Map();

    public showPreview(uri?: vscode.Uri): Promise<void> {
        return this.showPreviewImpl(uri);
    }

	public onCloseTextDocument(document: vscode.TextDocument): void {
        const key = document.uri.toString();
        this._previews[key]?.panel.dispose();
        debug(`dispose panel ${key} because text document closed`);
        this.updatePreviewItemsInSubscription(document.uri);
    }
    
	public onChangeTextDocument(e: vscode.TextDocumentChangeEvent): void {
        const document = e.document;
        const key = document.uri.toString();
        const preview = this._previews[key];
        if (preview !== undefined) {
            this.updatePreviewItem(preview, document);
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
            debug(`dispose panel ??? because uri not exist`);
            return;
        }

        try {
            const uri = vscode.Uri.parse(uriStr, true);
            await vscode.workspace.openTextDocument(uri);
            await this.showPreviewImpl(uri, panel);
        } catch (e) {
            error(e);
            panel.dispose();
            debug(`dispose panel ${uriStr} because reopen error`);
        }
    }

    private async showPreviewImpl(requestUri?: vscode.Uri, panel?: vscode.WebviewPanel): Promise<void> {
        let document: vscode.TextDocument | undefined;
        if (requestUri === undefined) {
            document = vscode.window.activeTextEditor?.document;
        } else {
            document = getDocumentByUri(requestUri);
        }

        if (document === undefined) {
            if (requestUri === undefined) {
                vscode.window.showErrorMessage(localize('preview.noactivedoc', "No active document."));
            } else {
                vscode.window.showErrorMessage(localize('preview.cantfinddoc', "Can't find opened document {0}.", requestUri?.fsPath));
            }
            panel?.dispose();
            debug(`dispose panel ${requestUri} because document not opened`);
            return;
        }

        const uri = document.uri;
        const key = uri.toString();
        if (key in this._previews) {
            this._previews[key].panel.reveal();
            panel?.dispose();
            debug(`dispose panel ${uri} because preview already open`);
            return;
        }

        const previewProvider = this.findPreviewProvider(document);
        if (!previewProvider) {
            vscode.window.showInformationMessage(
                localize('preview.cantpreviewfile', "Can't preview this file.\nValid types: {0}.", Object.keys(this._previewProvidersMap).join(', ')));
            panel?.dispose();
            debug(`dispose panel ${uri} because no preview provider`);
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

        if (contextContainer.current) {
            panel.iconPath = {
                light: vscode.Uri.file(contextContainer.current.asAbsolutePath('static/preview-right-light.svg')),
                dark: vscode.Uri.file(contextContainer.current.asAbsolutePath('static/preview-right-dark.svg')),
            };
        }

        const previewItem = new previewProvider.previewContructor(uri, panel);
        this._previews[key] = previewItem;

        previewItem.onDispose(() => {
            const preview = this._previews[key];
            if (preview) {
                this.removePreviewFromSubscription(preview);
                delete this._previews[key];
            }
        });

        previewItem.onDependencyChanged((newDep) => {
            this.removePreviewFromSubscription(previewItem);
            this.addPreviewToSubscription(previewItem, newDep);
        });

        previewItem.initializePanelContent(document);
    }

    private findPreviewProvider(document: vscode.TextDocument): PreviewProviderDef | undefined {
        for (const provider of this._previewProviders) {
            if (provider.canPreview(document)) {
                return provider;
            }
        }

        return undefined;
    }

    private addPreviewToSubscription(previewItem: PreviewBase, dependency: PreviewDependency): void {
        const matchStrings = Object.values(dependency)
            .map((dl: string[]) => dl.map(d => d.split('/').filter(v => v)))
            .reduce<string[][]>((p, c) => p.concat(c), []);

        for (const matchString of matchStrings) {
            const subscriptions = this._updateSubscriptions.get(matchString);
            if (subscriptions) {
                subscriptions.push(previewItem);
            } else {
                this._updateSubscriptions.set(matchString, [ previewItem ]);
            }
        }
    }

    private removePreviewFromSubscription(previewItem: PreviewBase): void {
        for (const [matchString, subscriptions] of this._updateSubscriptions.entries()) {
            if (subscriptions.includes(previewItem)) {
                const newSubscriptions = subscriptions.filter(v => v !== previewItem);
                if (newSubscriptions.length === 0) {
                    this._updateSubscriptions.delete(matchString);
                } else {
                    this._updateSubscriptions.set(matchString, newSubscriptions);
                }
            }
        }
    }

    private getPreviewItemsNeedsUpdate(path: string): PreviewBase[] {
        const result: PreviewBase[] = [];
        for (const [ matchString, previewItems ] of this._updateSubscriptions.entries()) {
            if (matchPathEnd(path, matchString)) {
                result.push(...previewItems);
            }
        }

        return result;
    }

    private updatePreviewItemsInSubscription = debounceByInput(
        (uri: vscode.Uri): void => {
            const document = getDocumentByUri(uri);
            for (const otherPreview of this.getPreviewItemsNeedsUpdate(uri.fsPath)) {
                const otherDocument = getDocumentByUri(otherPreview.uri);
                if (otherDocument) {
                    otherPreview.onDocumentChange(otherDocument, document);
                }
            }
        },
        uri => uri.fsPath,
        1000,
        { trailing: true });

    private updatePreviewItem = debounceByInput(
        (previewItem: PreviewBase, document: vscode.TextDocument) => {
            if (!previewItem.isDisposed) {
                previewItem.onDocumentChange(document, document);
            }
        },
        (preview) => preview.uri.toString(),
        1000,
        { trailing: true });
}

export const previewManager = new PreviewManager();
