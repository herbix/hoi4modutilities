import { ProvinceMap, Province, Zone, Point, ProvinceEdge, Warning } from "../definitions";
import { readFileFromModOrHOI4AsJson, readFileFromModOrHOI4 } from "../../../util/fileloader";
import { parseBmp, BMP } from "../../../util/image/bmp/bmpparser";
import { arrayToMap } from "../../../util/common";
import { SchemaDef, Enum } from "../../../hoiformat/schema";
import { mergeBoundingBox } from "./common";

interface DefaultMap {
    definitions: string;
    provinces: string;
    adjacencies: string;
    continent: string;
}

const defaultMapSchema: SchemaDef<DefaultMap> = {
    definitions: 'string',
    provinces: 'string',
    adjacencies: 'string',
    continent: 'string',
};

type ProvinceDefinition = Omit<Province, 'boundingBox'>;

export async function loadProvinceMap(progressReporter: (progress: string) => Promise<void>): Promise<ProvinceMap> {
    await progressReporter('Loading default.map...');

    const defaultMap = await readFileFromModOrHOI4AsJson<DefaultMap>('map/default.map', defaultMapSchema);
    (['definitions', 'provinces', 'adjacencies', 'continent'] as (keyof DefaultMap)[]).forEach(field => {
        if (!defaultMap[field]) {
            throw new Error(`Field ${field} is not found in default.map.`);
        }
    });

    await progressReporter('Loading province bmp...');

    const [provinceMapImageBuffer] = await readFileFromModOrHOI4('map/' + defaultMap.provinces);
    const provinceMapImage = parseBmp(provinceMapImageBuffer.buffer);

    await progressReporter('Loading province definitions...');

    const [definitionsBuffer] = await readFileFromModOrHOI4('map/' + defaultMap.definitions);
    const definition = definitionsBuffer.toString().split(/(?:\r\n|\n|\r)/).map(line => line.split(/[,;]/)).filter(v => v.length >= 8);

    await progressReporter("Loading adjecencies...");

    const [adjecenciesBuffer] = await readFileFromModOrHOI4('map/' + defaultMap.adjacencies);
    const adjecencies = adjecenciesBuffer.toString().split(/(?:\r\n|\n|\r)/).map(line => line.split(/[,;]/)).filter((v, i) => i > 0 && v.length >= 9);

    await progressReporter("Loading continents...");

    const continents = ['', ...(await readFileFromModOrHOI4AsJson<{ continents: Enum }>('map/' + defaultMap.continent, { continents: 'enum' })).continents._values];

    if (provinceMapImage.bitsPerPixel !== 24) {
        throw new Error('provinces bmp must be 24 bits per pixel.');
    }

    if (provinceMapImage.width % 256 !== 0 || provinceMapImage.height % 256 !== 0) {
        throw new Error('Width and height of provinces bmp must be multiply of 256.');
    }

    const provinces = definition.map<ProvinceDefinition>(row => convertRowToProvince(row, continents));

    await progressReporter('Mapping province definitions to bmp...');

    const warnings: Warning[] = [];
    const { provinceIdByPosition, badProvinceId: notDefinedProvinceId } = getProvincesByPosition(provinceMapImage, provinces, warnings);

    await progressReporter('Calculating province region...');

    const width = provinceMapImage.width;
    const height = provinceMapImage.height;
    const { sortedProvinces, badProvinceId } = sortProvinces(provinces, notDefinedProvinceId, warnings);
    const filledProvinces: (Province | undefined)[] = fillProvinceZones(sortedProvinces, provinceIdByPosition, width, height, warnings);

    validateProvince(filledProvinces, provinceIdByPosition, width, height);

    await progressReporter('Calculating province edges...');

    fillEdges(filledProvinces, provinceIdByPosition, width, height);
    fillAdjacencyEdges(filledProvinces, adjecencies, height, warnings);

    return {
        width,
        height,
        provinceId: provinceIdByPosition,
        provinces: filledProvinces,
        badProvincesCount: badProvinceId + 1,
        continents,
        warnings,
    };
}

