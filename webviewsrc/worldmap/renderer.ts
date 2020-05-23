import { Province, Point, State, Zone, Terrain } from "../../src/previewdef/worldmap/definitions";
import { FEWorldMap, Loader } from "./loader";
import { ViewPoint } from "./viewpoint";
import { bboxCenter, distanceSqr, distanceHamming } from "./graphutils";
import { TopBar, topBarHeight, ColorSet } from "./topbar";
import { asEvent, Subscriber } from "../util/event";
import { arrayToMap } from "../util/common";
import { feLocalize } from "../util/i18n";

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

        this.renderMap();
        backCanvasContext.drawImage(this.mapCanvas, 0, 0);
        if (this.topBar.viewMode.value === 'province') {
            this.renderProvinceHoverSelection(this.loader.worldMap);
        } else if (this.topBar.viewMode.value === 'state') {
            this.renderStateHoverSelection(this.loader.worldMap);
        }
        if (this.loader.progressText !== '') {
            this.renderLoadingText(this.loader.progressText);
        } else if (this.loader.loading.value) {
            this.renderLoadingText(feLocalize('worldmap.progress.visualizing', 'Visualizing map data: {0}', Math.round(this.loader.progress * 100) + '%'));
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
        const extraState: [any] = [undefined];
        worldMap.forEachProvince(province => {
            if (this.viewPoint.bboxInView(province.boundingBox, xOffset)) {
                const color = getColorByColorSet(this.topBar.colorSet.value, province, worldMap, provinceToState, extraState);
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
            this.renderEdges(provinceToState, province, renderedProvinces, worldMap, context, xOffset);
        }

        context.font = '10px sans-serif';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        if (viewMode === 'province') {
            for (const province of renderedProvinces) {
                const provinceColor = getColorByColorSet(this.topBar.colorSet.value, province, worldMap, provinceToState, extraState);
                context.fillStyle = toColor(getHighConstrastColor(provinceColor));
                const labelPosition = getCOG(province.coverZones);
                context.fillText(province.id.toString(), this.viewPoint.convertX(labelPosition.x + xOffset), this.viewPoint.convertY(labelPosition.y));
            }
        } else if (viewMode === 'state') {
            const renderedStates: Record<number, boolean> = {};
            
            for (const province of renderedProvinces) {
                const stateId = provinceToState[province.id];
                if (stateId !== undefined && !renderedStates[stateId]) {
                    renderedStates[stateId] = true;
                    const state = worldMap.getStateById(stateId);
                    if (state) {
                        const provinceColor = getColorByColorSet(this.topBar.colorSet.value, province, worldMap, provinceToState, extraState);
                        context.fillStyle = toColor(getHighConstrastColor(provinceColor));
                        const labelPosition = getCOG(state.provinces.map(worldMap.getProvinceById, worldMap).reduce<Zone[]>((p, c) => c ? p.concat(c.coverZones) : p, []));
                        context.fillText(state.id.toString(), this.viewPoint.convertX(labelPosition.x + xOffset), this.viewPoint.convertY(labelPosition.y));
                    }
                }
            }
        }
    }

    private renderEdges(provinceToState: Record<number, number | undefined>, province: Province, renderedProvinces: Province[], worldMap: FEWorldMap, context: CanvasRenderingContext2D, xOffset: number) {
        const viewPoint = this.viewPoint;
        context.lineWidth = 2;
        for (const provinceEdge of province.edges) {
            if (!('path' in provinceEdge)) {
                continue;
            }

            if (provinceEdge.to > province.id) {
                continue;
            }

            const stateFromId = provinceToState[province.id];
            const stateToId = provinceToState[provinceEdge.to];

            const impassable = provinceEdge.type === 'impassable';
            const paths = provinceEdge.path;
            if (this.topBar.viewMode.value === 'state') {
                if (!impassable && paths.length > 0) {
                    if (stateFromId === stateToId) {
                        continue;
                    }
                }
            }

            const stateFromImpassable = worldMap.getStateById(stateFromId)?.impassable ?? false;
            const stateToImpassable = worldMap.getStateById(stateToId)?.impassable ?? false;

            context.strokeStyle = impassable || stateFromImpassable !== stateToImpassable ? 'red' : 'black';
            for (const path of paths) {
                if (path.length === 0) {
                    continue;
                }

                context.beginPath();
                context.moveTo(viewPoint.convertX(path[0].x + xOffset), viewPoint.convertY(path[0].y));
                for (let j = 0; j < path.length; j++) {
                    if (viewPoint.scale <= 4 && j % (6 - viewPoint.scale) !== 0 && !isCriticalPoint(path, j)) {
                        continue;
                    }
                    const pos = path[j];
                    context.lineTo(viewPoint.convertX(pos.x + xOffset), viewPoint.convertY(pos.y));
                }
                context.stroke();
            }

            if (paths.length === 0 && provinceEdge.type !== 'impassable') {
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
        const vp = stateObject?.victoryPoints[province.id];

        this.renderTooltip(`
${stateObject?.impassable ? '|r|' + feLocalize('worldmap.tooltip.impassable', 'Impassable') : ''}
${feLocalize('worldmap.tooltip.province', 'Province')}=${province.id}
${vp ? `${feLocalize('worldmap.tooltip.victorypoint', 'Victory point')}=${vp}` : ''}
${stateObject ?
    `
${feLocalize('worldmap.tooltip.state', 'State')}=${stateObject.id}
${feLocalize('worldmap.tooltip.owner', 'Owner')}=${stateObject.owner}
${feLocalize('worldmap.tooltip.coreof', 'Core of')}=${stateObject.cores.join(',')}
${feLocalize('worldmap.tooltip.manpower', 'Manpower')}=${stateObject.manpower}` : ''}
${feLocalize('worldmap.tooltip.type', 'Type')}=${province.type}
${feLocalize('worldmap.tooltip.coastal', 'Coastal')}=${province.coastal}
${feLocalize('worldmap.tooltip.terrain', 'Terrain')}=${province.terrain}
${feLocalize('worldmap.tooltip.continent', 'Continent')}=${province.continent !== 0 ? `${worldMap.continents[province.continent]}(${province.continent})` : '0'}
${feLocalize('worldmap.tooltip.adjacencies', 'Adjecencies')}=${province.edges.filter(e => e.type !== 'impassable' && e.to !== -1).map(e => e.to).join(',')}
${worldMap.getProvinceWarnings(province, stateObject).map(v => '|r|' + v).join('\n')}`
        );
    }

    private renderLoadingText(text: string) {
        const backCanvasContext = this.backCanvasContext;
        const mesurement = backCanvasContext.measureText(text);
        backCanvasContext.fillStyle = 'black';
        backCanvasContext.fillRect(0, topBarHeight, 20 + mesurement.width, 32);
        backCanvasContext.fillStyle = 'white';
        backCanvasContext.font = '12px sans-serif';
        backCanvasContext.textAlign = 'start';
        backCanvasContext.textBaseline = 'top';
        backCanvasContext.fillText(text, 10, 10 + topBarHeight);
    }

    private renderProvinceHoverSelection(worldMap: FEWorldMap) {
        let province = worldMap.getProvinceById(this.topBar.selectedProvinceId.value);
        if (province) {
            this.renderSelectedProvince(province, worldMap);
        }
        province = worldMap.getProvinceById(this.topBar.hoverProvinceId.value);
        if (province) {
            if (this.topBar.selectedProvinceId !== this.topBar.hoverProvinceId) {
                this.renderHoverProvince(province, worldMap);
            }
            this.renderProvinceTooltip(province, worldMap);
        }
    }

    private renderStateHoverSelection(worldMap: FEWorldMap) {
        let state = worldMap.getStateById(this.topBar.selectedStateId.value);
        if (state) {
            for (const provinceId of state.provinces) {
                const province = worldMap.getProvinceById(provinceId);
                if (province) {
                    this.renderSelectedProvince(province, worldMap);
                }
            }
        }

        state = worldMap.getStateById(this.topBar.hoverStateId.value);
        if (state) {
            if (this.topBar.selectedStateId.value !== this.topBar.hoverStateId.value) {
                for (const provinceId of state.provinces) {
                    const province = worldMap.getProvinceById(provinceId);
                    if (province) {
                        this.renderHoverProvince(province, worldMap, false);
                    }
                }
            }
            this.renderStateTooltip(state, worldMap);
        }
    }

    private renderStateTooltip(state: State, worldMap: FEWorldMap) {
        this.renderTooltip(`
${state.impassable ? '|r|' + feLocalize('worldmap.tooltip.impassable', 'Impassable') : ''}
${feLocalize('worldmap.tooltip.state', 'State')}=${state.id}
${feLocalize('worldmap.tooltip.owner', 'Owner')}=${state.owner}
${feLocalize('worldmap.tooltip.coreof', 'Core of')}=${state.cores.join(',')}
${feLocalize('worldmap.tooltip.manpower', 'Manpower')}=${state.manpower}
${feLocalize('worldmap.tooltip.category', 'Category')}=${state.category}
${feLocalize('worldmap.tooltip.provinces', 'Provinces')}=${state.provinces.join(',')}
${worldMap.getStateWarnings(state).map(v => '|r|' + v).join('\n')}`);
    }

    private renderTooltip(tooltip: string) {
        const backCanvasContext = this.backCanvasContext;
        const cursorX = this.cursorX;
        const cursorY = this.cursorY;

        let mapX = this.viewPoint.convertBackX(cursorX);
        if (this.loader.worldMap.width > 0 && mapX >= this.loader.worldMap.width) {
            mapX -= this.loader.worldMap.width;
        }

        tooltip = `(${mapX}, ${this.viewPoint.convertBackY(cursorY)})\n` + tooltip;

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

        const fontSize = 14;
        let toolTipOffsetX = 10;
        let toolTipOffsetY = 10;
        const marginX = 10;
        const marginY = 10;
        const linePadding = 3;

        backCanvasContext.font = `${fontSize}px sans-serif`;
        const width = text.map(t => backCanvasContext.measureText(t).width).reduce((p, c) => p > c ? p : c, 0);
        const height = fontSize * text.length + linePadding * (text.length - 1);

        if (cursorX + toolTipOffsetX + width + 2 * marginX > this.canvasWidth) {
            toolTipOffsetX = -10 - (width + 2 * marginX);
        }
        
        if (cursorY + toolTipOffsetY + height + 2 * marginY > this.canvasHeight) {
            toolTipOffsetY = -10 - (height + 2 * marginY);
        }
        backCanvasContext.strokeStyle = '#7F7F7F';
        backCanvasContext.fillStyle = 'white';
        backCanvasContext.textBaseline = 'top';

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

function getColorByColorSet(colorSet: ColorSet, province: Province, worldMap: FEWorldMap, provinceToState: Record<number, number | undefined>, stateBox: [any]): number {
    switch (colorSet) {
        case 'provincetype':
            return (province.type === 'land' ? 0x007F00 : province.type === 'lake' ? 0x00FFFF : 0x00007F) | (province.coastal ? 0x7F0000 : 0);
        case 'country':
            {
                const stateId = provinceToState[province.id];
                return worldMap.countries.find(c => c.tag === worldMap.getStateById(stateId)?.owner)?.color ?? 0;
            }
        case 'terrain':
            if (stateBox[0] === undefined) {
                stateBox[0] = arrayToMap(worldMap.terrains, 'name');
            }
            return (stateBox[0] as Record<string, Terrain | undefined>)[province.terrain]?.color ?? 0;
        case 'continent':
            if (stateBox[0] === undefined) {
                let continent = 0;
                worldMap.forEachProvince(p => (p.continent > continent ? continent = p.continent : 0, false));
                stateBox[0] = avoidPowerOf2(continent + 1);
            }
            return valueAndMaxToColor(province.continent + 1, stateBox[0]);
        case 'stateid':
            {
                if (stateBox[0] === undefined) {
                    stateBox[0] = avoidPowerOf2(worldMap.statesCount);
                }
                const stateId = provinceToState[province.id];
                return valueAndMaxToColor(stateId === undefined || stateId < 0 ? 0 : stateId, stateBox[0]);
            }
        case 'warnings':
            {
                const stateId = provinceToState[province.id];
                const isLand = province.type === 'land';
                const state = worldMap.getStateById(stateId);
                return worldMap.getProvinceWarnings(province).length > 0 || (state !== undefined && worldMap.getStateWarnings(state)?.length) ?
                    (isLand ? 0xE02020 : 0xC00000) :
                    (isLand ? 0x7FFF7F : 0x20E020);
            }
        case 'manpower':
            {
                if (province.type === 'sea') {
                    return 0;
                }

                if (stateBox[0] === undefined) {
                    let maxManpower = 0;
                    worldMap.forEachState(state => (state.manpower > maxManpower ? maxManpower = state.manpower : 0, false));
                    stateBox[0] = maxManpower;
                }

                const stateId = provinceToState[province.id];
                const state = worldMap.getStateById(stateId);
                const value = manpowerHandler(state?.manpower ?? 0) / manpowerHandler(stateBox[0]);
                return valueToColorGYR(value);
            }
        case 'victorypoint':
            {
                if (stateBox[0] === undefined) {
                    let maxVictoryPoint = 0;
                    worldMap.forEachState(state => Object.values(state.victoryPoints).forEach(
                        vp => vp !== undefined && vp > maxVictoryPoint ? maxVictoryPoint = vp: 0));
                    stateBox[0] = maxVictoryPoint;
                }

                const stateId = provinceToState[province.id];
                const state = worldMap.getStateById(stateId);
                const value = victoryPointsHandler(state ? state.victoryPoints[province.id] ?? 0.1 : 0) / victoryPointsHandler(stateBox[0]);
                return valueToColorGreyScale(value);
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
}

function victoryPointsHandler(victoryPoints: number): number {
    if (victoryPoints < 0) {
        victoryPoints = 0;
    }
    return Math.pow(victoryPoints, 0.5);
}

function valueToColorRYG(value: number): number {
    return value < 0.5 ? (0xFF0000 | (Math.floor(255 * 2 * value) << 8)) : (0xFF00 | (Math.floor(255 * 2 * (1 - value)) << 16));
}

function valueToColorGYR(value: number): number {
    return value < 0.5 ? (0xFF00 | (Math.floor(255 * 2 * value) << 16)) : (0xFF0000 | (Math.floor(255 * 2 * (1 - value)) << 8));
}

function valueToColorBCG(value: number): number {
    return value < 0.5 ? (0xFF | (Math.floor(255 * 2 * value) << 8)) : (0xFF00 | Math.floor(255 * 2 * (1 - value)));
}

function valueToColorGreyScale(value: number): number {
    return Math.floor(value * 255) * 0x10101;
}

function valueAndMaxToColor(value: number, max: number): number {
    return Math.floor(value * (0xFFFFFF / max));
}

function getHighConstrastColor(color: number): number {
    const r = (color >> 16) & 0xFF;
    const g = (color >> 8) & 0xFF;
    const b = color & 0xFF;
    return r * 0.7 + g * 2 + b * 0.3 > 3 * 0x7F ? 0 : 0xFFFFFF;
}

function avoidPowerOf2(value: number): number {
    const v = Math.log2(value);
    if (v > 0 && (v >>> 0) === v) {
        return value + 1;
    }

    return value;
}

function isCriticalPoint(path: Point[], index: number): boolean {
    return index === 0 || index === path.length - 1 ||
        (distanceHamming(path[index], path[index - 1]) > 2 && distanceHamming(path[index], path[index + 1]) > 2);
}

function getCOG(zones: Zone[]): Point {
    let x = 0;
    let y = 0;
    let mass = 0;

    for (const zone of zones) {
        const zoneMass = zone.w * zone.h;
        mass += zoneMass;
        x += (zone.x + zone.w / 2) * zoneMass;
        y += (zone.y + zone.h / 2) * zoneMass;
    }

    return { x: x / mass, y: y / mass };
}
