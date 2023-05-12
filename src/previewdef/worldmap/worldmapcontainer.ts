import * as vscode from 'vscode';
import { Commands, WebviewType } from '../../constants';
import { WorldMap } from './worldmap';
import { contextContainer } from '../../context';
import { localize } from '../../util/i18n';
import { sendEvent } from '../../util/telemetry';

export class WorldMapContainer implements vscode.WebviewPanelSerializer {
    private worldMap: WorldMap | undefined = undefined;

    public register(): vscode.Disposable {
        const disposables: vscode.Disposable[] = [];
        disposables.push(vscode.commands.registerCommand(Commands.PreviewWorld, this.openPreview, this));
        disposables.push(vscode.window.registerWebviewPanelSerializer(WebviewType.PreviewWorldMap, this));
        disposables.push(vscode.workspace.onDidCloseTextDocument(this.onCloseTextDocument, this));
        disposables.push(vscode.workspace.onDidChangeTextDocument(this.onChangeTextDocument, this));
        return vscode.Disposable.from(...disposables);
    }

    public openPreview(): Promise<void> {
        sendEvent('preview.show.worldmap');
        return this.openWorldMapView();
    }
    
    public deserializeWebviewPanel(webviewPanel: vscode.WebviewPanel, state: any): Promise<void> {
        return this.openWorldMapView(webviewPanel);
    }

    private async openWorldMapView(panel?: vscode.WebviewPanel): Promise<void> {
        if (this.worldMap) {
            this.worldMap.panel?.reveal();
            panel?.dispose();
            return;
        }

        panel = panel ?? vscode.window.createWebviewPanel(
            WebviewType.PreviewWorldMap,
            localize('worldmap.preview.title', 'Preview World Map'),
            vscode.ViewColumn.Active,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
            }
        );

        panel.onDidDispose(() => {
            if (this.worldMap?.panel === panel) {
                this.worldMap?.dispose();
                this.worldMap = undefined;
            }
        });

        if (contextContainer.current) {
            panel.iconPath = {
                light: vscode.Uri.joinPath(contextContainer.current.extensionUri, 'static/preview-right-light.svg'),
                dark: vscode.Uri.joinPath(contextContainer.current.extensionUri, 'static/preview-right-dark.svg'),
            };
        }

        this.worldMap = new WorldMap(panel);
        this.worldMap.initialize();
    }

    private onChangeTextDocument(e: vscode.TextDocumentChangeEvent): void {
        this.worldMap?.onDocumentChange(e.document.uri);
    }

    private onCloseTextDocument(document: vscode.TextDocument): void {
        this.worldMap?.onDocumentChange(document.uri);
    }
}
