import { readFileFromModOrHOI4 } from "../../../util/fileloader";
import { localize } from "../../../util/i18n";
import { Point, ProgressReporter, ProvinceEdgeAdjacency, WorldMapWarning } from "../definitions";
import { FileLoader, LoadResultOD } from "./common";

export class AdjacenciesLoader extends FileLoader<ProvinceEdgeAdjacency[]> {
    protected async loadFromFile(): Promise<LoadResultOD<ProvinceEdgeAdjacency[]>> {
        const warnings: WorldMapWarning[] = [];
        return {
            result: await loadAdjacencies(this.file, e => this.fireOnProgressEvent(e), warnings),
            warnings,
        };
    }

    public toString() {
        return `[AdjacenciesLoader: ${this.file}]`;
    }
}

async function loadAdjacencies(adjacenciesFile: string, progressReporter: ProgressReporter, warnings: WorldMapWarning[]): Promise<ProvinceEdgeAdjacency[]> {
    await progressReporter(localize('worldmap.progress.loadingadjacencies', 'Loading adjecencies...'));

    const [adjecenciesBuffer] = await readFileFromModOrHOI4(adjacenciesFile);
    const adjecencies = adjecenciesBuffer.toString().split(/(?:\r\n|\n|\r)/).map(line => line.split(/[,;]/)).filter((v, i) => i > 0 && v.length >= 9);

    return adjecencies.map(row => convertRowToAdjacencies(row, warnings)).filter((v): v is ProvinceEdgeAdjacency => !!v);
}

function convertRowToAdjacencies(adjacency: string[], warnings: WorldMapWarning[]): ProvinceEdgeAdjacency | undefined {
    const from = parseInt(adjacency[0]);
    const to = parseInt(adjacency[1]);
    const type = adjacency[2];
    const through = parseInt(adjacency[3]);
    const startX = parseInt(adjacency[4]);
    const startY = parseInt(adjacency[5]);
    const stopX = parseInt(adjacency[6]);
    const stopY = parseInt(adjacency[7]);
    const rule = adjacency[8];

    if (from === -1 || to === -1) {
        return undefined;
    }

    const start: Point | undefined = !isNaN(startX) && !isNaN(startY) && startX !== -1 && startY !== -1 ? { x: startX, y: startY } : undefined;
    const stop: Point | undefined = !isNaN(stopX) && !isNaN(stopY) && stopX !== -1 && stopY !== -1 ? { x: stopX, y: stopY } : undefined;

    return {
        from,
        to,
        type,
        through,
        start,
        stop,
        rule,
        row: adjacency,
    };
}
