import { getState } from "../common";
import { ViewPoint, Zone } from "./definitions";
import { Province } from "../../src/previewdef/worldmap/definitions";
import { FEWorldMap } from "./loader";

export let viewPoint: ViewPoint;
export let canvasWidth: number;
export let canvasHeight: number;
export let hoverProvinceId: number | undefined;
export let mainCanvas: HTMLCanvasElement;

let backCanvas: HTMLCanvasElement;
let mapCanvas: HTMLCanvasElement;
let mainCanvasContext: CanvasRenderingContext2D;
let backCanvasContext: CanvasRenderingContext2D;
let mapCanvasContext: CanvasRenderingContext2D;
let topBarHeight: number;

let cursorX = 0;
let cursorY = 0;

let loader: typeof import('./loader');
let topBar: typeof import('./topBar');

export function init(theLoader: typeof import('./loader'), theTopBar: typeof import('./topBar')): void {
    topBar = theTopBar;
    loader = theLoader;
    viewPoint = getState().viewPoint || { x: 0, y: -topBar.height, scale: 1 };
    window.addEventListener('resize', resizeCanvas);
    topBarHeight = topBar.height;
    startCanvasRendering();
}

export function renderCanvas() {
    backCanvasContext.fillStyle = 'black';
    backCanvasContext.fillRect(0, 0, canvasWidth, canvasHeight);
    backCanvasContext.fillStyle = 'white';
    backCanvasContext.font = '12px sans-serif';
    backCanvasContext.textBaseline = 'top';
    if (loader.loading) {
        backCanvasContext.textAlign = 'start';
        backCanvasContext.fillText('Visualizing map data: ' + Math.round(loader.progress * 100) + '%', 10, 10 + topBarHeight);
    } else if (loader.provinceMap) {
        renderMap();
        backCanvasContext.drawImage(mapCanvas, 0, 0);
        if (hoverProvinceId !== undefined) {
            const province = loader.provinceMap.provinceDict[hoverProvinceId];
            if (province) {
                renderHoverProvince(province, loader.provinceMap);
                renderProvinceTooltip(province, loader.provinceMap);
            }
        }
    } else {
        backCanvasContext.textAlign = 'start';
        backCanvasContext.fillText(loader.progressText, 10, 10 + topBarHeight);
    }

    if (canvasWidth > 0 && canvasHeight > 0) {
        mainCanvasContext.drawImage(backCanvas, 0, 0);
    }
};

function startCanvasRendering() {
    mainCanvas = document.getElementById('main-canvas') as HTMLCanvasElement;
    mainCanvasContext = mainCanvas.getContext('2d')!;
    backCanvas = document.createElement('canvas');
    backCanvasContext = backCanvas.getContext('2d')!;
    mapCanvas = document.createElement('canvas');
    mapCanvasContext = mapCanvas.getContext('2d')!;
    registerCanvasEventHandlers(mainCanvas);
    resizeCanvas();
};

function resizeCanvas() {
    canvasWidth = mainCanvas.width = mapCanvas.width = backCanvas.width = window.innerWidth;
    canvasHeight = mainCanvas.height = mapCanvas.height = backCanvas.height = window.innerHeight;
    renderCanvas();
};

function bboxInView(bbox: Zone, xoffset: number) {
    const r = viewPoint.x + canvasWidth / viewPoint.scale;
    const b = viewPoint.y + canvasHeight / viewPoint.scale;
    const br = bbox.x + bbox.w;
    const bb = bbox.y + bbox.h;
    return r > bbox.x + xoffset && br + xoffset > viewPoint.x && b > bbox.y && bb > viewPoint.y;
}

function convertX(x: number) {
    return Math.round((x - viewPoint.x) * viewPoint.scale);
}

function convertY(y: number) {
    return Math.round((y - viewPoint.y) * viewPoint.scale);
}

function convertBackX(x: number) {
    return Math.floor(x / viewPoint.scale + viewPoint.x);
}

function convertBackY(y: number) {
    return Math.floor(y / viewPoint.scale + viewPoint.y);
}

