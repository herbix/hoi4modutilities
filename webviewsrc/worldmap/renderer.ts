import { Province, Point, State, Zone } from "../../src/previewdef/worldmap/definitions";
import { FEWorldMap, Loader } from "./loader";
import { ViewPoint } from "./viewpoint";
import { bboxCenter, distanceSqr } from "./graphutils";
import { TopBar, topBarHeight, ColorSet } from "./topbar";
import { asEvent, Subscriber } from "../util/event";

export class Renderer extends Subscriber {
    private canvasWidth: number = 0;
    private canvasHeight: number = 0;
    
    private backCanvas: HTMLCanvasElement;
    private mapCanvas: HTMLCanvasElement;
    private mainCanvasContext: CanvasRenderingContext2D;
    private backCanvasContext: CanvasRenderingContext2D;
    private mapCanvasContext: CanvasRenderingContext2D;
    
    private cursorX = 0;
    private cursorY = 0;

    constructor(private mainCanvas: HTMLCanvasElement, private viewPoint: ViewPoint, private loader: Loader, private topBar: TopBar) {
        super();

        this.subscriptions.push(asEvent(window, 'resize')(this.resizeCanvas));

        this.mainCanvasContext = this.mainCanvas.getContext('2d')!;
        this.backCanvas = document.createElement('canvas');
        this.backCanvasContext = this.backCanvas.getContext('2d')!;
        this.mapCanvas = document.createElement('canvas');
        this.mapCanvasContext = this.mapCanvas.getContext('2d')!;

        this.registerCanvasEventHandlers();
        this.resizeCanvas();

        this.subscriptions.push(loader.onMapChanged(this.renderCanvas));
        this.subscriptions.push(loader.onProgressChanged(this.renderCanvas));
        this.subscriptions.push(viewPoint.onChanged(this.renderCanvas));
        this.subscriptions.push(topBar.viewMode.onChange(this.renderCanvas));
        this.subscriptions.push(topBar.colorSet.onChange(this.renderCanvas));
        this.subscriptions.push(topBar.hoverProvinceId.onChange(this.renderCanvas));
        this.subscriptions.push(topBar.selectedProvinceId.onChange(this.renderCanvas));
        this.subscriptions.push(topBar.hoverStateId.onChange(this.renderCanvas));
        this.subscriptions.push(topBar.selectedStateId.onChange(this.renderCanvas));
    }

    public renderCanvas = () => {
        if (this.canvasWidth <= 0 && this.canvasHeight <= 0) {
            return;
        }

        const backCanvasContext = this.backCanvasContext;
    
        backCanvasContext.fillStyle = 'black';
        backCanvasContext.fillRect(0, 0, this.canvasWidth, this.canvasHeight);
        backCanvasContext.fillStyle = 'white';
        backCanvasContext.font = '12px sans-serif';
        backCanvasContext.textBaseline = 'top';
        if (this.loader.progressText !== '') {
            backCanvasContext.textAlign = 'start';
            backCanvasContext.fillText(this.loader.progressText, 10, 10 + topBarHeight);
        } else {
            this.renderMap();
            backCanvasContext.drawImage(this.mapCanvas, 0, 0);
            if (this.topBar.viewMode.value === 'province') {
                this.renderProvinceHoverSelection(this.loader.worldMap);
            } else if (this.topBar.viewMode.value === 'state') {
                this.renderStateHoverSelection(this.loader.worldMap);
            }
            if (this.loader.loading.value) {
                this.renderLoadingText();
            }
        }
    
        this.mainCanvasContext.drawImage(this.backCanvas, 0, 0);
    };
    
    private resizeCanvas = () => {
        this.canvasWidth = this.mainCanvas.width = this.mapCanvas.width = this.backCanvas.width = window.innerWidth;
        this.canvasHeight = this.mainCanvas.height = this.mapCanvas.height = this.backCanvas.height = window.innerHeight;
        this.renderCanvas();
    };

