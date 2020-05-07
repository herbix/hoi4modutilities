import * as vscode from 'vscode';
import { Commands, WebviewType } from '../../constants';
import { WorldMap } from './worldmap';
import { contextContainer } from '../../context';

export class WorldMapContainer implements vscode.WebviewPanelSerializer {
    private worldMap: WorldMap | undefined = undefined;

    public register(): vscode.Disposable {
        const disposables: vscode.Disposable[] = [];
        disposables.push(vscode.commands.registerCommand(Commands.PreviewWorld, this.openPreview, this));
        disposables.push(vscode.window.registerWebviewPanelSerializer(WebviewType.PreviewWorldMap, this));
        return vscode.Disposable.from(...disposables);
    }

    public openPreview(): Promise<void> {
        return this.openWorldMapView();
    }
    
    public deserializeWebviewPanel(webviewPanel: vscode.WebviewPanel, state: any): Promise<void> {
        return this.openWorldMapView(webviewPanel);
    }

    private async openWorldMapView(panel?: vscode.WebviewPanel): Promise<void> {
        if (this.worldMap) {
            this.worldMap.panel.reveal();
            panel?.dispose();
            return;
        }

        panel = panel ?? vscode.window.createWebviewPanel(
            WebviewType.PreviewWorldMap,
            'Preview world map',
            vscode.ViewColumn.Active,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
            }
        );

        panel.onDidDispose(() => {
            if (this.worldMap?.panel === panel) {
                this.worldMap = undefined;
            }
        });

        if (contextContainer.current) {
            panel.iconPath = {
                light: vscode.Uri.file(contextContainer.current.asAbsolutePath('static/preview-right-light.svg')),
                dark: vscode.Uri.file(contextContainer.current.asAbsolutePath('static/preview-right-dark.svg')),
            };
        }

        this.worldMap = new WorldMap(panel);
        await this.worldMap.initialize();
    }
}
