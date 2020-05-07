import * as vscode from 'vscode';
import worldmapview from './worldmapview.html';
import worldmapviewstyles from './worldmapview.css';
import { localize } from '../../util/i18n';
import { html } from '../../util/html';
import { error, debug } from '../../util/debug';
import { WorldMapMessage, WorldMapData } from './definitions';
import { loadProvinceMap } from './loader/provincemap';
import { loadStates } from './loader/states';

export class WorldMap {
    private cachedWorldMap: WorldMapData | undefined = undefined;
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
        return html(this.panel.webview, worldmapview, ['worldmap.js'], [{ content: worldmapviewstyles }]);
    }

    private async onMessage(msg: WorldMapMessage): Promise<void> {
        try {
            debug('requestprovinces ' + JSON.stringify(msg));
            switch (msg.command) {
                case 'loaded':
                    this.htmlLoaded = true;
                    if (!msg.ready) {
                        await this.sendProvinceMapSummaryToWebview();
                    }
                    break;
                case 'requestprovinces':
                    await this.panel.webview.postMessage({
                        command: 'provinces',
                        data: JSON.stringify(this.cachedWorldMap?.provinces.slice(msg.start, msg.end)),
                    } as WorldMapMessage);
                    break;
                case 'requestprovinceid':
                    await this.panel.webview.postMessage({
                        command: 'provinceid',
                        data: JSON.stringify(this.cachedWorldMap?.provinceId.slice(msg.start, msg.end)),
                        start: msg.start,
                        end: msg.end,
                    } as WorldMapMessage);
                    break;
                case 'requeststates':
                    await this.panel.webview.postMessage({
                        command: 'states',
                        data: JSON.stringify(this.cachedWorldMap?.states.slice(msg.start, msg.end)),
                        start: msg.start,
                        end: msg.end,
                    } as WorldMapMessage);
                    break;
            }
        } catch (e) {
            error(e);
        }
    }

    private async sendProvinceMapSummaryToWebview() {
        try {
            if (!this.cachedWorldMap) {
                const progressReporter = async (progress: string) => {
                    await this.panel.webview.postMessage({
                        command: 'progress',
                        data: progress,
                    } as WorldMapMessage);
                };

                this.cachedWorldMap = {
                    ...await loadProvinceMap(progressReporter),
                    states: await loadStates(progressReporter),
                };
            }

            const worldMap = this.cachedWorldMap;
            await this.panel.webview.postMessage({
                command: 'provincemapsummary',
                data: {
                    ...worldMap,
                    provinceId: [],
                    provinces: [],
                    states: [],
                    provincesCount: worldMap.provinces.length,
                    statesCount: worldMap.states.length,
                },
            } as WorldMapMessage);
        } catch (e) {
            error(e);
            await this.panel.webview.postMessage({
                command: 'error',
                data: 'Error load province' + e.toString(),
            } as WorldMapMessage);
        }
    }
}
