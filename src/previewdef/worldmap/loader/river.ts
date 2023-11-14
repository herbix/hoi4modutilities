import { readFileFromModOrHOI4 } from "../../../util/fileloader";
import { localize } from "../../../util/i18n";
import { BMP, parseBmp } from "../../../util/image/bmp/bmpparser";
import { ProgressReporter, River, RiverBmp, WorldMapWarning, Zone } from "../definitions";
import { FileLoader, LoadResult, LoadResultOD, addPointToZone } from "./common";

export class RiverLoader extends FileLoader<RiverBmp> {
    protected async loadFromFile(): Promise<LoadResultOD<RiverBmp>> {
        const warnings: WorldMapWarning[] = [];
        return {
            result: await loadRivers(this.file, e => this.fireOnProgressEvent(e), warnings),
            warnings,
        };
    }

    protected extraMesurements(result: LoadResult<RiverBmp>) {
        return {
            ...super.extraMesurements(result),
            riverCount: result.result.rivers.length,
        };
    }

    public toString() {
        return `[RiverLoader: ${this.file}]`;
    }
}

async function loadRivers(file: string, progressReporter: ProgressReporter, warnings: WorldMapWarning[]): Promise<RiverBmp> {
    progressReporter(localize('worldmap.progress.loadingrivers', 'Loading rivers...'));
    
    const [riversImageBuffer] = await readFileFromModOrHOI4(file);
    const riversImage = parseBmp(riversImageBuffer.buffer, riversImageBuffer.byteOffset);
    const result: RiverBmp = {
        width: riversImage.width,
        height: riversImage.height,
        rivers: [],
    };

    if (riversImage.bitsPerPixel !== 8) {
        warnings.push({
            relatedFiles: [file],
            text: localize('worldmap.warning.riverimagebpp', 'The rivers image should be 8 bits per pixel, but it is {0}.', riversImage.bitsPerPixel),
            source: [{ type: 'river', name: '' }]
        });

        return result;
    }

    const rivers = findRiverPointsList(riversImage);

    result.rivers = rivers;
    return result;
}

function findRiverPointsList(riversImage: BMP): River[] {
    const result: River[] = [];

    for (let y = riversImage.height - 1, sy = 0, dy = (riversImage.height - 1) * riversImage.width;
        y >= 0;
        y--, sy += riversImage.bytesPerRow, dy -= riversImage.width) {
        for (let x = 0, sx = sy, dx = dy; x < riversImage.width; x++, sx++, dx++) {
            const color = riversImage.data[sx];
            if (color > 11) {
                continue;
            }

            result.push(findRiverPoints(x, y, riversImage));
        }
    }

    return result;
}

function findRiverPoints(startX: number, startY: number, riversImage: BMP): River {
    const colors: Record<number, number> = {};
    const ends: number[] = [];
    const boundingBox: Zone = { x: startX, y: startY, w: 1, h: 1 };
    const stack: { x: number; y: number; }[] = [];
    stack.push({ x: startX, y: startY });
    let firstPoint = true;

    while (stack.length > 0) {
        const point = stack.pop()!;
        const { x, y } = point;
        const si = (riversImage.height - 1 - y) * riversImage.bytesPerRow + x;
        const di = y * riversImage.width + x;
        colors[di] = riversImage.data[si];
        riversImage.data[si] = 255;
        let adjecents = 0;
        if (x > 0 && riversImage.data[si - 1] <= 11) {
            stack.push({ x: x - 1, y });
            adjecents++;
        }
        if (x < riversImage.width - 1 && riversImage.data[si + 1] <= 11) {
            stack.push({ x: x + 1, y });
            adjecents++;
        }
        if (y > 0 && riversImage.data[si + riversImage.bytesPerRow] <= 11) {
            stack.push({ x, y: y - 1 });
            adjecents++;
        }
        if (y < riversImage.height - 1 && riversImage.data[si - riversImage.bytesPerRow] <= 11) {
            stack.push({ x, y: y + 1 });
            adjecents++;
        }
        if (adjecents === 0 || (adjecents === 1 && firstPoint)) {
            ends.push(di);
        }
        addPointToZone(boundingBox, point);
        firstPoint = false;
    }

    const convertedColors: Record<number, number> = {};
    for (const key in colors) {
        const value = colors[key];
        const di = parseInt(key, 10);
        const x = di % riversImage.width;
        const y = Math.floor(di / riversImage.width);
        convertedColors[(y - boundingBox.y) * boundingBox.w + (x - boundingBox.x)] = value;
    }

    const convertedEnds: number[] = [];
    for (const end of ends) {
        const x = end % riversImage.width;
        const y = Math.floor(end / riversImage.width);
        convertedEnds.push((y - boundingBox.y) * boundingBox.w + (x - boundingBox.x));
    }

    return {
        colors: convertedColors,
        ends: convertedEnds,
        boundingBox,
    };
}