function convertRowToProvince(row: string[], continents: string[]): ProvinceDefinition {
    const r = parseInt(row[1]);
    const g = parseInt(row[2]);
    const b = parseInt(row[3]);
    const type = row[4];
    const continent = parseInt(row[7]);
    const warnings: string[] = [];
    if (continent >= continents.length || continent < 0) {
        warnings.push(`Continent ${continent} not defined.`);
    }
    if (type === 'land' && (continent === 0 || isNaN(continent))) {
        warnings.push(`Land province must belong to a continent.`);
    }
    return {
        id: parseInt(row[0]),
        color: (r << 16) | (g << 8) | b,
        coverZones: [],
        edges: [],
        type,
        coastal: row[5].trim().toLowerCase() === 'true',
        terrain: row[6],
        continent,
        warnings,
    };
}

function getProvincesByPosition(provinceMapImage: BMP, provinces: ProvinceDefinition[], warnings: Warning[]): { provinceIdByPosition: number[], badProvinceId: number } {
    const colorToProvince = arrayToMap(provinces, 'color');
    const provinceIdByPosition: number[] = new Array(provinceMapImage.width * provinceMapImage.height);
    const bitmapData = provinceMapImage.data;
    const badColors: Record<number, number> = {};
    let badProvinceId = -1;

    for (let y = provinceMapImage.height - 1, sy = 0, dy = (provinceMapImage.height - 1) * provinceMapImage.width;
        y >= 0;
        y--, sy += provinceMapImage.bytesPerRow, dy -= provinceMapImage.width) {
        for (let x = 0, sx = sy, dx = dy; x < provinceMapImage.width; x++, sx += 3, dx++) {
            const color = (bitmapData[sx + 2] << 16) | (bitmapData[sx + 1] << 8) | bitmapData[sx];
            const province = colorToProvince[color];
            if (province === undefined) {
                if (badColors[color] === undefined) {
                    warnings.push({
                        type: 'province',
                        sourceId: badProvinceId,
                        text: `Color (${bitmapData[sx + 2]}, ${bitmapData[sx + 1]}, ${bitmapData[sx]}) in provinces bmp (${x}, ${y}) not exist in definitions.`,
                    });
                    provinces[badProvinceId] = {
                        id: badProvinceId,
                        color,
                        coverZones: [],
                        edges: [],
                        type: '',
                        coastal: false,
                        terrain: '',
                        continent: -1,
                        warnings: [`The province don't exist in definition.`],
                    };

                    badColors[color] = badProvinceId--;
                }
                provinceIdByPosition[dx] = badColors[color];
            } else {
                provinceIdByPosition[dx] = province.id;
            }
        }
    }

    return {
        provinceIdByPosition,
        badProvinceId,
    };
}

function fillProvinceZones<T extends ProvinceDefinition>(
    provinces: (T & { boundingBox?: Zone } | undefined)[],
    provinceIdByPosition: number[],
    width: number,
    height: number,
    warnings: Warning[],
): (T & { boundingBox: Zone } | undefined)[] {
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
        const provinceId = provinceIdByPosition[t * width + l];
        let sameColor = true;
        for (let y = t, yi = t * width; y < b; y++, yi += width) {
            for (let x = l, xi = yi + l; x < r; x++, xi++) {
                if (provinceIdByPosition[xi] !== provinceId) {
                    sameColor = false;
                    break;
                }
            }
        }

        if (sameColor) {
            provinces[provinceId]!.coverZones.push(block);
        } else {
            const blockSize = block.w >> 1;
            blockStack.push({ ...block, w: blockSize, h: blockSize });
            blockStack.push({ ...block, x: block.x + blockSize, w: blockSize, h: blockSize });
            blockStack.push({ ...block, y: block.y + blockSize, w: blockSize, h: blockSize });
            blockStack.push({ x: block.x + blockSize, y: block.y + blockSize, w: blockSize, h: blockSize });
        }
    }

    for (const province of provinces) {
        if (!province) {
            continue;
        }
        if (province.coverZones.length > 0) {
            province.boundingBox = province.coverZones.reduce((p, c) => mergeBoundingBox(p, c, width));
            if (province.boundingBox.w > width / 2 || province.boundingBox.h > height / 2) {
                province.warnings.push(`The province is too large: ${province.boundingBox.w}x${province.boundingBox.h}`);
            }
        } else {
            if (province.id > 0) {
                warnings.push({
                    type: 'province',
                    sourceId: province.id,
                    text: `Province ${province.id} doesn't exist on map.`
                });
            }
            province.boundingBox = { x: 0, y: 0, w: 0, h: 0 };
        }
    }

    return provinces as (T & { boundingBox: Zone } | undefined)[];
}

