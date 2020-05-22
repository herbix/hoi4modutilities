import { WorldMapMessage, Province, WorldMapData, RequestProvincesMessage, State, Country, Point } from "./definitions";
import { vscode, copyArray } from "../util/common";
import { inBBox } from "./graphutils";
import { EventEmitter, asEvent, Subscriber, Observable } from "../util/event";
import { Warning } from "../../src/previewdef/worldmap/definitions";

interface ExtraMapData {
    provincesCount: number;
    statesCount: number;
    countriesCount: number;
}

interface FEWorldMapClassExtra {
    terrains: string[];
    getStateByProvinceId(provinceId: number): State | undefined;
    getProvinceByPosition(x: number, y: number): Province | undefined;
    getProvinceToStateMap(): Record<number, number | undefined>;
    getProvinceById(provinceId: number): Province | undefined;
    getStateById(stateId: number): State | undefined;
    forEachProvince(callback: (province: Province) => boolean | void): void;
    forEachState(callback: (state: State) => boolean | void): void;
}

export type FEWorldMap = Omit<WorldMapData, 'states' | 'provinces'> & ExtraMapData & FEWorldMapClassExtra;

export class Loader extends Subscriber {
    public worldMap: FEWorldMapClass;
    public loading = new Observable<boolean>(false);
    public progress: number = 0;
    public progressText: string = '';

    private onMapChangedEmitter = new EventEmitter<FEWorldMap>();
    public onMapChanged = this.onMapChangedEmitter.event;

    private onProgressChangedEmitter = new EventEmitter<void>();
    public onProgressChanged = this.onProgressChangedEmitter.event;

    private loadingProvinceMap: WorldMapData & { provincesCount: number; statesCount: number; countriesCount: number; } | undefined;
    private loadingQueue: WorldMapMessage[] = [];
    private loadingQueueStartLength = 0;

    constructor() {
        super();

        this.worldMap = new FEWorldMapClass();

        this.load();
    }

    public refresh() {
        this.worldMap = new FEWorldMapClass();
        this.onMapChangedEmitter.fire(this.worldMap);
        vscode.postMessage({ command: 'loaded', force: true } as WorldMapMessage);
        this.loading.set(true);
    }

    private load() {
        this.subscriptions.push(asEvent(window, 'message')(event => {
            const message = event.data as WorldMapMessage;
            switch (message.command) {
                case 'provincemapsummary':
                    this.loadingProvinceMap = { ...message.data };
                    this.loadingProvinceMap.provinces = new Array(this.loadingProvinceMap.provincesCount);
                    this.loadingProvinceMap.states = new Array(this.loadingProvinceMap.statesCount);
                    this.loadingProvinceMap.countries = new Array(this.loadingProvinceMap.countriesCount);
                    console.log(message.data);
                    this.startLoading();
                    break;
                case 'provinces':
                    this.receiveData(this.loadingProvinceMap?.provinces, message.start, message.end, message.data);
                    this.loadNext();
                    break;
                case 'states':
                    this.receiveData(this.loadingProvinceMap?.states, message.start, message.end, message.data);
                    this.loadNext();
                    break;
                case 'countries':
                    this.receiveData(this.loadingProvinceMap?.countries, message.start, message.end, message.data);
                    this.loadNext();
                    break;
                case 'progress':
                    this.progressText = message.data;
                    this.onProgressChangedEmitter.fire();
                    break;
                case 'error':
                    this.progressText = message.data;
                    this.onProgressChangedEmitter.fire();
                    this.loading.set(false);
                    break;
            }
        }));

        vscode.postMessage({ command: 'loaded', force: false } as WorldMapMessage);
        this.loading.set(true);
    }

    private startLoading() {
        if (!this.loadingProvinceMap) {
            return;
        }
    
        this.loadingQueue.length = 0;
    
        this.queueLoadingRequest('requestcountries', this.loadingProvinceMap.countriesCount, 300);
        this.queueLoadingRequest('requeststates', this.loadingProvinceMap.statesCount, 300);
        this.queueLoadingRequest('requeststates', -this.loadingProvinceMap.badStatesCount, 300, this.loadingProvinceMap.badStatesCount);
        this.queueLoadingRequest('requestprovinces', this.loadingProvinceMap.provincesCount, 300);
        this.queueLoadingRequest('requestprovinces', -this.loadingProvinceMap.badProvincesCount, 300, this.loadingProvinceMap.badProvincesCount);

        this.loadingQueueStartLength = this.loadingQueue.length;
        this.progressText = '';
        this.loadNext();
    }