function toColor(colorNum: number) {
    let colorString = Math.floor(colorNum).toString(16);
    while (colorString.length < 6) {
        colorString = '0' + colorString;
    }
    return '#' + colorString;
}

let oldMapState: any = undefined;
function renderMap() {
    if (!loader.provinceMap) {
        return;
    }

    const provinceMap = loader.provinceMap;
    const newMapState = {
        provinceMap,
        canvasWidth,
        canvasHeight,
        viewMode: topBar.viewMode,
        colorSet: topBar.colorSet,
        ...viewPoint,
    };

    // State not changed
    if (oldMapState !== undefined && Object.keys(newMapState).every(k => oldMapState[k] === (newMapState as any)[k])) {
        return;
    }
    oldMapState = newMapState;

    mapCanvasContext.fillStyle = 'black';
    mapCanvasContext.fillRect(0, 0, canvasWidth, canvasHeight);
    mapCanvasContext.font = '10px sans-serif';
    renderMapImpl(provinceMap, 0);
    renderMapImpl(provinceMap, provinceMap.width);
}

function renderMapImpl(provinceMap: FEWorldMap, xOffset: number) {
    const context = mapCanvasContext;
    const scale = viewPoint.scale;
    const renderedProvinces = [];

    for (let i = 0; i < provinceMap.provincesCount; i++) {
        const province = provinceMap.provinces[i];
        if (bboxInView(province.boundingBox, xOffset)) {
            const color = getColorByColorSet(province, provinceMap);
            context.fillStyle = toColor(color); // toColor(province.color);
            renderProvince(context, province, scale, xOffset);
            renderedProvinces.push(province);
        }
    }
    
    // Skip borderline and text
    if (viewPoint.scale <= 1) {
        return;
    }

    context.fillStyle = 'white';
    context.strokeStyle = 'black';
    context.textAlign = 'center';
    for (const province of renderedProvinces) {
        const bbox = province.boundingBox;
        context.fillText(province.id.toString(), convertX(bbox.x + bbox.w / 2 + xOffset), convertY(bbox.y + bbox.h / 2));
        
        // Skip borderline
        if (viewPoint.scale <= 2) {
            continue;
        }

        for (const paths of Object.values(province.edge)) {   
            for (const path of paths) {
                if (path.length === 0) {
                    continue;
                }

                context.beginPath();
                context.moveTo(convertX(path[0].x + xOffset), convertY(path[0].y));
                for (let j = 0; j < path.length; j++) {
                    if (viewPoint.scale <= 4 && j !== 0 && j !== path.length - 1 && j % (6 - viewPoint.scale) !== 0) {
                        continue;
                    }
                    const pos = path[j];
                    context.lineTo(convertX(pos.x + xOffset), convertY(pos.y));
                }
                context.stroke();
            }
        }
    }
}

function getColorByColorSet(province: Province, provinceMap: FEWorldMap): number {
    switch (topBar.colorSet) {
        case 'provincetype':
            return (province.type === 'land' ? 0x007F00 : province.type === 'lake' ? 0x00FFFF : 0x00007F) | (province.coastal ? 0x7F0000 : 0);
        case 'country':
            {
                const state = provinceMap.provinceToState[province.id];
                return state !== undefined ?
                    (provinceMap.countries.indexOf(provinceMap.stateDict[state].owner) + 1) * (0xFFFFFF / provinceMap.countries.length) : 0;
            }
        case 'terrain':
            return (provinceMap.terrains.indexOf(province.terrain) + 1) * (0xFFFFFF / provinceMap.terrains.length);
        case 'stateid':
            return (provinceMap.provinceToState[province.id] ?? 0) * (0xFFFFFF / provinceMap.statesCount);
        default:
            return province.color;
    }
}

function renderProvince(context: CanvasRenderingContext2D, province: Province, scale?: number, xOffset: number = 0): void {
    scale = scale ?? viewPoint.scale;
    for (const zone of province.coverZones) {
        context.fillRect(convertX(zone.x + xOffset), convertY(zone.y), zone.w * scale, zone.h * scale);
    }
}