    private oldMapState: any = undefined;
    private renderMap() {
        const worldMap = this.loader.worldMap;
        const newMapState = {
            worldMap,
            canvasWidth: this.canvasWidth,
            canvasHeight: this.canvasHeight,
            viewMode: this.topBar.viewMode.value,
            colorSet: this.topBar.colorSet.value,
            ...this.viewPoint.toJson(),
        };

        // State not changed
        if (this.oldMapState !== undefined && Object.keys(newMapState).every(k => this.oldMapState[k] === (newMapState as any)[k])) {
            return;
        }
        this.oldMapState = newMapState;

        const mapCanvasContext = this.mapCanvasContext;
        mapCanvasContext.fillStyle = 'black';
        mapCanvasContext.fillRect(0, 0, this.canvasWidth, this.canvasHeight);

        const mapZone: Zone = { x: 0, y: 0, w: worldMap.width, h: worldMap.height };
        this.renderAllOffsets(mapZone, worldMap.width, xOffset => this.renderMapImpl(worldMap, xOffset));
    }

    private renderMapImpl(worldMap: FEWorldMap, xOffset: number) {
        const context = this.mapCanvasContext;
        const scale = this.viewPoint.scale;
        const renderedProvinces: Province[] = [];

        const provinceToState = worldMap.getProvinceToStateMap();
        worldMap.forEachProvince(province => {
            if (this.viewPoint.bboxInView(province.boundingBox, xOffset)) {
                const color = getColorByColorSet(this.topBar.colorSet.value, province, worldMap, provinceToState);
                context.fillStyle = toColor(color);
                this.renderProvince(context, province, scale, xOffset);
                renderedProvinces.push(province);
            }
        });
        
        const viewMode = this.topBar.viewMode.value;

        // Skip borderline and text when scale is small
        if (viewMode === 'province' && this.viewPoint.scale <= 2) {
            return;
        }

        if (this.viewPoint.scale < 1) {
            return;
        }

        for (const province of renderedProvinces) {
            this.renderEdges(provinceToState, province, renderedProvinces, context, xOffset);
        }

        context.font = '10px sans-serif';
        context.textAlign = 'center';
        if (viewMode === 'province') {
            for (const province of renderedProvinces) {
                const provinceColor = getColorByColorSet(this.topBar.colorSet.value, province, worldMap, provinceToState);
                context.fillStyle = toColor(getHighConstrastColor(provinceColor));
                const bbox = province.boundingBox;
                context.fillText(province.id.toString(), this.viewPoint.convertX(bbox.x + bbox.w / 2 + xOffset), this.viewPoint.convertY(bbox.y + bbox.h / 2));
            }
        } else if (viewMode === 'state') {
            const renderedStates: Record<number, boolean> = {};
            
            for (const province of renderedProvinces) {
                const stateId = provinceToState[province.id];
                if (stateId !== undefined && !renderedStates[stateId]) {
                    renderedStates[stateId] = true;
                    const state = worldMap.getStateById(stateId);
                    if (state) {
                        const provinceColor = getColorByColorSet(this.topBar.colorSet.value, province, worldMap, provinceToState);
                        context.fillStyle = toColor(getHighConstrastColor(provinceColor));
                        const bbox = state.boundingBox;
                        context.fillText(state.id.toString(), this.viewPoint.convertX(bbox.x + bbox.w / 2 + xOffset), this.viewPoint.convertY(bbox.y + bbox.h / 2));
                    }
                }
            }
        }
    }

