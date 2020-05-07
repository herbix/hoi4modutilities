export interface WorldMapData {
    width: number;
    height: number;
    provinceId: number[]; // width * height
    provinces: Province[]; // count of provinces
    states: State[];
    warnings: string[];
}

export interface WorldMapDataSummary {
    width: number;
    height: number;
    provinceId: []; // width * height
    provinces: []; // count of provinces
    states: [];
    provincesCount: number;
    statesCount: number;
    warnings: string[];
}

export interface ProvinceMap {
    width: number;
    height: number;
    provinceId: number[]; // width * height
    provinces: Province[]; // count of provinces
    warnings: string[];
}

export interface Province {
    id: number;
    color: number;
    boundingBox: Zone;
    coverZones: Zone[];
    edge: Record<number, Point[][]>;
    type: string;
    coastal: boolean;
    terrain: string;
    continent: number;
    warnings: string[];
}

export interface State {
    id: number;
    name: string;
    manpower: number;
    category: string;
    owner: string;
    provinces: number[];
    cores: string[];
    warnings: string[];
}

export interface Country {
    id: string;
    color: number;
}

export interface Point {
    x: number;
    y: number;
}

export interface Zone {
    x: number;
    y: number;
    w: number;
    h: number;
}

export type WorldMapMessage = LoadedMessage | RequestProvincesMessage | ProvincesMessage | ErrorMessage | ProgressMessage | ProvinceMapSummaryMessage;

export interface LoadedMessage {
    command: 'loaded';
    ready: boolean;
}

export interface RequestProvincesMessage {
    command: 'requestprovinces' | 'requestprovinceid' | 'requeststates';
    start: number;
    end: number;
}

export interface ProvincesMessage {
    command: 'provinces' | 'provinceid' | 'states';
    data: string;
    start: number;
    end: number;
}

export interface ErrorMessage {
    command: 'error';
    data: string;
}

export interface ProgressMessage {
    command: 'progress';
    data: string;
}

export interface ProvinceMapSummaryMessage {
    command: 'provincemapsummary';
    data: WorldMapDataSummary;
}
