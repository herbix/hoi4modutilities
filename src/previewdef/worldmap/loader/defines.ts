import { readFileFromModOrHOI4 } from "../../../util/fileloader";
import { LoaderSession } from "../../../util/loader/loader";
import { FileLoader, FolderLoader, LoadResult, LoadResultOD } from "./common";

const defaultMinimumProvinceSize = 8;

interface DefinesFile {
    file: string;
    minimumProvinceSize?: number;
}

export class DefinesLoader extends FolderLoader<number, DefinesFile> {
    constructor() {
        super('common/defines', DefinesFileLoader);
    }

    protected mergeFiles(fileResults: LoadResult<DefinesFile>[], _session: LoaderSession): Promise<LoadResult<number>> {
        const minimumProvinceSize = fileResults
            .map(result => result.result)
            .sort((a, b) => a.file.localeCompare(b.file))
            .reduce((value, defines) => defines.minimumProvinceSize ?? value, defaultMinimumProvinceSize);

        return Promise.resolve({
            result: minimumProvinceSize,
            warnings: [],
            dependencies: [this.folder + '/*'],
        });
    }

    public toString() {
        return `[DefinesLoader]`;
    }
}

class DefinesFileLoader extends FileLoader<DefinesFile> {
    protected async loadFromFile(): Promise<LoadResultOD<DefinesFile>> {
        const [buffer] = await readFileFromModOrHOI4(this.file);
        return {
            result: {
                file: this.file,
                minimumProvinceSize: parseMinimumProvinceSize(buffer.toString()),
            },
            warnings: [],
        };
    }

    public toString() {
        return `[DefinesFileLoader: ${this.file}]`;
    }
}

function parseMinimumProvinceSize(content: string): number | undefined {
    const contentWithoutComments = content
        .replace(/--\[\[[\s\S]*?\]\]/g, '')
        .replace(/--[^\r\n]*/g, '');
    const regex = /\bMINIMUM_PROVINCE_SIZE_IN_PIXELS\s*=\s*(-?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)(?=\s*(?:[,;]|$))/gm;
    let result: number | undefined;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(contentWithoutComments)) !== null) {
        result = Number(match[1]);
    }

    return result;
}