    private renderEdges(provinceToState: Record<number, number | undefined>, province: Province, renderedProvinces: Province[], context: CanvasRenderingContext2D, xOffset: number) {
        const viewPoint = this.viewPoint;
        context.lineWidth = 2;
        for (const provinceEdge of province.edges) {
            if (!('path' in provinceEdge)) {
                continue;
            }

            if (provinceEdge.to > province.id) {
                continue;
            }

            const impassable = provinceEdge.type === 'impassable';
            const paths = provinceEdge.path;
            if (this.topBar.viewMode.value === 'state') {
                if (!impassable && paths.length > 0) {
                    if (provinceToState[provinceEdge.to] === provinceToState[province.id]) {
                        continue;
                    }
                }
            }

            context.strokeStyle = impassable ? 'red' : 'black';
            for (const path of paths) {
                if (path.length === 0) {
                    continue;
                }

                context.beginPath();
                context.moveTo(viewPoint.convertX(path[0].x + xOffset), viewPoint.convertY(path[0].y));
                for (let j = 0; j < path.length; j++) {
                    if (viewPoint.scale <= 4 && j !== 0 && j !== path.length - 1 && j % (6 - viewPoint.scale) !== 0) {
                        continue;
                    }
                    const pos = path[j];
                    context.lineTo(viewPoint.convertX(pos.x + xOffset), viewPoint.convertY(pos.y));
                }
                context.stroke();
            }

            if (paths.length === 0) {
                const toProvince = renderedProvinces.find(p => p.id === provinceEdge.to);
                const [startPoint, endPoint] = findNearestPoints(provinceEdge.start, provinceEdge.stop, province, toProvince);

                context.strokeStyle = 'red';
                context.beginPath();
                context.moveTo(viewPoint.convertX(startPoint.x + xOffset), viewPoint.convertY(startPoint.y));
                context.lineTo(viewPoint.convertX(endPoint.x + xOffset), viewPoint.convertY(endPoint.y));
                context.stroke();
            }
        }
    }

    private renderProvince(context: CanvasRenderingContext2D, province: Province, scale?: number, xOffset: number = 0): void {
        const viewPoint = this.viewPoint;
        scale = scale ?? viewPoint.scale;
        const renderPrecisionBase = 2;
        const renderPrecision = scale < 1 ? Math.pow(2, Math.floor(Math.log2((1 / scale))) + renderPrecisionBase) :
            scale <= renderPrecisionBase ? Math.pow(2, renderPrecisionBase + 1 - Math.round(scale)) :
            1;
        const renderPrecisionMask = renderPrecision - 1;
        const renderPrecisionOffset = (renderPrecision - 1) / 2;
        for (const zone of province.coverZones) {
            if (zone.w < renderPrecision) {
                if ((zone.x & renderPrecisionMask) === 0 && (zone.y & renderPrecisionMask) === 0) {
                    context.fillRect(
                        viewPoint.convertX(zone.x + xOffset - renderPrecisionOffset),
                        viewPoint.convertY(zone.y - renderPrecisionOffset),
                        renderPrecision * scale,
                        renderPrecision * scale);
                }
            } else {
                context.fillRect(
                    viewPoint.convertX(zone.x + xOffset - renderPrecisionOffset),
                    viewPoint.convertY(zone.y - renderPrecisionOffset),
                    zone.w * scale,
                    zone.h * scale);
            }
        }
    }

    private registerCanvasEventHandlers() {
        this.subscriptions.push(asEvent(this.mainCanvas, 'mousemove')((e) => {
            this.cursorX = e.pageX;
            this.cursorY = e.pageY;
            this.renderCanvas();
        }));
    }

