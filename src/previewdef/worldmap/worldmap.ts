import * as vscode from 'vscode';
import worldmapview from './worldmapview.html';
import worldmapviewstyles from './worldmapview.css';
import { i18nTableAsScript, localize, localizeText } from '../../util/i18n';
import { html } from '../../util/html';
import { debug, error } from '../../util/debug';
import { MapItemMessage, OpenFileMessage, ProgressReporter, RequestMapItemMessage, WorldMapData, WorldMapMessage } from './definitions';
import { matchPathEnd } from '../../util/nodecommon';
import { dirUri, getDocumentByUri, mkdirs, showQuickPickAnyString, writeFile } from '../../util/vsccommon';
import { debounceByInput, forceError, slice } from '../../util/common';
import { getFilePathFromMod, getHoiOpenedFileOriginalUri, readFileFromModOrHOI4 } from '../../util/fileloader';
import { WorldMapLoader } from './loader/worldmaploader';
import { isEqual } from 'lodash';
import { LoaderSession } from '../../util/loader/loader';
import { sendByMessage, TelemetryMessage } from '../../util/telemetry';
import { getConfiguration } from '../../util/vsccommon';
import { contextContainer } from '../../context';

export class WorldMap {
    public panel: vscode.WebviewPanel | undefined;

    private worldMapLoader: WorldMapLoader;
    private worldMapDependencies: string[] | undefined;
    private cachedWorldMap: WorldMapData | undefined;

    private lastRequestedExportUri: vscode.Uri | undefined;

    constructor(panel: vscode.WebviewPanel) {
        this.panel = panel;
        this.worldMapLoader = new WorldMapLoader();
        this.worldMapLoader.onProgress(this.progressReporter);
    }

    public initialize(): void {
        if (!this.panel) {
            return;
        }

        const webview = this.panel.webview;
        webview.html = this.renderWorldMap(webview);
        webview.onDidReceiveMessage((msg) => this.onMessage(msg));
    }

    public onDocumentChange = debounceByInput(
        (uri: vscode.Uri) => {
            if (!this.worldMapDependencies) {
                return;
            }

            if (this.worldMapDependencies.some(d => matchPathEnd(uri.toString(), d.split('/')))) {
                this.sendProvinceMapSummaryToWebview(false);
            }
        },
        uri => uri.toString(),
        1000,
        { trailing: true });

    public dispose() {
        this.panel = undefined;
    }

    private renderWorldMap(webview: vscode.Webview): string {
        return html(
            webview,
            localizeText(worldmapview),
            [
                { content: i18nTableAsScript() },
                { content: 'window.__enableSupplyArea = ' + getConfiguration().enableSupplyArea + ';' },
                { content: 'window.__workspaceState = ' + JSON.stringify(contextContainer.current?.workspaceState.get('worldmappreview.state', {})) + ';' },
                'common.js',
                'worldmap.js'
            ],
            ['common.css', 'codicon.css', { content: worldmapviewstyles }]
        );
    }

    private async onMessage(msg: WorldMapMessage | TelemetryMessage): Promise<void> {
        try {
            debug('worldmap message ' + JSON.stringify(msg));
            switch (msg.command) {
                case 'loaded':
                    await this.sendProvinceMapSummaryToWebview(msg.force);
                    break;
                case 'requestprovinces':
                    await this.sendMapData('provinces', msg, (await this.worldMapLoader.getWorldMap()).provinces);
                    break;
                case 'requeststates':
                    await this.sendMapData('states', msg, (await this.worldMapLoader.getWorldMap()).states);
                    break;
                case 'requestcountries':
                    await this.sendMapData('countries', msg, (await this.worldMapLoader.getWorldMap()).countries);
                    break;
                case 'requeststrategicregions':
                    await this.sendMapData('strategicregions', msg, (await this.worldMapLoader.getWorldMap()).strategicRegions);
                    break;
                case 'requestsupplyareas':
                    await this.sendMapData('supplyareas', msg, (await this.worldMapLoader.getWorldMap()).supplyAreas);
                    break;
                case 'requestrailways':
                    await this.sendMapData('railways', msg, (await this.worldMapLoader.getWorldMap()).railways);
                    break;
                case 'requestsupplynodes':
                    await this.sendMapData('supplynodes', msg, (await this.worldMapLoader.getWorldMap()).supplyNodes);
                    break;
                case 'openfile':
                    await this.openFile(msg);
                    break;
                case 'telemetry':
                    await sendByMessage(msg);
                    break;
                case 'requestexportmap':
                    await this.requestExportMap();
                    break;
                case 'exportmap':
                    await this.exportMap(msg.dataUrl);
                    break;
                case 'savestate':
                    contextContainer.current?.workspaceState.update('worldmappreview.state', msg.value);
                    break;
            }
        } catch (e) {
            error(e);
        }
    }

    private sendMapData(command: MapItemMessage['command'], msg: RequestMapItemMessage, value: unknown[]) {
        return this.postMessageToWebview({
            command: command,
            data: JSON.stringify(slice(value, msg.start, msg.end)),
            start: msg.start,
            end: msg.end,
        } as WorldMapMessage);
    }

