import { WorldMapMessage } from "./definitions";
import { vscode } from "../common";
import { Province, WorldMapData, State } from "../../src/previewdef/worldmap/definitions";
import { arrayToMap } from "../common";

interface ExtraMapData {
    provincesCount: number;
    statesCount: number;
    provinceDict: Record<number, Province>;
    stateDict: Record<number, State>;
    provinceToState: Record<number, number>;
    countries: string[];
    terrains: string[];
}

export type FEWorldMap = WorldMapData & ExtraMapData;
export let provinceMap: FEWorldMap | undefined;
export let loading = false;
export let progress = 0;
export let progressText = '';
let loadingProvinceMap: WorldMapData & { provincesCount: number; statesCount: number; } | undefined;
let loadingQueue: WorldMapMessage[] = [];
let loadingQueueStartLength = 0;

let renderer: { renderCanvas: () => void };

export function load(theRenderer: { renderCanvas: () => void }) {
    renderer = theRenderer;
    vscode.postMessage({
        command: 'loaded',
        ready: false,
    } as WorldMapMessage);
}

window.addEventListener('message', event => {
    const message = event.data as WorldMapMessage;
    switch (message.command) {
        case 'provincemapsummary':
            console.log(JSON.stringify(message));
            loadingProvinceMap = { ...message.data };
            startLoading();
            break;
        case 'provinces':
            loadingProvinceMap?.provinces.push(...JSON.parse(message.data));
            loadNext();
            break;
        case 'provinceid':
            loadingProvinceMap?.provinceId.push(...JSON.parse(message.data));
            loadNext();
            break;
        case 'states':
            loadingProvinceMap?.states.push(...JSON.parse(message.data));
            loadNext();
            break;
        case 'progress':
            progressText = message.data;
            renderer.renderCanvas();
            break;
        case 'error':
            progressText = 'Error: ' + message.data;
            renderer.renderCanvas();
            break;
    }
});

function startLoading() {
    if (!loadingProvinceMap) {
        return;
    }

    loadingQueue.length = 0;
    loading = true;

    let step = 300;
    for (let i = 0; i < loadingProvinceMap.provincesCount; i += step) {
        loadingQueue.push({
            command: 'requestprovinces',
            start: i,
            end: Math.min(i + step, loadingProvinceMap.provincesCount),
        });
    }

    step = 100000;
    const mapSize = loadingProvinceMap.height * loadingProvinceMap.width;
    for (let i = 0; i < mapSize; i += step) {
        loadingQueue.push({
            command: 'requestprovinceid',
            start: i,
            end: Math.min(i + step, mapSize),
        });
    }

    step = 300;
    for (let i = 0; i < loadingProvinceMap.statesCount; i += step) {
        loadingQueue.push({
            command: 'requeststates',
            start: i,
            end: Math.min(i + step, loadingProvinceMap.statesCount),
        });
    }

    loadingQueueStartLength = loadingQueue.length;
    loadNext();
}

function loadNext() {
    progress = 1 - loadingQueue.length / loadingQueueStartLength;
    if (loadingQueue.length === 0) {
        const provinceDict = arrayToMap(loadingProvinceMap!.provinces, 'id');
        provinceMap = {
            ...loadingProvinceMap!,
            provinceDict,
            stateDict: arrayToMap(loadingProvinceMap!.states, 'id'),
            provinceToState: getProvinceToState(loadingProvinceMap!, provinceDict),
            countries: getVisibleCountries(loadingProvinceMap!),
            terrains: getVisibleTerrains(loadingProvinceMap!),
        };
        loading = false;
    } else {
        vscode.postMessage(loadingQueue.shift());
    }

    renderer.renderCanvas();
}

function getProvinceToState(provinceMap: WorldMapData, provinceDict: Record<number, Province>): Record<number, number> {
    const result: Record<number, number> = {};
    for (const state of provinceMap.states) {
        state.provinces.forEach(p => {
            if (!(p in provinceDict)) {
                state.warnings.push('Province ' + p + ' doesn\'t exist');
            } else if (p in result) {
                provinceDict[p].warnings.push('Province appeared in multiple states: ' + result[p] + ', ' + state.id);
            }
            result[p] = state.id;
        });
    }

    return result;
}

function getVisibleCountries(provinceMap: WorldMapData): string[] {
    const result: string[] = [];
    for (const state of provinceMap.states) {
        if (!result.includes(state.owner)) {
            result.push(state.owner);
        }
    }
    return result;
}

function getVisibleTerrains(provinceMap: WorldMapData): string[] {
    const result: string[] = [];
    for (const province of provinceMap.provinces) {
        if (!result.includes(province.terrain)) {
            result.push(province.terrain);
        }
    }
    return result;
}
