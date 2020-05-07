import { ProvinceMap, Province, Zone, Point } from "../definitions";
import { readFileFromModOrHOI4AsJson, readFileFromModOrHOI4 } from "../../../util/fileloader";
import { parseBmp, BMP } from "../../../util/image/bmp/bmpparser";
import { arrayToMap } from "../../../util/common";

interface DefaultMap {
    definitions: string;
    provinces: string;
}

export async function loadProvinceMap(progressReporter: (progress: string) => Promise<void>): Promise<ProvinceMap> {
    await progressReporter('Loading default.map...');

    const defaultMap = await readFileFromModOrHOI4AsJson<DefaultMap>('map/default.map', { definitions: 'string', provinces: 'string' });
    if (!defaultMap.definitions || !defaultMap.provinces) {
        throw new Error('definitions or provinces not found in default.map.');
    }

    await progressReporter('Loading province bmp...');

    const [provinceMapImageBuffer] = await readFileFromModOrHOI4('map/' + defaultMap.provinces);
    const provinceMapImage = parseBmp(provinceMapImageBuffer.buffer);

    await progressReporter('Loading province definitions...');

    const definitionsBuffer = await readFileFromModOrHOI4('map/' + defaultMap.definitions);
    const definition = definitionsBuffer.toString().split(/(?:\r\n|\n|\r)/).map(line => line.split(/[,;]/)).filter(v => v.length >= 8);

    if (provinceMapImage.bitsPerPixel !== 24) {
        throw new Error('provinces bmp must be 24 bits per pixel.');
    }

    if (provinceMapImage.width % 256 !== 0 || provinceMapImage.height % 256 !== 0) {
        throw new Error('Width and height of provinces bmp must be multiply of 256.');
    }

    const provinces = definition.map(row => {
        const r = parseInt(row[1]);
        const g = parseInt(row[2]);
        const b = parseInt(row[3]);
        return {
            id: parseInt(row[0]),
            color: (r << 16) | (g << 8) | b,
            coverZones: [],
            edge: {},
            type: row[4],
            coastal: row[5].trim().toLowerCase() === 'true',
            terrain: row[6],
            continent: parseInt(row[7]),
            warnings: [],
        };
    });

    await progressReporter('Mapping province definitions to bmp...');

    const provinceIdByPosition = getProvincesByPosition(provinceMapImage, provinces);

    await progressReporter('Calculating province region...');

    const width = provinceMapImage.width;
    const height = provinceMapImage.height;
    const filledProvinces: Province[] = fillProvinceZones(provinces, provinceIdByPosition, width, height);

    await progressReporter('Calculating province edges...');

    fillEdges(filledProvinces, provinceIdByPosition, width, height);

    return {
        width,
        height,
        provinceId: provinceIdByPosition,
        provinces: filledProvinces,
        warnings: [],
    };
}

function getProvincesByPosition(provinceMapImage: BMP, provinces: { id: number, color: number }[]): number[] {
    const colorToProvince = arrayToMap(provinces, 'color');
    const provinceIdByPosition: number[] = new Array(provinceMapImage.width * provinceMapImage.height);
    const bitmapData = provinceMapImage.data;

    for (let y = provinceMapImage.height - 1, sy = 0, dy = (provinceMapImage.height - 1) * provinceMapImage.width;
        y >= 0;
        y--, sy += provinceMapImage.bytesPerRow, dy -= provinceMapImage.width) {
        for (let x = 0, sx = sy, dx = dy; x < provinceMapImage.width; x++, sx += 3, dx++) {
            const color = (bitmapData[sx + 2] << 16) | (bitmapData[sx + 1] << 8) | bitmapData[sx];
            const province = colorToProvince[color];
            if (province === undefined) {
                throw new Error(`color #${color.toString(16)} in provinces bmp (${x}, ${y}) not exist in definitions.`);
            }

            provinceIdByPosition[dx] = province.id;
        }
    }

    return provinceIdByPosition;
}

