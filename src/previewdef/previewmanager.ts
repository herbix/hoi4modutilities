import * as vscode from 'vscode';
import * as path from 'path';
import { focusTreePreviewDef } from './focustree';
import { localize } from '../util/i18n';
import { gfxPreviewDef } from './gfx';
import { Commands, WebviewType, ContextName } from '../constants';
import { technologyPreviewDef } from './technology';
import { matchPathEnd } from '../util/nodecommon';
import { arrayToMap, debounceByInput } from '../util/common';
import { debug, error } from '../util/debug';
import { PreviewBase } from './previewbase';
import { contextContainer, setVscodeContext } from '../context';
import { getDocumentByUri } from '../util/vsccommon';
import { worldMapPreviewDef } from './worldmap';
import { eventPreviewDef } from './event';
import { chain } from 'lodash';
import { sendEvent } from '../util/telemetry';

export type PreviewProviderDef = PreviewProviderDefNormal | PreviewProviderDefAlternative;

interface PreviewProviderDefNormal {
    type: string;
    canPreview(document: vscode.TextDocument): number | undefined;
    previewContructor: new (uri: vscode.Uri, panel: vscode.WebviewPanel) => PreviewBase;
}

interface PreviewProviderDefAlternative {
    type: string;
    canPreview(document: vscode.TextDocument): number | undefined;
    onPreview(document: vscode.TextDocument): Promise<void>;
}

export class PreviewManager implements vscode.WebviewPanelSerializer {
    private _previews: Record<string, PreviewBase> = {};

    private _previewProviders: PreviewProviderDef[] = [ focusTreePreviewDef, gfxPreviewDef, technologyPreviewDef, worldMapPreviewDef, eventPreviewDef ];
    private _previewProvidersMap: Record<string, PreviewProviderDef> = arrayToMap(this._previewProviders, 'type');

    private _updateSubscriptions: Map<string[], PreviewBase[]> = new Map();

    public register(): vscode.Disposable {
        const disposables: vscode.Disposable[] = [];
        disposables.push(vscode.commands.registerCommand(Commands.Preview, this.showPreview, this));
        disposables.push(vscode.workspace.onDidCloseTextDocument(this.onCloseTextDocument, this));
        disposables.push(vscode.workspace.onDidChangeTextDocument(this.onChangeTextDocument, this));
        disposables.push(vscode.window.onDidChangeActiveTextEditor(this.updateHoi4PreviewContextValue, this));
        disposables.push(vscode.window.registerWebviewPanelSerializer(WebviewType.Preview, this));

        // Trigger context value setting
        this.updateHoi4PreviewContextValue(vscode.window.activeTextEditor);

        return vscode.Disposable.from(...disposables);
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

    private showPreview(uri?: vscode.Uri): Promise<void> {
        return this.showPreviewImpl(uri);
    }

    private onCloseTextDocument(document: vscode.TextDocument): void {
        if (!vscode.window.visibleTextEditors.some(e => e.document.uri.toString() === document.uri.toString())) {
            const key = document.uri.toString();
            this._previews[key]?.panel.dispose();
            debug(`dispose panel ${key} because text document closed`);
        }

        this.updatePreviewItemsInSubscription(document.uri);
    }
    
    private onChangeTextDocument(e: vscode.TextDocumentChangeEvent): void {
        const document = e.document;
        const key = document.uri.toString();
        const preview = this._previews[key];
        if (preview !== undefined) {
            this.updatePreviewItem(preview, document);
        }

        this.updatePreviewItemsInSubscription(document.uri);
    }

    private updateHoi4PreviewContextValue(textEditor: vscode.TextEditor | undefined): void {
        let shouldShowPreviewButton = false;
        let hoi4PreviewType = '';
        if (textEditor) {
            const provider = this.findPreviewProvider(textEditor.document);
            if (provider) {
                shouldShowPreviewButton = true;
                hoi4PreviewType = provider.type;
            }
        }

        setVscodeContext(ContextName.ShouldShowHoi4Preview, shouldShowPreviewButton);
        setVscodeContext(ContextName.ShouldHideHoi4Preview, !shouldShowPreviewButton);
        setVscodeContext(ContextName.Hoi4PreviewType, hoi4PreviewType);
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
                vscode.window.showErrorMessage(localize('preview.cantfinddoc', "Can't find opened document {0}.", requestUri?.toString()));
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
            this.updateHoi4PreviewContextValue(undefined);
            return;
        }

        if ('onPreview' in previewProvider) {
            return previewProvider.onPreview(document);
        }

        if (!panel) {
            sendEvent('preview.show.' + previewProvider.type);
        }

        const filename = path.basename(uri.path);
        panel = panel ?? vscode.window.createWebviewPanel(
            WebviewType.Preview,
            localize('preview.viewtitle', "HOI4: {0}", filename),
            vscode.ViewColumn.Beside,
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
        return chain(this._previewProviders)
            .map(p => ({ provider: p, priority: p.canPreview(document) }))
            .filter((value): value is ({ provider: PreviewProviderDef; priority: number }) => value.priority !== undefined)
            .minBy(value => value.priority)
            .value()?.provider;
    }

    private addPreviewToSubscription(previewItem: PreviewBase, dependency: string[]): void {
        const matchStrings = Object.values(dependency)
            .map(d => d.split('/').filter(v => v));

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

    private getPreviewItemsNeedsUpdate(uri: string): PreviewBase[] {
        const result: PreviewBase[] = [];
        for (const [ matchString, previewItems ] of this._updateSubscriptions.entries()) {
            if (matchPathEnd(uri, matchString)) {
                result.push(...previewItems);
            }
        }

        return result;
    }

    private updatePreviewItemsInSubscription = debounceByInput(
        (uri: vscode.Uri): void => {
            for (const otherPreview of this.getPreviewItemsNeedsUpdate(uri.toString())) {
                if (uri.toString() === otherPreview.uri.toString()) {
                    continue;
                }
                const otherDocument = getDocumentByUri(otherPreview.uri);
                if (otherDocument) {
                    otherPreview.onDocumentChange(otherDocument);
                }
            }
        },
        uri => uri.toString(),
        1000,
        { trailing: true });

    private updatePreviewItem = debounceByInput(
        (previewItem: PreviewBase, document: vscode.TextDocument) => {
            if (!previewItem.isDisposed) {
                previewItem.onDocumentChange(document);
            }
        },
        (preview) => preview.uri.toString(),
        1000,
        { trailing: true });
}

export const previewManager = new PreviewManager();