    private progressReporter: ProgressReporter = async (progress: string) => {
        debug('Progress:', progress);
        await this.postMessageToWebview({
            command: 'progress',
            data: progress,
        } as WorldMapMessage);
    };

    private async sendProvinceMapSummaryToWebview(force: boolean) {
        try {
            this.worldMapLoader.shallowForceReload();
            const oldCachedWorldMap = this.cachedWorldMap;
            const loaderSession = new LoaderSession(force, () => this.panel === undefined);
            const { result: worldMap, dependencies } = await this.worldMapLoader.load(loaderSession);
            this.worldMapDependencies = dependencies;
            this.cachedWorldMap = worldMap;

            if (!force && oldCachedWorldMap && await this.sendDifferences(oldCachedWorldMap, worldMap)) {
                return;
            }

            const summary: WorldMapData = {
                ...worldMap,
                provinces: [],
                states: [],
                countries: [],
                strategicRegions: [],
                supplyAreas: [],
            };

            await this.postMessageToWebview({
                command: 'provincemapsummary',
                data: summary,
            } as WorldMapMessage);
        } catch (e) {
            error(e);

            await this.postMessageToWebview({
                command: 'error',
                data: localize('worldmap.failedtoload', 'Failed to load world map: {0}.', forceError(e).toString()),
            } as WorldMapMessage);
        }
    }

    private async openFile(msg: OpenFileMessage): Promise<void> {
        const { type, file, start, end, lineNumber } = msg;

        function showTextDocument(document: vscode.TextDocument) {
            return vscode.window.showTextDocument(document, {
                selection: start !== undefined && end !== undefined ? new vscode.Range(document.positionAt(start), document.positionAt(end)) :
                    (lineNumber !== undefined ? document.lineAt(lineNumber).range : undefined),
            });
        }

        const filePathInMod = await getFilePathFromMod(file);
        if (filePathInMod !== undefined) {
            const filePathInModWithoutOpened = getHoiOpenedFileOriginalUri(filePathInMod);
            const document = getDocumentByUri(filePathInModWithoutOpened) ?? await vscode.workspace.openTextDocument(filePathInModWithoutOpened);
            await showTextDocument(document);
            return;
        }

        const typeName = localize('worldmap.openfiletype.' + type as any, type);
        
        if (!vscode.workspace.workspaceFolders?.length) {
            await vscode.window.showErrorMessage(localize('worldmap.mustopenafolder', 'Must open a folder before opening {0} file.', typeName));
            return;
        }

        let targetFolderUri = vscode.workspace.workspaceFolders[0].uri;
        if (vscode.workspace.workspaceFolders.length >= 1) {
            const folder = await vscode.window.showWorkspaceFolderPick({ placeHolder: localize('worldmap.selectafolder', 'Select a folder to copy {0} file', typeName) });
            if (!folder) {
                return;
            }

            targetFolderUri = folder.uri;
        }

        try {
            const [buffer] = await readFileFromModOrHOI4(file);
            const targetPath = vscode.Uri.joinPath(targetFolderUri, file);
            await mkdirs(dirUri(targetPath));
            await writeFile(targetPath, buffer);

            const document = await vscode.workspace.openTextDocument(targetPath);
            await showTextDocument(document);
        } catch (e) {
            await vscode.window.showErrorMessage(localize('worldmap.failedtoopenstate', 'Failed to open {0} file: {1}.', typeName, forceError(e).toString()));
        }
    }

