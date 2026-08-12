import { localisationIndex } from '../../../indexing/localisationindex';
import { readFileFromModOrHOI4 } from '../../../util/fileloader';
import { localize } from '../../../util/i18n';
import { ProgressReporter, ProvinceDefinition, WorldMapWarning } from '../definitions';
import { FileLoader, LoadResultOD } from './common';

export class DefinitionsLoader extends FileLoader<ProvinceDefinition[]> {
    protected async loadFromFile(): Promise<LoadResultOD<ProvinceDefinition[]>> {
        const warnings: WorldMapWarning[] = [];
        return {
            result: await loadDefinitions(this.file, e => this.fireOnProgressEvent(e), warnings),
            warnings,
        };
    }

    public toString() {
        return `[DefinitionsLoader: ${this.file}]`;
    }
}

async function loadDefinitions(definitionsFile: string, progressReporter: ProgressReporter, warnings: WorldMapWarning[]): Promise<ProvinceDefinition[]> {
    await progressReporter(localize('worldmap.progress.loadingprovincedef', 'Loading province definitions...'));

    const [definitionsBuffer] = await readFileFromModOrHOI4(definitionsFile);
    const definition = definitionsBuffer.toString().split(/(?:\r\n|\n|\r)/).map((line, index) => ({ data: line.split(/[,;]/), index })).filter(v => v.data.length >= 8);

    return definition.map(row => convertRowToProvince(row.data, row.index, warnings));
}

function convertRowToProvince(row: string[], lineNumber: number, warnings: WorldMapWarning[]): ProvinceDefinition {
    const id = parseInt(row[0]);
    const r = parseInt(row[1]);
    const g = parseInt(row[2]);
    const b = parseInt(row[3]);
    const type = row[4];
    const continent = parseInt(row[7]);

    return {
        id,
        localisedName: localisationIndex.get(`VICTORY_POINTS_${id}`)?.value,
        color: (r << 16) | (g << 8) | b,
        type,
        coastal: row[5].trim().toLowerCase() === 'true',
        terrain: row[6],
        continent,
        lineNumber,
    };
}
