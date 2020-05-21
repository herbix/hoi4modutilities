import * as vscode from 'vscode';
import * as path from 'path';
import worldmapview from './worldmapview.html';
import worldmapviewstyles from './worldmapview.css';
import { localize, localizeText } from '../../util/i18n';
import { html } from '../../util/html';
import { error, debug } from '../../util/debug';
import { WorldMapMessage, WorldMapData, ProvinceMap } from './definitions';
import { loadProvinceMap } from './loader/provincemap';
import { loadStates } from './loader/states';
import { loadCountries } from './loader/countries';
import { slice, writeFile } from '../../util/common';
import { getFilePathFromMod, readFileFromModOrHOI4 } from '../../util/fileloader';

export class WorldMap {
    private cachedWorldMap: (WorldMapData & ProvinceMap) | undefined = undefined;
    private htmlLoaded: boolean = false;

    constructor(readonly panel: vscode.WebviewPanel) {
    }

    public initialize(): void {
        const webview = this.panel.webview;
        webview.html = localize('loading', 'Loading...');
        webview.html = this.renderWorldMap();
        webview.onDidReceiveMessage((msg) => this.onMessage(msg));
    }

    public rerender(): void {
        // this.panel.webview.html = this.renderWorldMap();
    }

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
                        data: JSON.stringify(slice(this.cachedWorldMap?.provinces, msg.start, msg.end)),
                        start: msg.start,
                        end: msg.end,
                    } as WorldMapMessage);
                    break;
                case 'requeststates':
                    await this.panel.webview.postMessage({
                        command: 'states',
                        data: JSON.stringify(slice(this.cachedWorldMap?.states, msg.start, msg.end)),
                        start: msg.start,
                        end: msg.end,
                    } as WorldMapMessage);
                    break;
                case 'requestcountries':
                    await this.panel.webview.postMessage({
                        command: 'countries',
                        data: JSON.stringify(slice(this.cachedWorldMap?.countries, msg.start, msg.end)),
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

    private async sendProvinceMapSummaryToWebview(force: boolean) {
        try {
            if (force || !this.cachedWorldMap) {
                const progressReporter = async (progress: string) => {
                    await this.panel.webview.postMessage({
                        command: 'progress',
                        data: progress,
                    } as WorldMapMessage);
                };

                const provinceMap = await loadProvinceMap(progressReporter);
                const stateMap = await loadStates(progressReporter, provinceMap);
                const countries = await loadCountries(progressReporter);

                this.cachedWorldMap = {
                    ...provinceMap,
                    ...stateMap,
                    provincesCount: provinceMap.provinces.length,
                    statesCount: stateMap.states.length,
                    countriesCount: countries.length,
                    countries,
                };
            }

            const worldMap = this.cachedWorldMap;
            await this.panel.webview.postMessage({
                command: 'provincemapsummary',
                data: {
                    ...worldMap,
                    provinceId: undefined,
                    provinces: [],
                    states: [],
                    countries: [],
                },
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