    private async sendDifferences(cachedWorldMap: WorldMapData, worldMap: WorldMapData): Promise<boolean> {
        await this.progressReporter(localize('worldmap.progress.comparing', 'Comparing changes...'));
        const changeMessages: WorldMapMessage[] = [];

        if ((['width', 'height', 'provincesCount', 'statesCount', 'countriesCount', 'strategicRegionsCount', 'supplyAreasCount',
            'railwaysCount', 'supplyNodesCount',
            'badProvincesCount', 'badStatesCount', 'badStrategicRegionsCount', 'badSupplyAreasCount', 'mapFont'] as (keyof WorldMapData)[])
            .some(k => !isEqual(cachedWorldMap[k], worldMap[k]))) {
            return false;
        }

        if (!isEqual(cachedWorldMap.warnings, worldMap.warnings)) {
            changeMessages.push({ command: 'warnings', data: JSON.stringify(worldMap.warnings), start: 0, end: 0 });
        }

        if (!isEqual(cachedWorldMap.continents, worldMap.continents)) {
            changeMessages.push({ command: 'continents', data: JSON.stringify(worldMap.continents), start: 0, end: 0 });
        }

        if (!isEqual(cachedWorldMap.terrains, worldMap.terrains)) {
            changeMessages.push({ command: 'terrains', data: JSON.stringify(worldMap.terrains), start: 0, end: 0 });
        }

        if (!isEqual(cachedWorldMap.resources, worldMap.resources)) {
            changeMessages.push({ command: 'resources', data: JSON.stringify(worldMap.resources), start: 0, end: 0 });
        }

        if (!isEqual(cachedWorldMap.rivers, worldMap.rivers)) {
            changeMessages.push({ command: 'rivers', data: JSON.stringify(worldMap.rivers), start: 0, end: 0 });
        }

        if (!isEqual(cachedWorldMap.conditionExprs, worldMap.conditionExprs)) {
            changeMessages.push({ command: 'conditionexprs', data: JSON.stringify(worldMap.conditionExprs), start: 0, end: 0 });
        }

        if (!this.fillMessageForItem(changeMessages, worldMap.provinces, cachedWorldMap.provinces, 'provinces', worldMap.badProvincesCount, worldMap.provincesCount)) {
            return false;
        }

        if (!this.fillMessageForItem(changeMessages, worldMap.states, cachedWorldMap.states, 'states', worldMap.badStatesCount, worldMap.statesCount)) {
            return false;
        }

        if (!this.fillMessageForItem(changeMessages, worldMap.countries, cachedWorldMap.countries, 'countries', 0, worldMap.countriesCount)) {
            return false;
        }

        if (!this.fillMessageForItem(changeMessages, worldMap.strategicRegions, cachedWorldMap.strategicRegions, 'strategicregions', worldMap.badStrategicRegionsCount, worldMap.strategicRegionsCount)) {
            return false;
        }

        if (!this.fillMessageForItem(changeMessages, worldMap.supplyAreas, cachedWorldMap.supplyAreas, 'supplyareas', worldMap.badSupplyAreasCount, worldMap.supplyAreasCount)) {
            return false;
        }

        if (!this.fillMessageForItem(changeMessages, worldMap.railways, cachedWorldMap.railways, 'railways', 0, worldMap.railwaysCount)) {
            return false;
        }

        if (!this.fillMessageForItem(changeMessages, worldMap.supplyNodes, cachedWorldMap.supplyNodes, 'supplynodes', 0, worldMap.supplyNodesCount)) {
            return false;
        }

        await this.progressReporter(localize('worldmap.progress.applying', 'Applying changes...'));

        for (const message of changeMessages) {
            await this.postMessageToWebview(message);
        }

        await this.progressReporter('');
        return true;
    }

    private fillMessageForItem(
        changeMessages: WorldMapMessage[],
        list: unknown[],
        cachedList: unknown[],
        command: MapItemMessage['command'],
        listStart: number,
        listEnd: number,
    ): boolean {
        const changeMessagesCountLimit = 30;
        const messageCountLimit = 300;

        let lastDifferenceStart: number | undefined = undefined;
        for (let i = listStart; i <= listEnd; i++) {
            if (i === listEnd || isEqual(list[i], cachedList[i])) {
                if (lastDifferenceStart !== undefined) {
                    changeMessages.push({
                        command,
                        data: JSON.stringify(slice(list, lastDifferenceStart, i)),
                        start: lastDifferenceStart,
                        end: i,
                    });
                    if (changeMessages.length > changeMessagesCountLimit) {
                        return false;
                    }
                    lastDifferenceStart = undefined;
                }
            } else {
                if (lastDifferenceStart === undefined) {
                    lastDifferenceStart = i;
                } else if (i - lastDifferenceStart >= messageCountLimit) {
                    changeMessages.push({
                        command,
                        data: JSON.stringify(slice(list, lastDifferenceStart, i)),
                        start: lastDifferenceStart,
                        end: i,
                    });
                    if (changeMessages.length > changeMessagesCountLimit) {
                        return false;
                    }
                    lastDifferenceStart = i;
                }
            }
        }

        return true;
    }

    private async postMessageToWebview(message: WorldMapMessage) {
        if (!this.panel) {
            return false;
        }

        return await this.panel.webview.postMessage(message);
    }

    private async requestExportMap() {
        const scaleStr = await showQuickPickAnyString(['1', '2', '3', '4'],
            v => {
                const pv = parseFloat(v);
                return !isNaN(pv) && pv >= 1 && pv <= 10;
            },
            localize('worldmap.export.scale', 'Scale of the exported image (1 ~ 10)'));

        if (!scaleStr) {
            return;
        }

        const uri = await vscode.window.showSaveDialog({ filters: { [localize('pngfile', 'PNG file')]: ['png'] } });
        this.lastRequestedExportUri = uri;
        if (!uri) {
            return;
        }

        await this.postMessageToWebview({ command: 'requestexportmap', scale: parseFloat(scaleStr) });
    }

    private async exportMap(dataUrl?: string) {
        const uri = this.lastRequestedExportUri;
        if (!uri) {
            return;
        }

        const prefix = 'data:image/png;base64,';
        if (!dataUrl || !dataUrl.startsWith(prefix)) {
            vscode.window.showErrorMessage(localize('worldmap.export.error.imgformat', 'Can\'t export world map: Image is not in correct format.'));
            return;
        }

        try {
            const base64 = dataUrl.substring(prefix.length);
            const buffer = Buffer.from(base64, 'base64');

            await writeFile(uri, buffer);

            vscode.window.showInformationMessage(localize('worldmap.export.success', 'Successfully exported world map.'));

        } catch (e) {
            error(e);
            vscode.window.showErrorMessage(localize('worldmap.export.error', 'Can\'t export world map: {0}.', e));
        }
    }
}
