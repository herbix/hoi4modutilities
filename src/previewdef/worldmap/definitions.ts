import { Token } from "../../hoiformat/hoiparser";

export interface WorldMapData {
    width: number;
    height: number;
    provinces: (Province | undefined | null)[]; // count of provinces
    states: (State | undefined | null)[];
    countries: Country[];
    provincesCount: number;
    statesCount: number;
    countriesCount: number;
    badProvincesCount: number; // will be * -1
    badStatesCount: number; // will be * -1;
    continents: string[];
    warnings: Warning[];
}

export interface ProvinceMap {
    width: number;
    height: number;
    provinceId: number[]; // width * height
    provinces: (Province | undefined | null)[]; // count of provinces
    badProvincesCount: number;
    continents: string[];
    warnings: Warning[];
}

export interface Province {
    id: number;
    color: number;
    boundingBox: Zone;
    coverZones: Zone[];
    edges: ProvinceEdge[];
    type: string;
    coastal: boolean;
    terrain: string;
    continent: number;
    warnings: string[];
}

export interface ProvinceEdge {
    to: number;
    path: Point[][];
    through?: number;
    type: 'impassable' | string;
    start?: Point;
    stop?: Point;
    rule?: string;
}

export interface State {
    id: number;
    name: string;
    manpower: number;
    category: string;
    owner: string | undefined;
    provinces: number[];
    cores: string[];
    impassable: boolean;
    victoryPoints: Record<number, number | undefined>;
    warnings: string[];
    boundingBox: Zone;
    file: string;
    token: Token | undefined;
}

export interface Warning {
    type: 'province' | 'state';
    sourceId: number;
    text: string;
}

export interface Country {
    tag: string;
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

export type WorldMapMessage = LoadedMessage | RequestProvincesMessage | ProvincesMessage | ErrorMessage | ProgressMessage | ProvinceMapSummaryMessage | OpenStateMessage;

export interface LoadedMessage {
    command: 'loaded';
    force: boolean;
}

export interface RequestProvincesMessage {
    command: 'requestprovinces' | 'requeststates' | 'requestcountries';
    start: number;
    end: number;
}

export interface ProvincesMessage {
    command: 'provinces' | 'states' | 'countries';
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
    data: WorldMapData;
}

export interface OpenStateMessage {
    command: 'openstate';
    file: string;
    start: number | undefined;
    end: number | undefined;
}