function fillProvinceZones<T extends {id: number, coverZones: Zone[]}>(
    provinces: (T & { boundingBox?: Zone })[],
    provinceIdByPosition: number[],
    width: number,
    height: number,
): (T & { boundingBox: Zone })[] {
    const provinceMap: Record<number, typeof provinces[0]> = arrayToMap(provinces, 'id');
    const blockStack: Zone[] = [];
    const blockSize = 256;
    for (let x = 0; x < width; x += blockSize) {
        for (let y = 0; y < height; y += blockSize) {
            blockStack.push({ x, y, w: blockSize, h: blockSize });
        }
    }

    while (blockStack.length > 0) {
        const block = blockStack.pop()!;
        const t = block.y;
        const l = block.x;
        const b = block.y + block.h;
        const r = block.x + block.w;
        const color = provinceIdByPosition[t * width + l];
        let sameColor = true;
        for (let y = t, yi = t * width; y < b; y++, yi += width) {
            for (let x = l, xi = yi + l; x < r; x++, xi++) {
                if (provinceIdByPosition[xi] !== color) {
                    sameColor = false;
                    break;
                }
            }
        }

        if (sameColor) {
            provinceMap[color].coverZones.push(block);
        } else {
            const blockSize = block.w >> 1;
            blockStack.push({ ...block, w: blockSize, h: blockSize });
            blockStack.push({ ...block, x: block.x + blockSize, w: blockSize, h: blockSize });
            blockStack.push({ ...block, y: block.y + blockSize, w: blockSize, h: blockSize });
            blockStack.push({ x: block.x + blockSize, y: block.y + blockSize, w: blockSize, h: blockSize });
        }
    }

    for (const province of provinces) {
        if (province.coverZones.length > 0) {
            province.boundingBox = province.coverZones.reduce((p, c) => mergeBoundingBox(p, c, width));
        } else {
            province.boundingBox = { x: 0, y: -5000, w: 0, h: 0 };
        }
    }

    return provinces as (T & { boundingBox: Zone })[];
}

function mergeBoundingBox(a: Zone, b: Zone, width: number): Zone {
    if (a.x + a.w < width * 0.25 && b.x > width * 0.75) {
        b = { ...b, x: b.x - width };
    }

    const l = Math.min(a.x, b.x);
    const t = Math.min(a.y, b.y);
    const r = Math.max(a.x + a.w, b.x + b.w);
    const bo = Math.max(a.y + a.h, b.y + b.h);
    return {
        x: l,
        y: t,
        w: r - l,
        h: bo - t,
    };
}

function fillEdges(provinces: Province[], provinceIdByPosition: number[], width: number, height: number): void {
    const provinceMap = arrayToMap(provinces, 'id');
    const accessedPixels = new Array<boolean>(provinceIdByPosition.length).fill(false);

    for (let y = 0, yi = 0; y < height; y++, yi += width) {
        for (let x = 0, xi = yi; x < width; x++, xi++) {
            if (accessedPixels[xi]) {
                continue;
            }

            fillEdgesOfProvince(xi, provinceMap, provinceIdByPosition, accessedPixels, width, height);
        }
    }
}

function fillEdgesOfProvince(
    index: number, provinceMap: Record<number, Province>, provinceIdByPosition: number[],
    accessedPixels: boolean[], width: number, height: number
): void {
    const color = provinceIdByPosition[index];
    const edgePixels = findEdgePixels(index, accessedPixels, color, provinceIdByPosition, width, height);
    const edgePixelsByAdjecentProvince: Record<number, [Point, Point][]> = {};
    edgePixels.forEach(([p, line]) => {
        let lines = edgePixelsByAdjecentProvince[p];
        if (lines === undefined) {
            edgePixelsByAdjecentProvince[p] = lines = [];
        }
        lines.push(line);
    });

    const province = provinceMap[color];
    for (const [key, value] of Object.entries(edgePixelsByAdjecentProvince)) {
        const numKey = key as unknown as number;
        const edgeSet = province.edge[numKey] ?? [];
        const concatedEdges = concatEdges(value);
        edgeSet.push(...concatedEdges);
        province.edge[numKey] = edgeSet;
    }
}