    private renderHoverProvince(province: Province, worldMap: FEWorldMap, renderAdjacent: boolean = true) {
        const backCanvasContext = this.backCanvasContext;
        const viewPoint = this.viewPoint;
        backCanvasContext.fillStyle = 'rgba(255, 255, 255, 0.7)';
        this.renderAllOffsets(province.boundingBox, worldMap.width, xOffset =>
            this.renderProvince(backCanvasContext, province, viewPoint.scale, xOffset));

        if (!renderAdjacent) {
            return;
        }

        for (const adjecent of province.edges) {
            const adjecentNumber = adjecent.to;
            if (adjecentNumber === -1 || adjecent.type === 'impassable') {
                continue;
            }
            const adjecentProvince = worldMap.getProvinceById(adjecentNumber);
            if (adjecentProvince) {
                backCanvasContext.fillStyle = 'rgba(255, 255, 255, 0.3)';
                this.renderAllOffsets(adjecentProvince.boundingBox, worldMap.width, xOffset =>
                    this.renderProvince(backCanvasContext, adjecentProvince, viewPoint.scale, xOffset));
            }
        }
    }

    private renderSelectedProvince(province: Province, worldMap: FEWorldMap) {
        this.backCanvasContext.fillStyle = 'rgba(128, 255, 128, 0.7)';
        this.renderAllOffsets(province.boundingBox, worldMap.width, xOffset =>
            this.renderProvince(this.backCanvasContext, province, this.viewPoint.scale, xOffset));
    }

    private renderProvinceTooltip(province: Province, worldMap: FEWorldMap) {
        const stateObject = worldMap.getStateByProvinceId(province.id);

        this.renderTooltip(`
Province=${province.id}
${stateObject ?
    `State=${stateObject.id}\nOwner=${stateObject.owner}\nCore of=${stateObject.cores.join(',')}\nManpower=${stateObject.manpower}` :
    ''}
Type=${province.type}
Coastal=${province.coastal}
Terrain=${province.terrain}
Continent=${province.continent}
Adjecents=${province.edges.filter(e => e.type !== 'impassable' && e.to !== -1).map(e => e.to).join(',')}
${province.warnings.map(v => '|r|' + v).join('\n')}
${stateObject ? stateObject.warnings.map(v => '|r|' + v).join('\n') : ''}`);
    }

    private renderLoadingText() {
        const backCanvasContext = this.backCanvasContext;
        const text = 'Visualizing map data: ' + Math.round(this.loader.progress * 100) + '%';
        const mesurement = backCanvasContext.measureText(text);
        backCanvasContext.fillStyle = 'black';
        backCanvasContext.fillRect(0, topBarHeight, 20 + mesurement.width, 32);
        backCanvasContext.fillStyle = 'white';
        backCanvasContext.font = '12px sans-serif';
        backCanvasContext.textAlign = 'start';
        backCanvasContext.fillText(text, 10, 10 + topBarHeight);
    }

    private renderProvinceHoverSelection(worldMap: FEWorldMap) {
        if (this.topBar.selectedProvinceId.value !== undefined) {
            const province = worldMap.getProvinceById(this.topBar.selectedProvinceId.value);
            if (province) {
                this.renderSelectedProvince(province, worldMap);
            }
        }
        if (this.topBar.hoverProvinceId.value !== undefined) {
            const province = worldMap.getProvinceById(this.topBar.hoverProvinceId.value);
            if (province) {
                if (this.topBar.selectedProvinceId !== this.topBar.hoverProvinceId) {
                    this.renderHoverProvince(province, worldMap);
                }
                this.renderProvinceTooltip(province, worldMap);
            }
        }
    }

    private renderStateHoverSelection(worldMap: FEWorldMap) {
        if (this.topBar.selectedStateId.value !== undefined) {
            const state = worldMap.getStateById(this.topBar.selectedStateId.value);
            if (state) {
                for (const provinceId of state.provinces) {
                    const province = worldMap.getProvinceById(provinceId);
                    if (province) {
                        this.renderSelectedProvince(province, worldMap);
                    }
                }
            }
        }
        if (this.topBar.hoverStateId.value !== undefined) {
            const state = worldMap.getStateById(this.topBar.hoverStateId.value);
            if (state) {
                if (this.topBar.selectedStateId.value !== this.topBar.hoverStateId.value) {
                    for (const provinceId of state.provinces) {
                        const province = worldMap.getProvinceById(provinceId);
                        if (province) {
                            this.renderHoverProvince(province, worldMap, false);
                        }
                    }
                }
                this.renderStateTooltip(state);
            }
        }
    }

