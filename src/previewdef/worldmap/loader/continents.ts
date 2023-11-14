import { Enum } from "../../../hoiformat/schema";
import { readFileFromModOrHOI4AsJson } from "../../../util/fileloader";
import { localize } from "../../../util/i18n";
import { ProgressReporter } from "../definitions";
import { FileLoader, LoadResultOD } from "./common";

export class ContinentsLoader extends FileLoader<string[]> {
    protected async loadFromFile(): Promise<LoadResultOD<string[]>> {
        return {
            result: await loadContinents(this.file, e => this.fireOnProgressEvent(e)),
            warnings: [],
        };
    }

    public toString() {
        return `[ContinentsLoader: ${this.file}]`;
    }
}

async function loadContinents(continentFile: string, progressReporter: ProgressReporter): Promise<string[]> {
    await progressReporter(localize('worldmap.progress.loadingcontinents', 'Loading continents...'));
    return ['', ...(await readFileFromModOrHOI4AsJson<{ continents: Enum }>(continentFile, { continents: 'enum' })).continents._values];
}