const indicesToOffset: [number, number][][] = [
    [[0, 0], [0, 1]],
    [[0, 0], [1, 0]],
    [[1, 0], [1, 1]],
    [[0, 1], [1, 1]],
];
function findEdgePixels(index: number, accessedPixels: boolean[], color: number, provinceIdByPosition: number[], width: number, height: number) {
    const edgePixels: [number, [Point, Point]][] = [];
    const pixelStack: number[] = [ index ];
    const indices: number[] = new Array(4);

    while (pixelStack.length > 0) {
        const pixelIndex = pixelStack.pop()!;
        if (accessedPixels[pixelIndex]) {
            continue;
        }

        const x = pixelIndex % width;
        const y = Math.floor(pixelIndex / width);

        indices[0] = x === 0 ? pixelIndex + width - 1 : pixelIndex - 1;
        indices[1] = pixelIndex - width;
        indices[2] = x === width - 1 ? pixelIndex - width + 1 : pixelIndex + 1;
        indices[3] = y === height - 1 ? -1 : pixelIndex + width;

        for (let i = 0; i < 4; i++) {
            const adjecentIndex = indices[i];
            if (adjecentIndex < 0) {
                edgePixels.push([-1, indicesToOffset[i].map(([xOff, yOff]) => ({ x: x + xOff, y: y + yOff })) as [Point, Point]]);
            } else {
                const adjecentColor = provinceIdByPosition[adjecentIndex];
                if (color !== adjecentColor) {
                    edgePixels.push([adjecentColor, indicesToOffset[i].map(([xOff, yOff]) => ({ x: x + xOff, y: y + yOff })) as [Point, Point]]);
                } else {
                    pixelStack.push(adjecentIndex);
                }
            }
        }

        accessedPixels[pixelIndex] = true;
    }

    return edgePixels;
}

function concatEdges(edges: [Point, Point][]): Point[][] {
    const result: Point[][] = [];
    const accessedEdges = new Array<boolean>(edges.length).fill(false);
    for (let i = 0; i < edges.length; i++) {
        if (accessedEdges[i]) {
            continue;
        }

        const edge: Point[] = edges[i];
        accessedEdges[i] = true;

        let foundNew = true;
        while (foundNew) {
            foundNew = false;
            const headHead = edges.findIndex((e, i) => !accessedEdges[i] && pointEqual(edge[0], e[0]));
            if (headHead !== -1) {
                accessedEdges[headHead] = foundNew = true;
                edge.unshift(edges[headHead][1]);
            }

            const headTail = edges.findIndex((e, i) => !accessedEdges[i] && pointEqual(edge[0], e[1]));
            if (headTail !== -1) {
                accessedEdges[headTail] = foundNew = true;
                edge.unshift(edges[headTail][0]);
            }

            const tailHead = edges.findIndex((e, i) => !accessedEdges[i] && pointEqual(edge[edge.length - 1], e[0]));
            if (tailHead !== -1) {
                accessedEdges[tailHead] = foundNew = true;
                edge.push(edges[tailHead][1]);
            }

            const tailTail = edges.findIndex((e, i) => !accessedEdges[i] && pointEqual(edge[edge.length - 1], e[1]));
            if (tailTail !== -1) {
                accessedEdges[tailTail] = foundNew = true;
                edge.push(edges[tailTail][0]);
            }
        }

        const newEdge: Point[] = [];
        let lastPoint: Point = edge[0];
        for (const point of edge) {
            if (newEdge.length < 2) {
                newEdge.push(point);
            } else {
                if (point.x === lastPoint.x || point.y === lastPoint.y) {
                    newEdge[newEdge.length - 1] = point;
                } else {
                    lastPoint = newEdge[newEdge.length - 1];
                    newEdge.push(point);
                }
            }
        }

        result.push(newEdge);
    }

    return result;
}

function pointEqual(a: Point, b: Point): boolean {
    return a.x === b.x && a.y === b.y;
}