function sortProvinces(provinces: ProvinceDefinition[], badProvinceId: number, warnings: Warning[]): { sortedProvinces: (ProvinceDefinition | undefined)[], badProvinceId: number } {
    const maxProvinceId = provinces.reduce((p, c) => c.id > p ? c.id : p, 0);
    if (maxProvinceId > 200000) {
        throw new Error(`Max province id is too large: ${maxProvinceId}.`);
    }

    const result: ProvinceDefinition[] = new Array(maxProvinceId + 1);
    provinces.forEach(p => {
        if (result[p.id]) {
            warnings.push({
                type: 'province',
                sourceId: badProvinceId,
                text: `There're more than one rows for province id ${p.id}.`,
            });
            p.warnings.push(`Original province id ${p.id} conflict with other provinces.`);
            p.id = badProvinceId--;
        }
        result[p.id] = p;
    });
    for (let i = 1; i < maxProvinceId; i++) {
        if (!result[i]) {
            warnings.push({
                type: 'province',
                sourceId: i,
                text: `Province with id ${i} doesn't exist.`,
            });
        }
    };

    return {
        sortedProvinces: result,
        badProvinceId,
    };
}

function fillEdges(provinces: (Province | undefined)[], provinceIdByPosition: number[], width: number, height: number): void {
    const accessedPixels = new Array<boolean>(provinceIdByPosition.length).fill(false);

    for (let y = 0, yi = 0; y < height; y++, yi += width) {
        for (let x = 0, xi = yi; x < width; x++, xi++) {
            if (accessedPixels[xi]) {
                continue;
            }

            fillEdgesOfProvince(xi, provinces, provinceIdByPosition, accessedPixels, width, height);
        }
    }
}

function fillEdgesOfProvince(
    index: number, provinces: (Province | undefined)[], provinceIdByPosition: number[],
    accessedPixels: boolean[], width: number, height: number
): void {
    const provinceId = provinceIdByPosition[index];
    const edgePixels = findEdgePixels(index, accessedPixels, provinceId, provinceIdByPosition, width, height);
    const edgePixelsByAdjecentProvince: Record<number, [Point, Point][]> = {};
    edgePixels.forEach(([p, line]) => {
        let lines = edgePixelsByAdjecentProvince[p];
        if (lines === undefined) {
            edgePixelsByAdjecentProvince[p] = lines = [];
        }
        lines.push(line);
    });

    const province = provinces[provinceId]!;
    for (const [key, value] of Object.entries(edgePixelsByAdjecentProvince)) {
        const numKey = parseInt(key);
        const edgeSetIndex = province.edges.findIndex(e => e.to === numKey);
        const edgeSet = edgeSetIndex !== -1 ? province.edges[edgeSetIndex] : { to: numKey, path: [], type: '' };
        const concatedEdges = concatEdges(value);
        edgeSet.path.push(...concatedEdges);
        if (edgeSetIndex === -1) {
            province.edges.push(edgeSet);
        }
    }
}