    private queueLoadingRequest<C extends RequestProvincesMessage['command']>(command: C, count: number, step: number, offset: number = 0) {
        for (let i = offset, j = 0; j < count; i += step, j += step) {
            this.loadingQueue.push({
                command,
                start: i,
                end: Math.min(i + step, offset + count),
            });
        }
    }

    private loadNext(updateMap: boolean = true) {
        this.progress = 1 - this.loadingQueue.length / this.loadingQueueStartLength;
    
        if (updateMap) {
            this.worldMap = new FEWorldMapClass(this.loadingProvinceMap!);
            (window as any)['worldMap'] = this.worldMap;
            this.onMapChangedEmitter.fire(this.worldMap);
        }
    
        if (this.loadingQueue.length === 0) {
            this.loading.set(false);
        } else {
            vscode.postMessage(this.loadingQueue.shift());
        }

        this.onProgressChangedEmitter.fire();
    }
    
    private receiveData<T>(arr: T[] | undefined, start: number, end: number, data: string): void {
        if (arr) {
            copyArray(JSON.parse(data), arr, 0, start, end - start);
        }
    }
}

class FEWorldMapClass implements FEWorldMap {
    width!: number;
    height!: number;
    countries!: Country[];
    warnings!: Warning[];
    provincesCount!: number;
    statesCount!: number;
    countriesCount!: number;
    badProvincesCount!: number;
    badStatesCount!: number;
    continents!: string[];

    terrains: string[];

    private provinces!: (Province | null | undefined)[];
    private states!: (State | null | undefined)[];

    constructor(worldMap?: WorldMapData & ExtraMapData) {
        Object.assign(this, worldMap ?? {
            width: 0, height: 0,
            provinces: [], states: [], countries: [], warnings: [], continents: [],
            provincesCount: 0, statesCount: 0, countriesCount: 0, badProvincesCount: 0, badStatesCount: 0,
        });
        this.terrains = this.getVisibleTerrains();
    }

    public getProvinceById(provinceId: number): Province | undefined {
        return this.provinces[provinceId] ?? undefined;
    }

    public getStateById(stateId: number): State | undefined {
        return this.states[stateId] ?? undefined;
    }

    public getStateByProvinceId(provinceId: number): State | undefined {
        let resultState: State | undefined = undefined;
        this.forEachState(state => {
            if (state.provinces.includes(provinceId)) {
                resultState = state;
                return true;
            }
        });
        return resultState;
    }
    
    public getProvinceByPosition(x: number, y: number): Province | undefined {
        const point: Point = { x, y };
        let resultProvince: Province | undefined = undefined;
        this.forEachProvince(province => {
            if (inBBox(point, province.boundingBox) && province.coverZones.some(z => inBBox(point, z))) {
                resultProvince = province;
                return true;
            }
        });
        return resultProvince;
    }

    public getProvinceToStateMap(): Record<number, number | undefined> {
        const result: Record<number, number | undefined> = {};

        this.forEachState(state =>
            state.provinces.forEach(p => {
                result[p] = state.id;
            })
        );
    
        return result;
    }

    public forEachProvince(callback: (province: Province) => boolean | void) {
        const count = this.provincesCount;
        for (let i = this.badProvincesCount; i < count; i++) {
            const province = this.provinces[i];
            if (province && callback(province)) {
                break;
            }
        }
    }

    public forEachState(callback: (state: State) => boolean | void) {
        const count = this.statesCount;
        for (let i = this.badStatesCount; i < count; i++) {
            const state = this.states[i];
            if (state && callback(state)) {
                break;
            }
        }
    }
    
    private getVisibleTerrains(): string[] {
        const result: string[] = [];
        for (const province of this.provinces) {
            if (!province) {
                continue;
            }
            if (!result.includes(province.terrain)) {
                result.push(province.terrain);
            }
        }
        return result;
    }
}
