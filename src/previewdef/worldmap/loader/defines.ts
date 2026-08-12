import { readFileFromModOrHOI4 } from '../../../util/fileloader';
import { LoaderSession } from '../../../util/loader/loader';
import { FileLoader, FolderLoader, LoadResult, LoadResultOD } from './common';

export interface Defines {
    minimumProvinceSize?: {
        file: string;
        value: number;
    };
}

interface DefinesFile extends Defines {
    file: string;
}

export class DefinesLoader extends FolderLoader<Defines, DefinesFile> {
    constructor() {
        super('common/defines', DefinesFileLoader);
    }

    protected mergeFiles(fileResults: LoadResult<DefinesFile>[], _session: LoaderSession): Promise<LoadResult<Defines>> {
        const result: Defines = {};
        const definesFiles = fileResults
            .map(result => result.result)
            .sort((a, b) => a.file.localeCompare(b.file));

        for (const defines of definesFiles) {
            if (defines.minimumProvinceSize !== undefined) {
                result.minimumProvinceSize = defines.minimumProvinceSize;
            }
        }

        return Promise.resolve({
            result,
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
        const minimumProvinceSize = parseMinimumProvinceSize(buffer.toString());
        return {
            result: {
                file: this.file,
                minimumProvinceSize: minimumProvinceSize === undefined ? undefined : {
                    file: this.file,
                    value: minimumProvinceSize,
                },
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