    private renderStateTooltip(state: State) {
        this.renderTooltip(`
${state.impassable ? '|r|Impassable' : ''}
State=${state.id}
Owner=${state.owner}
Core of=${state.cores.join(',')}
Manpower=${state.manpower}
Category=${state.category}
Provinces=${state.provinces.join(',')}
${state.warnings.map(v => '|r|' + v).join('\n')}`);
    }

    private renderTooltip(tooltip: string) {
        const backCanvasContext = this.backCanvasContext;
        const cursorX = this.cursorX;
        const cursorY = this.cursorY;

        const colorPrefix = /^\|r\|/;
        const regex = /(\n)|((?:\|r\|)?(?:.{40}[^,]{0,20},|.{60}))/g;
        const text = tooltip.trim()
            .split(regex)
            .map((v, i, a) => {
                if (!v?.trim() || colorPrefix.test(v)) {
                    return v;
                }
                for (let j = i - 1; j >= 0; j--) {
                    if (!a[j] || a[j] === '\n') {
                        return v;
                    }
                    const match = colorPrefix.exec(a[j]);
                    if (match) {
                        return match[0] + v;
                    }
                }
                return v;
            })
            .filter(v => v?.trim());

        const fontSize = 12;
        let toolTipOffsetX = 10;
        let toolTipOffsetY = 10;
        const marginX = 10;
        const marginY = 10;
        const linePadding = 3;

        const width = text.map(t => backCanvasContext.measureText(t).width).reduce((p, c) => p > c ? p : c, 0);
        const height = fontSize * text.length + linePadding * (text.length - 1);

        if (cursorX + toolTipOffsetX + width + 2 * marginX > this.canvasWidth) {
            toolTipOffsetX = -10 - (width + 2 * marginX);
        }
        
        if (cursorY + toolTipOffsetY + height + 2 * marginY > this.canvasHeight) {
            toolTipOffsetY = -10 - (height + 2 * marginY);
        }

        backCanvasContext.font = `${fontSize}px sans-serif`;
        backCanvasContext.strokeStyle = '#7F7F7F';
        backCanvasContext.fillStyle = 'white';

        backCanvasContext.fillRect(cursorX + toolTipOffsetX, cursorY + toolTipOffsetY, width + 2 * marginX, height + 2 * marginY);
        backCanvasContext.strokeRect(cursorX + toolTipOffsetX, cursorY + toolTipOffsetY, width + 2 * marginX, height + 2 * marginY);

        text.forEach((t, i) => {
            backCanvasContext.fillStyle = 'black';
            if (t.startsWith('|r|')) {
                backCanvasContext.fillStyle = 'red';
                t = t.substr(3);
            }
            t = t.trim();
            backCanvasContext.fillText(t, cursorX + toolTipOffsetX + marginX, cursorY + toolTipOffsetY + marginY + i * (fontSize + linePadding));
        });
    }

    private renderAllOffsets(boundingBox: Zone, step: number, callback: (xOffset: number) => void, minimalRenderCount: number = 1) {
        let xOffset = 0;
        let i = 0;
        let inView = this.viewPoint.bboxInView(boundingBox, xOffset);
        while (inView || i < minimalRenderCount) {
            if (inView) {
                callback(xOffset);
            }
            if (step <= 0) {
                return;
            }
            xOffset += step;
            i++;
            inView = this.viewPoint.bboxInView(boundingBox, xOffset);
        }
    }
}

function toColor(colorNum: number) {
    let colorString = Math.floor(colorNum).toString(16);
    while (colorString.length < 6) {
        colorString = '0' + colorString;
    }
    return '#' + colorString;
}