const indicesToOffset: [number, number][][] = [
    [[0, 1], [0, 0]],
    [[0, 0], [1, 0]],
    [[1, 0], [1, 1]],
    [[1, 1], [0, 1]],
];
function findEdgePixels(index: number, accessedPixels: boolean[], provinceId: number, provinceIdByPosition: number[], width: number, height: number) {
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
                const adjecentProvinceId = provinceIdByPosition[adjecentIndex];
                if (provinceId !== adjecentProvinceId) {
                    edgePixels.push([adjecentProvinceId, indicesToOffset[i].map(([xOff, yOff]) => ({ x: x + xOff, y: y + yOff })) as [Point, Point]]);
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

function fillAdjacencyEdges(provinces: (Province | undefined)[], adjacencies: string[][], height: number, warnings: Warning[]) {
    for (const adjacency of adjacencies) {
        const from = parseInt(adjacency[0]);
        const to = parseInt(adjacency[1]);
        const type = adjacency[2];
        const through = parseInt(adjacency[3]);
        const startX = parseInt(adjacency[4]);
        const startY = parseInt(adjacency[5]);
        const stopX = parseInt(adjacency[6]);
        const stopY = parseInt(adjacency[7]);
        const rule = adjacency[8];
        // const comments = adjecency[9];

        if (from === -1 || to === -1) {
            continue;
        }

        if (!provinces[from] || !provinces[to]) {
            warnings.push({
                type: 'province',
                sourceId: from,
                text: `Adjacency not from or to an existing province: ${adjacency[0]},${adjacency[1]}`,
            });
            continue;
        }

        const resultThrough = !isNaN(through) && through !== -1 ? through : undefined;
        if (resultThrough && !provinces[resultThrough]) {
            warnings.push({
                type: 'province',
                sourceId: resultThrough,
                text: `Adjacency not through an existing province: ${adjacency[3]}`,
            });
            continue;
        }

        const start: Point | undefined = !isNaN(startX) && !isNaN(startY) && startX !== -1 && startY !== -1 ? { x: startX, y: height - startY } : undefined;
        const stop: Point | undefined = !isNaN(stopX) && !isNaN(stopY) && stopX !== -1 && stopY !== -1 ? { x: stopX, y: height - stopY } : undefined;

        const existingEdgeInFrom = provinces[from]!.edges.find(e => e.to === to);
        if (existingEdgeInFrom) {
            Object.assign<ProvinceEdge, Partial<ProvinceEdge>>(existingEdgeInFrom, { through: resultThrough, start, stop, rule, type });
        } else {
            provinces[from]!.edges.push({ to, through: resultThrough, start, stop, rule, type, path: [] });
        }
        
        const existingEdgeInTo = provinces[to]!.edges.find(e => e.to === from);
        if (existingEdgeInTo) {
            Object.assign<ProvinceEdge, Partial<ProvinceEdge>>(existingEdgeInTo, { through: resultThrough, start, stop, rule, type });
        } else {
            provinces[to]!.edges.push({ to: from, through: resultThrough, start: stop, stop: start, rule, type, path: [] });
        }
    }
}

function validateProvince(provinces: (Province | undefined)[], provinceIdByPosition: number[], width: number, height: number) {
    const i = new Array(4);
    for (let y = 1, y0 = width, index = width; y < height; y++, y0 += width) {
        for (let x = 0; x < width; x++, index++) {
            i[0] = index;
            i[1] = index + (x === width - 1 ? -width : 0) + 1;
            i[2] = i[0] - width;
            i[3] = i[1] - width;
            i.forEach((v, i0) => {
                i[i0] = provinceIdByPosition[v];
            });
            if (i[0] !== i[1] && i[0] !== i[2] && i[0] !== i[3] && i[1] !== i[2] && i[1] !== i[3] && i[2] !== i[3]) {
                const provinceIds = i.filter((v, i, a) => a.indexOf(v) === i);
                for (const provinceId of provinceIds) {
                    const province = provinces[provinceId];
                    if (province) {
                        province.warnings.push(`Unclear border between provinces: ${provinceIds.join(',')}.`);
                    }
                }
            }
        }
    }
}