function registerCanvasEventHandlers(mainCanvas: HTMLCanvasElement) {
    mainCanvas.addEventListener('mousemove', function(e) {
        cursorX = e.pageX;
        cursorY = e.pageY;

        if (!loader.provinceMap) {
            hoverProvinceId = undefined;
            renderCanvas();
            return;
        }

        const provinceMap = loader.provinceMap;
        let x = convertBackX(e.pageX);
        let y = convertBackY(e.pageY);
        if (x < 0) {
            x += provinceMap.width;
        }
        if (x >= provinceMap.width) {
            x -= provinceMap.width;
        }
        const index = y * provinceMap.width + x;
        hoverProvinceId = index < provinceMap.provinceId.length ? provinceMap.provinceId[index] : undefined;
        renderCanvas();
    });

    mainCanvas.addEventListener('mouseleave', function() {
        hoverProvinceId = undefined;
        renderCanvas();
    });
}

function renderHoverProvince(province: Province, provinceMap: FEWorldMap) {
    if (province) {
        backCanvasContext.fillStyle = 'rgba(255, 255, 255, 0.7)';
        renderProvince(backCanvasContext, province, viewPoint.scale, 0);
        renderProvince(backCanvasContext, province, viewPoint.scale, provinceMap.width);

        for (const adjecent of Object.keys(province.edge)) {
            const adjecentNumber = parseInt(adjecent);
            if (adjecentNumber === -1) {
                continue;
            }
            const adjecentProvince = provinceMap.provinceDict[adjecentNumber];
            if (adjecentProvince) {
                backCanvasContext.fillStyle = 'rgba(255, 255, 255, 0.3)';
                renderProvince(backCanvasContext, adjecentProvince, viewPoint.scale, 0);
                renderProvince(backCanvasContext, adjecentProvince, viewPoint.scale, provinceMap.width);
            }
        }
    }
}

function renderProvinceTooltip(province: Province, worldMap: FEWorldMap) {
    const state = worldMap.provinceToState[province.id];
    const stateObject = worldMap.stateDict[state];
    const text = `
Province=${province.id}
${state !== undefined ?
    `State=${state}\nOwner=${stateObject.owner}\nCore of=${stateObject.cores.join(',')}\nManpower=${stateObject.manpower}` :
    ''}
Type=${province.type}
Coastal=${province.coastal}
Terrain=${province.terrain}
Continent=${province.continent}
Adjecents=${Object.keys(province.edge).filter(e => parseInt(e) >= 0).join(',')}
${province.warnings.join('\n')}
${state !== undefined ? stateObject.warnings.join('\n') : ''}
`.trim().split(/\n|(.{40}[^,]{0,20},|.{60})/).filter(v => v);

    const fontSize = 12;
    let toolTipOffsetX = 10;
    let toolTipOffsetY = 10;
    const marginX = 10;
    const marginY = 10;
    const linePadding = 3;

    const width = text.map(t => backCanvasContext.measureText(t).width).reduce((p, c) => p > c ? p : c, 0);
    const height = fontSize * text.length + linePadding * (text.length - 1);

    if (cursorX + toolTipOffsetX + width + 2 * marginX > canvasWidth) {
        toolTipOffsetX = -10 - (width + 2 * marginX);
    }
    
    if (cursorY + toolTipOffsetY + height + 2 * marginY > canvasHeight) {
        toolTipOffsetY = -10 - (height + 2 * marginY);
    }

    backCanvasContext.font = `${fontSize}px sans-serif`;
    backCanvasContext.strokeStyle = '#7F7F7F';
    backCanvasContext.fillStyle = 'white';

    backCanvasContext.fillRect(cursorX + toolTipOffsetX, cursorY + toolTipOffsetY, width + 2 * marginX, height + 2 * marginY);
    backCanvasContext.strokeRect(cursorX + toolTipOffsetX, cursorY + toolTipOffsetY, width + 2 * marginX, height + 2 * marginY);

    backCanvasContext.fillStyle = 'black';
    text.forEach((t, i) => backCanvasContext.fillText(t, cursorX + toolTipOffsetX + marginX, cursorY + toolTipOffsetY + marginY + i * (fontSize + linePadding)));
}
