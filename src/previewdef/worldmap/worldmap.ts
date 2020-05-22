import * as vscode from 'vscode';
import * as path from 'path';
import worldmapview from './worldmapview.html';
import worldmapviewstyles from './worldmapview.css';
import { localize, localizeText } from '../../util/i18n';
import { html } from '../../util/html';
import { error, debug } from '../../util/debug';
import { WorldMapMessage, ProgressReporter } from './definitions';
import { slice, writeFile, debounceByInput, matchPathEnd } from '../../util/common';
import { getFilePathFromMod, readFileFromModOrHOI4 } from '../../util/fileloader';
import { WorldMapLoader } from './loader/worldmaploader';

export class WorldMap {
    private worldMapLoader: WorldMapLoader;
    private worldMapDependencies: string[] | undefined;
    private htmlLoaded: boolean = false;

    constructor(readonly panel: vscode.WebviewPanel) {
        this.worldMapLoader = new WorldMapLoader(this.progressReporter);
    }

    public initialize(): void {
        const webview = this.panel.webview;
        webview.html = localize('loading', 'Loading...');
        webview.html = this.renderWorldMap();
        webview.onDidReceiveMessage((msg) => this.onMessage(msg));
    }

    public onDocumentChange = debounceByInput(
        (uri: vscode.Uri) => {
            if (!this.worldMapDependencies) {
                return;
            }

            if (this.worldMapDependencies.some(d => matchPathEnd(uri.fsPath, d.split('/')))) {
                this.sendProvinceMapSummaryToWebview(false);
            }
        },
        uri => uri.fsPath,
        1000,
        { trailing: true });

    private renderWorldMap(): string {
        return html(this.panel.webview, localizeText(worldmapview), ['worldmap.js'], ['common.css', 'codicon.css', { content: worldmapviewstyles }]);
    }

    private async onMessage(msg: WorldMapMessage): Promise<void> {
        try {
            debug('requestprovinces ' + JSON.stringify(msg));
            switch (msg.command) {
                case 'loaded':
                    this.htmlLoaded = true;
                    await this.sendProvinceMapSummaryToWebview(msg.force);
                    break;
                case 'requestprovinces':
                    await this.panel.webview.postMessage({
                        command: 'provinces',
                        data: JSON.stringify(slice((await this.worldMapLoader.getWorldMap()).provinces, msg.start, msg.end)),
                        start: msg.start,
                        end: msg.end,
                    } as WorldMapMessage);
                    break;
                case 'requeststates':
                    await this.panel.webview.postMessage({
                        command: 'states',
                        data: JSON.stringify(slice((await this.worldMapLoader.getWorldMap()).states, msg.start, msg.end)),
                        start: msg.start,
                        end: msg.end,
                    } as WorldMapMessage);
                    break;
                case 'requestcountries':
                    await this.panel.webview.postMessage({
                        command: 'countries',
                        data: JSON.stringify(slice((await this.worldMapLoader.getWorldMap()).countries, msg.start, msg.end)),
                        start: msg.start,
                        end: msg.end,
                    } as WorldMapMessage);
                    break;
                case 'openstate':
                    await this.openStateFile(msg.file, msg.start, msg.end);
                    break;
            }
        } catch (e) {
            error(e);
        }
    }

    private progressReporter: ProgressReporter = async (progress: string) => {
        await this.panel.webview.postMessage({
            command: 'progress',
            data: progress,
        } as WorldMapMessage);
    };

    private async sendProvinceMapSummaryToWebview(force: boolean) {
        try {
            this.worldMapLoader.shallowForceReload();
            const { result: worldMap, dependencies } = await this.worldMapLoader.load(force);
            this.worldMapDependencies = dependencies;

            const summary = {
                ...worldMap,
                colorByPosition: undefined,
                provinces: [],
                states: [],
                countries: [],
            };
            await this.panel.webview.postMessage({
                command: 'provincemapsummary',
                data: summary,
            } as WorldMapMessage);
        } catch (e) {
            error(e);
            await this.panel.webview.postMessage({
                command: 'error',
                data: 'Failed to load world map ' + e.toString(),
            } as WorldMapMessage);
        }
    }

    private async openStateFile(stateFile: string, start: number | undefined, end: number | undefined): Promise<void> {
        const stateFilePathInMod = await getFilePathFromMod(stateFile);
        if (stateFilePathInMod !== undefined) {
            const document = vscode.workspace.textDocuments.find(d => d.uri.fsPath === stateFilePathInMod.replace('opened?', ''))
                ?? await vscode.workspace.openTextDocument(stateFilePathInMod);
            await vscode.window.showTextDocument(document, {
                selection: start !== undefined && end !== undefined ? new vscode.Range(document.positionAt(start), document.positionAt(end)) : undefined,
            });
            return;
        }
        
        if (!vscode.workspace.workspaceFolders?.length) {
            await vscode.window.showErrorMessage('Must open a folder before opening state file.');
            return;
        }

        let targetFolder = vscode.workspace.workspaceFolders[0].uri.fsPath;
        if (vscode.workspace.workspaceFolders.length >= 1) {
            const folder = await vscode.window.showWorkspaceFolderPick({ placeHolder: 'Select a folder to copy state file' });
            if (!folder) {
                return;
            }

            targetFolder = folder.uri.fsPath;
        }

        try {
            const [buffer] = await readFileFromModOrHOI4(stateFile);
            const targetPath = path.join(targetFolder, stateFile);
            await writeFile(targetPath, buffer);

            const document = await vscode.workspace.openTextDocument(targetPath);
            await vscode.window.showTextDocument(document, {
                selection: start !== undefined && end !== undefined ? new vscode.Range(document.positionAt(start), document.positionAt(end)) : undefined,
            });

        } catch (e) {
            await vscode.window.showErrorMessage('Error open state file: ' + e.toString());
        }
    }
}