function findNearestPoints(start: Point | undefined, end: Point | undefined, a: Province, b: Province | undefined): [Point, Point] {
    if (start && end) { return [start, end]; }
    if (!b) { return [bboxCenter(a.boundingBox), bboxCenter(a.boundingBox)]; };
    if (!start) { const t = start, u = a; start = end; a = b; end = t; b = u; }
    if (!start) {
        let nearestPair: [Point, Point] | undefined = undefined;
        let nearestPairDistance = 1e10;
        for (const ape of a.edges) {
            for (const ap of ape.path) {
                for (const app of ap) {
                    for (const bpe of b.edges) {
                        for (const bp of bpe.path) {
                            for (const bpp of bp) {
                                const disSqr = distanceSqr(app, bpp);
                                if (disSqr < nearestPairDistance) {
                                    nearestPairDistance = disSqr;
                                    nearestPair = [app, bpp];
                                }
                            }
                        }
                    }
                }
            }
        }
        return nearestPair ?? [bboxCenter(a.boundingBox), bboxCenter(a.boundingBox)];
    } else {
        let nearestPair: [Point, Point] | undefined = undefined;
        let nearestPairDistance = 1e10;
        for (const bpe of b.edges) {
            for (const bp of bpe.path) {
                for (const bpp of bp) {
                    const disSqr = distanceSqr(start, bpp);
                    if (disSqr < nearestPairDistance) {
                        nearestPairDistance = disSqr;
                        nearestPair = [start, bpp];
                    }
                }
            }
        }
        return nearestPair ?? [bboxCenter(a.boundingBox), bboxCenter(a.boundingBox)];
    }
}

function getColorByColorSet(colorSet: ColorSet, province: Province, worldMap: FEWorldMap, provinceToState: Record<number, number | undefined>): number {
    switch (colorSet) {
        case 'provincetype':
            return (province.type === 'land' ? 0x007F00 : province.type === 'lake' ? 0x00FFFF : 0x00007F) | (province.coastal ? 0x7F0000 : 0);
        case 'country':
            {
                const state = provinceToState[province.id];
                return state !== undefined ? (worldMap.countries.find(c => c.tag === worldMap.getStateById(state)?.owner)?.color ?? 0) : 0;
            }
        case 'terrain':
            return (worldMap.terrains.indexOf(province.terrain) + 1) * (0xFFFFFF / worldMap.terrains.length);
        case 'stateid':
            {
                const state = provinceToState[province.id];
                return (state === undefined || state < 0 ? 0 : state) * (0xFFFFFF / worldMap.statesCount);
            }
        case 'warnings':
            {
                const state = provinceToState[province.id];
                const isLand = province.type === 'land';
                return province.warnings.length > 0 || (state !== undefined && worldMap.getStateById(state)?.warnings?.length) ?
                    (isLand ? 0xE02020 : 0xC00000) :
                    (isLand ? 0x7FFF7F : 0x20E020);
            }
        case 'manpower':
            {
                const stateId = provinceToState[province.id];
                const state = stateId !== undefined ? worldMap.getStateById(stateId) : undefined;
                const value = manpowerHandler(state?.manpower ?? 0) / manpowerHandler(worldMap.maxManpower);
                return value < 0.5 ? (0xFF0000 | (Math.floor(255 * 2 * value) << 8)) : (0xFF00 | (Math.floor(255 * 2 * (1 - value)) << 16));
            }
        default:
            return province.color;
    }
}

function manpowerHandler(manpower: number): number {
    if (manpower < 0) {
        manpower = 0;
    }
    return Math.pow(manpower, 0.2);
    // return Math.log2(manpower + 1);
}

function getHighConstrastColor(color: number): number {
    const r = (color >> 16) & 0xFF;
    const g = (color >> 8) & 0xFF;
    const b = color & 0xFF;
    return r * 0.7 + g * 2 + b * 0.3 > 3 * 0x7F ? 0 : 0xFFFFFF;
}
