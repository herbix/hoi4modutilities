import { Province, Point, State, Zone, Terrain, StrategicRegion, SupplyArea } from "../../src/previewdef/worldmap/definitions";
import { FEWorldMap, Loader } from "./loader";
import { ViewPoint } from "./viewpoint";
import { bboxCenter, distanceSqr, distanceHamming } from "./graphutils";
import { TopBar, topBarHeight, ColorSet, ViewMode } from "./topbar";
import { Subscriber } from "../util/event";
import { arrayToMap } from "../util/common";
import { feLocalize } from "../util/i18n";
import { chain, max, padStart } from "lodash";
import { combineLatest, fromEvent } from 'rxjs';
import { distinctUntilChanged } from 'rxjs/operators';

const renderScaleByViewMode: Record<ViewMode, { edge: number, labels: number }> = {
    province: { edge: 2, labels: 3 },
    state: { edge: 1, labels: 1 },
    strategicregion: { edge: 0.25, labels: 0.25 },
    supplyarea: { edge: 0.5, labels: 1 },
    warnings: { edge: 2, labels: 3 },
};

interface RenderContext {
    topBar: TopBar;
    viewPoint: ViewPoint;
    mapCanvasContext: CanvasRenderingContext2D;
    provinceToState: Record<number, number | undefined>;
    provinceToStrategicRegion: Record<number, number | undefined>;
    stateToSupplyArea: Record<number, number | undefined>;
    renderedProvincesByOffset: Record<number, Province[]>;
    renderedProvincesById: Record<number, Province>;
    renderedProvinces?: Province[];
    overwriteRenderPrecision?: number;
    preciseEdge?: boolean;
    extraState: any;
}

export class Renderer extends Subscriber {
    private canvasWidth: number = 0;
    private canvasHeight: number = 0;
    
    private backCanvas: HTMLCanvasElement;
    private mapCanvas: HTMLCanvasElement;
    private mainCanvasContext: CanvasRenderingContext2D;
    private backCanvasContext: CanvasRenderingContext2D;
    
    private cursorX = 0;
    private cursorY = 0;

    constructor(private mainCanvas: HTMLCanvasElement, private viewPoint: ViewPoint, private loader: Loader, private topBar: TopBar) {
        super();

        this.addSubscription(fromEvent(window, 'resize').subscribe(this.resizeCanvas));

        this.mainCanvasContext = this.mainCanvas.getContext('2d')!;
        this.backCanvas = document.createElement('canvas');
        this.backCanvasContext = this.backCanvas.getContext('2d')!;
        this.mapCanvas = document.createElement('canvas');

        this.registerCanvasEventHandlers();
        this.resizeCanvas();

        this.addSubscription(loader.worldMap$.subscribe(this.renderCanvas));
        this.addSubscription(
            combineLatest([
                loader.progress$,
                viewPoint.observable$,
                topBar.viewMode$,
                topBar.colorSet$,
                topBar.hoverProvinceId$,
                topBar.selectedProvinceId$,
                topBar.hoverStateId$,
                topBar.selectedStateId$,
                topBar.hoverStrategicRegionId$,
                topBar.selectedStrategicRegionId$,
                topBar.hoverSupplyAreaId$,
                topBar.selectedSupplyAreaId$,
                topBar.warningFilter.selectedValues$,
                topBar.display.selectedValues$,
            ]).pipe(
                distinctUntilChanged((x, y) => x.every((v, i) => v === y[i]))
            ).subscribe(this.renderCanvas)
        );
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

        const viewMode = this.topBar.viewMode$.value;
        switch (viewMode) {
            case 'province':
            case 'warnings':
                this.renderProvinceHoverSelection(this.loader.worldMap);
                break;
            case 'state':
                this.renderStateHoverSelection(this.loader.worldMap);
                break;
            case 'strategicregion':
                this.renderStrategicRegionHoverSelection(this.loader.worldMap);
                break;
            case 'supplyarea':
                this.renderSupplyAreaHoverSelection(this.loader.worldMap);
                break;
        }

        if (this.loader.progressText !== '') {
            this.renderLoadingText(this.loader.progressText);
        } else if (this.loader.loading$.value) {
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
        const displayOptions = this.topBar.display.selectedValues$.value;
        const newMapState = {
            worldMap,
            canvasWidth: this.canvasWidth,
            canvasHeight: this.canvasHeight,
            viewMode: this.topBar.viewMode$.value,
            colorSet: this.topBar.colorSet$.value,
            warningFilter: this.topBar.warningFilter.selectedValues$.value,
            edgeVisible: displayOptions.includes('edge'),
            labelVisible: displayOptions.includes('label'),
            adaptZooming: displayOptions.includes('adaptzooming'),
            fastRendering: displayOptions.includes('fastrending'),
            ...this.viewPoint.toJson(),
        };

        // State not changed
        if (this.oldMapState !== undefined && Object.keys(newMapState).every(k => this.oldMapState[k] === (newMapState as any)[k])) {
            return;
        }
        this.oldMapState = newMapState;
        Renderer.renderMapImpl(this.mapCanvas, this.topBar, this.viewPoint, worldMap,
            newMapState.fastRendering ? {} : { preciseEdge: true, overwriteRenderPrecision: 1 });
    }

    public static renderMapImpl(canvas: HTMLCanvasElement, topBar: TopBar, viewPoint: ViewPoint, worldMap: FEWorldMap, otherRenderContext?: Partial<RenderContext>) {
        const mapCanvasContext = canvas.getContext('2d')!;
        mapCanvasContext.fillStyle = 'black';
        mapCanvasContext.fillRect(0, 0, canvas.width, canvas.height);

        const renderContext: RenderContext = {
            topBar,
            viewPoint,
            mapCanvasContext,
            provinceToState: worldMap.getProvinceToStateMap(),
            provinceToStrategicRegion: worldMap.getProvinceToStrategicRegionMap(),
            stateToSupplyArea: worldMap.getStateToSupplyAreaMap(),
            renderedProvincesByOffset: {},
            renderedProvincesById: {},
            extraState: undefined,
            ...otherRenderContext,
        };

        const mapZone: Zone = { x: 0, y: 0, w: worldMap.width, h: worldMap.height };
        Renderer.renderAllOffsets(viewPoint, mapZone, worldMap.width, xOffset => Renderer.renderMapBackground(worldMap, xOffset, renderContext));

        renderContext.renderedProvinces = Object.values(renderContext.renderedProvincesById);
        Renderer.renderAllOffsets(viewPoint, mapZone, worldMap.width, xOffset => Renderer.renderMapForeground(worldMap, xOffset, renderContext));
    }

    private static renderMapBackground(worldMap: FEWorldMap, xOffset: number, renderContext: RenderContext) {
        const { mapCanvasContext: context, topBar, viewPoint, overwriteRenderPrecision } = renderContext;
        const scale = viewPoint.scale;
        const renderedProvinces = renderContext.renderedProvincesByOffset[xOffset] ?? [];
        const { renderedProvincesById } = renderContext;
        renderContext.renderedProvincesByOffset[xOffset] = renderedProvinces;
        const edgeVisible = Renderer.isEdgeVisible(topBar, viewPoint);

        worldMap.forEachProvince(province => {
            if (renderContext.viewPoint.bboxInView(province.boundingBox, xOffset)) {
                const color = getColorByColorSet(topBar.colorSet$.value, province, worldMap, renderContext);
                context.fillStyle = toColor(color);
                Renderer.renderProvince(viewPoint, context, province, scale, xOffset, overwriteRenderPrecision);
                renderedProvinces.push(province);
                renderedProvincesById[province.id] = province;
            }

            if (edgeVisible) {
                for (const edge of province.edges) {
                    if (edge.path.length > 0) {
                        continue;
                    }

                    const toProvince = worldMap.getProvinceById(edge.to);
                    if (!toProvince) {
                        continue;
                    }

                    const [startPoint, endPoint] = findNearestPoints(edge.start, edge.stop, province, toProvince);
                    if (renderContext.viewPoint.lineInView(startPoint, endPoint, xOffset)) {
                        if (!(province.id in renderedProvincesById)) {
                            renderedProvinces.push(province);
                            renderedProvincesById[province.id] = province;
                        }
                        if (!(edge.to in renderedProvincesById)) {
                            renderedProvinces.push(toProvince);
                            renderedProvincesById[edge.to] = toProvince;
                        }
                    }
                }
            }
        });
    }

    private static renderMapForeground(worldMap: FEWorldMap, xOffset: number, renderContext: RenderContext) {
        const { mapCanvasContext: context, topBar, viewPoint } = renderContext;

        if (Renderer.isEdgeVisible(topBar, viewPoint)) {
            Renderer.renderAllEdges(renderContext, worldMap, context, xOffset);
        }

        if (Renderer.isLabelVisible(topBar, viewPoint)) {
            Renderer.renderMapLabels(renderContext, worldMap, context, xOffset);
        }
    }

    private static isEdgeVisible(topBar: TopBar, viewPoint: ViewPoint) {
        if (topBar.display.selectedValues$.value.includes('adaptzooming')) {
            const viewMode = topBar.viewMode$.value;
            const renderScale = renderScaleByViewMode[viewMode];
            const scale = viewPoint.scale;
            return renderScale.edge <= scale && topBar.display.selectedValues$.value.includes('edge');
        }

        return topBar.display.selectedValues$.value.includes('edge');
    }

    private static isLabelVisible(topBar: TopBar, viewPoint: ViewPoint) {
        if (topBar.display.selectedValues$.value.includes('adaptzooming')) {
            const viewMode = topBar.viewMode$.value;
            const renderScale = renderScaleByViewMode[viewMode];
            const scale = viewPoint.scale;
            return renderScale.labels <= scale && topBar.display.selectedValues$.value.includes('label');
        }

        return topBar.display.selectedValues$.value.includes('label');
    }

    private isMouseHighlightVisible() {
        return this.topBar.display.selectedValues$.value.includes('mousehighlight');
    }

    private isTooltipVisible() {
        return this.topBar.display.selectedValues$.value.includes('tooltip');
    }

    private static renderAllEdges(renderContext: RenderContext, worldMap: FEWorldMap, context: CanvasRenderingContext2D, xOffset: number) {
        const renderedProvinces = renderContext.renderedProvincesByOffset[xOffset] ?? [];
        const preciseEdge = renderContext.preciseEdge;

        context.strokeStyle = 'black';
        context.beginPath();
        for (const province of renderedProvinces) {
            Renderer.renderEdges(renderContext, province, worldMap, context, xOffset, false, preciseEdge);
        }
        context.stroke();

        context.strokeStyle = 'red';
        context.beginPath();
        for (const province of renderedProvinces) {
            Renderer.renderEdges(renderContext, province, worldMap, context, xOffset, true, preciseEdge);
        }
        context.stroke();
    }

    private static renderMapLabels(renderContext: RenderContext, worldMap: FEWorldMap, context: CanvasRenderingContext2D, xOffset: number) {
        const { provinceToState, provinceToStrategicRegion, stateToSupplyArea, topBar, viewPoint } = renderContext;
        const renderedProvinces = renderContext.renderedProvincesByOffset[xOffset] ?? [];
        const viewMode = topBar.viewMode$.value;
        const colorSet = topBar.colorSet$.value;

        context.font = '10px sans-serif';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        if (viewMode === 'province' || viewMode === 'warnings') {
            for (const province of renderedProvinces) {
                const provinceColor = getColorByColorSet(colorSet, province, worldMap, renderContext);
                context.fillStyle = toColor(getHighConstrastColor(provinceColor));
                const labelPosition = province.centerOfMass;
                context.fillText(province.id.toString(), viewPoint.convertX(labelPosition.x + xOffset), viewPoint.convertY(labelPosition.y));
            }
        } else {
            const renderedRegions: Record<number, boolean> = {};
            const regionMap = viewMode === 'state' ? provinceToState : provinceToStrategicRegion;
            const getRegionById = viewMode === 'state' ? worldMap.getStateById : viewMode === 'supplyarea' ? worldMap.getSupplyAreaById : worldMap.getStrategicRegionById;

            for (const province of renderedProvinces) {
                const stateId = viewMode === 'supplyarea' ? provinceToState[province.id] : undefined;
                const regionId = viewMode === 'supplyarea' ? (stateId !== undefined ? stateToSupplyArea[stateId] : undefined) : regionMap[province.id];
                if (regionId !== undefined && !renderedRegions[regionId]) {
                    renderedRegions[regionId] = true;
                    const region = getRegionById(regionId);
                    if (region) {
                        const labelPosition = region.centerOfMass;
                        const provinceAtLabel = worldMap.getProvinceByPosition(labelPosition.x, labelPosition.y);
                        const provinceColor = getColorByColorSet(colorSet, provinceAtLabel ?? province, worldMap, renderContext);
                        context.fillStyle = toColor(getHighConstrastColor(provinceColor));
                        context.fillText(region.id.toString(), viewPoint.convertX(labelPosition.x + xOffset), viewPoint.convertY(labelPosition.y));
                    }
                }
            }
        }
    }

    private static renderEdges(
        renderContext: RenderContext,
        province: Province,
        worldMap: FEWorldMap,
        context: CanvasRenderingContext2D,
        xOffset: number,
        isRed: boolean,
        preciseEdge?: boolean,
    ) {
        const { provinceToState, provinceToStrategicRegion, stateToSupplyArea, renderedProvinces, topBar, viewPoint } = renderContext;
        const scale = viewPoint.scale;
        const viewMode = topBar.viewMode$.value;

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

            const stateFromImpassable = worldMap.getStateById(stateFromId)?.impassable ?? false;
            const stateToImpassable = worldMap.getStateById(stateToId)?.impassable ?? false;

            const impassable = provinceEdge.type === 'impassable' || stateFromImpassable !== stateToImpassable;
            const paths = provinceEdge.path;
            
            if ((impassable || (paths.length === 0 && provinceEdge.type !== 'impassable')) !== isRed) {
                continue;
            }

            const strategicRegionFromId = provinceToStrategicRegion[province.id];
            const strategicRegionToId = provinceToStrategicRegion[provinceEdge.to];

            if (!impassable && paths.length > 0) {
                if (viewMode === 'state') {
                    if (stateFromId === stateToId && (stateFromId !== undefined || strategicRegionFromId === strategicRegionToId)) {
                        continue;
                    }
                } else if (viewMode === 'strategicregion') {
                    if (strategicRegionFromId === strategicRegionToId) {
                        continue;
                    }
                } else if (viewMode === 'supplyarea') {
                    if ((stateFromId === stateToId && (stateFromId !== undefined || strategicRegionFromId === strategicRegionToId)) ||
                        (stateFromId !== undefined && stateToId !== undefined && stateToSupplyArea[stateFromId] === stateToSupplyArea[stateToId])
                        ) {
                        continue;
                    }
                }
            }

            for (const path of paths) {
                if (path.length === 0) {
                    continue;
                }

                context.moveTo(viewPoint.convertX(path[0].x + xOffset), viewPoint.convertY(path[0].y));
                for (let j = 0; j < path.length; j++) {
                    if (!preciseEdge && scale <= 4 && j % (scale < 1 ? Math.floor(10 / scale) : 6 - scale) !== 0 && !isCriticalPoint(path, j)) {
                        continue;
                    }
                    const pos = path[j];
                    context.lineTo(viewPoint.convertX(pos.x + xOffset), viewPoint.convertY(pos.y));
                }
            }

            if (paths.length === 0 && provinceEdge.type !== 'impassable') {
                const toProvince = renderedProvinces?.find(p => p.id === provinceEdge.to);
                const [startPoint, endPoint] = findNearestPoints(provinceEdge.start, provinceEdge.stop, province, toProvince);

                context.moveTo(viewPoint.convertX(startPoint.x + xOffset), viewPoint.convertY(startPoint.y));
                context.lineTo(viewPoint.convertX(endPoint.x + xOffset), viewPoint.convertY(endPoint.y));
            }
        }
    }

    private static renderProvince(
        viewPoint: ViewPoint,
        context: CanvasRenderingContext2D,
        province: Province,
        scale?: number,
        xOffset: number = 0,
        overwriteRenderPrecision?: number
    ): void {
        scale = scale ?? viewPoint.scale;
        const renderPrecisionBase = 2;
        const renderPrecision = 
            scale < 1 ? Math.pow(2, Math.floor(Math.log2((1 / scale))) + (overwriteRenderPrecision !== undefined ? 0 : renderPrecisionBase)) :
            overwriteRenderPrecision ?? (scale <= renderPrecisionBase ? Math.pow(2, renderPrecisionBase + 1 - Math.round(scale)) : 1);
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

    private renderProvince(context: CanvasRenderingContext2D, province: Province, scale?: number, xOffset: number = 0): void {
        Renderer.renderProvince(this.viewPoint, context, province, scale, xOffset);
    }

    private registerCanvasEventHandlers() {
        this.addSubscription(fromEvent<MouseEvent>(this.mainCanvas, 'mousemove').subscribe((e) => {
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
        const strategicRegion = worldMap.getStrategicRegionByProvinceId(province.id);
        const supplyArea = stateObject ? worldMap.getSupplyAreaByStateId(stateObject.id) : undefined;
        const vp = stateObject?.victoryPoints[province.id];

        this.renderTooltip(`
${stateObject?.impassable ? '|r|' + feLocalize('worldmap.tooltip.impassable', 'Impassable') : ''}
${feLocalize('worldmap.tooltip.province', 'Province')}=${province.id}
${vp ? `${feLocalize('worldmap.tooltip.victorypoint', 'Victory point')}=${vp}` : ''}
${stateObject ? `
${feLocalize('worldmap.tooltip.state', 'State')}=${stateObject.id}`: ''
}
${supplyArea ? `
${feLocalize('worldmap.tooltip.supplyarea', 'Supply area')}=${supplyArea.id}
` : ''}
${strategicRegion ? `
${feLocalize('worldmap.tooltip.strategicregion', 'Strategic region')}=${strategicRegion.id}
`: ''
}
${stateObject ? `
${feLocalize('worldmap.tooltip.owner', 'Owner')}=${stateObject.owner}
${feLocalize('worldmap.tooltip.coreof', 'Core of')}=${stateObject.cores.join(',')}
${feLocalize('worldmap.tooltip.manpower', 'Manpower')}=${toCommaDivideNumber(stateObject.manpower)}` : ''
}
${supplyArea ? `
${feLocalize('worldmap.tooltip.supplyvalue', 'Supply value')}=${supplyArea.value}
` : ''}
${feLocalize('worldmap.tooltip.type', 'Type')}=${province.type}
${feLocalize('worldmap.tooltip.terrain', 'Terrain')}=${province.terrain}
${strategicRegion && strategicRegion.navalTerrain ? `
${feLocalize('worldmap.tooltip.navalterrain', 'Naval terrain')}=${strategicRegion.navalTerrain}
`: ''
}
${feLocalize('worldmap.tooltip.coastal', 'Coastal')}=${province.coastal}
${feLocalize('worldmap.tooltip.continent', 'Continent')}=${province.continent !== 0 ? `${worldMap.continents[province.continent]}(${province.continent})` : '0'}
${feLocalize('worldmap.tooltip.adjacencies', 'Adjecencies')}=${province.edges.filter(e => e.type !== 'impassable' && e.to !== -1).map(e => e.to).join(',')}
${worldMap.getProvinceWarnings(province, stateObject, strategicRegion, supplyArea).map(v => '|r|' + v).join('\n')}`
        );
    }

    private renderLoadingText(text: string) {
        const backCanvasContext = this.backCanvasContext;
        backCanvasContext.font = '12px sans-serif';
        const mesurement = backCanvasContext.measureText(text);
        backCanvasContext.fillStyle = 'black';
        backCanvasContext.fillRect(0, topBarHeight, 20 + mesurement.width, 32);
        backCanvasContext.fillStyle = 'white';
        backCanvasContext.textAlign = 'start';
        backCanvasContext.textBaseline = 'top';
        backCanvasContext.fillText(text, 10, 10 + topBarHeight);
    }

    private renderProvinceHoverSelection(worldMap: FEWorldMap) {
        let province = worldMap.getProvinceById(this.topBar.selectedProvinceId$.value);
        if (province) {
            this.renderSelectedProvince(province, worldMap);
        }
        province = worldMap.getProvinceById(this.topBar.hoverProvinceId$.value);
        if (province) {
            if (this.topBar.selectedProvinceId$ !== this.topBar.hoverProvinceId$ && this.isMouseHighlightVisible()) {
                this.renderHoverProvince(province, worldMap);
            }
            if (this.isTooltipVisible()) {
                this.renderProvinceTooltip(province, worldMap);
            }
        }
    }

    private renderStateHoverSelection(worldMap: FEWorldMap) {
        const hover = worldMap.getStateById(this.topBar.hoverStateId$.value);
        this.renderHoverSelection(worldMap, hover, worldMap.getStateById(this.topBar.selectedStateId$.value));
        hover && this.isTooltipVisible() && this.renderStateTooltip(hover, worldMap);
    }

    private renderStrategicRegionHoverSelection(worldMap: FEWorldMap) {
        const hover = worldMap.getStrategicRegionById(this.topBar.hoverStrategicRegionId$.value);
        this.renderHoverSelection(worldMap, hover, worldMap.getStrategicRegionById(this.topBar.selectedStrategicRegionId$.value));
        hover && this.isTooltipVisible() && this.renderStrategicRegionTooltip(hover, worldMap);
    }

    private renderSupplyAreaHoverSelection(worldMap: FEWorldMap) {
        const hover = worldMap.getSupplyAreaById(this.topBar.hoverSupplyAreaId$.value);
        const selected = worldMap.getSupplyAreaById(this.topBar.selectedSupplyAreaId$.value);
        const toProvinces = (supplyArea: SupplyArea | undefined) => {
            return supplyArea ?
                {
                    provinces: chain(supplyArea.states)
                        .map(stateId => worldMap.getStateById(stateId)?.provinces)
                        .filter((v): v is number[] => !!v)
                        .flatten()
                        .value()
                } :
                undefined;
        };

        this.renderHoverSelection(worldMap, toProvinces(hover), toProvinces(selected));
        hover && this.isTooltipVisible() && this.renderSupplyAreaTooltip(hover, worldMap);
    }

    private renderHoverSelection(worldMap: FEWorldMap, hover: { provinces: number[] } | undefined, selected: { provinces: number[] } | undefined) {
        if (selected) {
            for (const provinceId of selected.provinces) {
                const province = worldMap.getProvinceById(provinceId);
                if (province) {
                    this.renderSelectedProvince(province, worldMap);
                }
            }
        }

        if (hover && this.isMouseHighlightVisible() && hover !== selected) {
            for (const provinceId of hover.provinces) {
                const province = worldMap.getProvinceById(provinceId);
                if (province) {
                    this.renderHoverProvince(province, worldMap, false);
                }
            }
        }
    }

    private renderStateTooltip(state: State, worldMap: FEWorldMap) {
        const supplyArea = worldMap.getSupplyAreaByStateId(state.id);
        this.renderTooltip(`
${state.impassable ? '|r|' + feLocalize('worldmap.tooltip.impassable', 'Impassable') : ''}
${feLocalize('worldmap.tooltip.state', 'State')}=${state.id}
${supplyArea ? `
${feLocalize('worldmap.tooltip.supplyarea', 'Supply area')}=${supplyArea.id}
` : ''}
${feLocalize('worldmap.tooltip.owner', 'Owner')}=${state.owner}
${feLocalize('worldmap.tooltip.coreof', 'Core of')}=${state.cores.join(',')}
${feLocalize('worldmap.tooltip.manpower', 'Manpower')}=${toCommaDivideNumber(state.manpower)}
${feLocalize('worldmap.tooltip.category', 'Category')}=${state.category}
${supplyArea ? `
${feLocalize('worldmap.tooltip.supplyvalue', 'Supply value')}=${supplyArea.value}
` : ''}
${feLocalize('worldmap.tooltip.provinces', 'Provinces')}=${state.provinces.join(',')}
${worldMap.getStateWarnings(state, supplyArea).map(v => '|r|' + v).join('\n')}`);
    }

    private renderStrategicRegionTooltip(strategicRegion: StrategicRegion, worldMap: FEWorldMap) {
        this.renderTooltip(`
${feLocalize('worldmap.tooltip.strategicregion', 'Strategic region')}=${strategicRegion.id}
${strategicRegion.navalTerrain ? `
${feLocalize('worldmap.tooltip.navalterrain', 'Naval terrain')}=${strategicRegion.navalTerrain}
`: ''
}
${feLocalize('worldmap.tooltip.provinces', 'Provinces')}=${strategicRegion.provinces.join(',')}
${worldMap.getStrategicRegionWarnings(strategicRegion).map(v => '|r|' + v).join('\n')}`);
    }

    private renderSupplyAreaTooltip(supplyArea: SupplyArea, worldMap: FEWorldMap) {
        this.renderTooltip(`
${feLocalize('worldmap.tooltip.supplyarea', 'Supply area')}=${supplyArea.id}
${feLocalize('worldmap.tooltip.supplyvalue', 'Supply value')}=${supplyArea.value}
${feLocalize('worldmap.tooltip.states', 'States')}=${supplyArea.states.join(',')}
${worldMap.getSupplyAreaWarnings(supplyArea).map(v => '|r|' + v).join('\n')}`);
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
        const regex = /(\n)|((?:\|r\|)?(?:.{40,59}[, ]|.{60}))/g;
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
        const width = max(text.map(t => backCanvasContext.measureText(t).width)) ?? 0;
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

    private static renderAllOffsets(viewPoint: ViewPoint, boundingBox: Zone, step: number, callback: (xOffset: number) => void, minimalRenderCount: number = 1) {
        let xOffset = 0;
        let i = 0;
        let inView = viewPoint.bboxInView(boundingBox, xOffset);
        while (inView || i < minimalRenderCount) {
            if (inView) {
                callback(xOffset);
            }
            if (step <= 0) {
                return;
            }
            xOffset += step;
            i++;
            inView = viewPoint.bboxInView(boundingBox, xOffset);
        }
    }

    private renderAllOffsets(boundingBox: Zone, step: number, callback: (xOffset: number) => void, minimalRenderCount: number = 1) {
        Renderer.renderAllOffsets(this.viewPoint, boundingBox, step, callback, minimalRenderCount);
    }
}

function toColor(colorNum: number) {
    return '#' + padStart(colorNum.toString(16), 6, '0');
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

function getColorByColorSet(
    colorSet: ColorSet,
    province: Province,
    worldMap: FEWorldMap,
    renderContext: RenderContext
): number {
    const { provinceToState,
        provinceToStrategicRegion,
        stateToSupplyArea,
        topBar } = renderContext;
    switch (colorSet) {
        case 'provincetype':
            return (province.type === 'land' ? 0x007F00 : province.type === 'lake' ? 0x00FFFF : 0x00007F) | (province.coastal ? 0x7F0000 : 0);
        case 'country':
            {
                const stateId = provinceToState[province.id];
                return worldMap.countries.find(c => c && c.tag === worldMap.getStateById(stateId)?.owner)?.color ?? defaultColor(province);
            }
        case 'terrain':
            {
                if (renderContext.extraState === undefined) {
                    renderContext.extraState = arrayToMap(worldMap.terrains, 'name');
                }

                const navalTerrain = province.type === 'land' ? undefined : worldMap.getStrategicRegionById(provinceToStrategicRegion[province.id])?.navalTerrain;
                return (renderContext.extraState as Record<string, Terrain | undefined>)[navalTerrain ?? province.terrain]?.color ?? 0;
            }
        case 'continent':
            if (renderContext.extraState === undefined) {
                let continent = 0;
                worldMap.forEachProvince(p => (p.continent > continent ? continent = p.continent : 0, false));
                renderContext.extraState = avoidPowerOf2(continent + 1);
            }
            return province.continent !== 0 ? valueAndMaxToColor(province.continent + 1, renderContext.extraState) : defaultColor(province);
        case 'stateid':
            {
                if (renderContext.extraState === undefined) {
                    renderContext.extraState = avoidPowerOf2(worldMap.statesCount);
                }
                const stateId = provinceToState[province.id];
                return stateId !== undefined ? valueAndMaxToColor(stateId < 0 ? 0 : stateId, renderContext.extraState) : defaultColor(province);
            }
        case 'warnings':
            {
                const isLand = province.type === 'land';
                const viewMode = topBar.viewMode$.value;
                const warningFilter = topBar.warningFilter.selectedValues$.value;
                const stateId = provinceToState[province.id];
                const state = worldMap.getStateById(stateId);
                const strategicRegion = worldMap.getStrategicRegionById(provinceToStrategicRegion[province.id]);
                const supplyAreaId = stateId ? stateToSupplyArea[stateId] : undefined;
                const supplyArea = worldMap.getSupplyAreaById(supplyAreaId);
                return worldMap.getProvinceWarnings(
                        viewMode !== "warnings" || warningFilter.includes('province') ? province : undefined,
                        viewMode !== "warnings" || warningFilter.includes('state') ? state : undefined,
                        viewMode !== "warnings" || warningFilter.includes('strategicregion') ? strategicRegion : undefined,
                        viewMode !== "warnings" || warningFilter.includes('supplyarea') ? supplyArea : undefined
                    ).length > 0 ?
                    (isLand ? 0xE02020 : 0xC00000) :
                    (isLand ? 0x7FFF7F : 0x20E020);
            }
        case 'manpower':
            {
                if (province.type === 'sea') {
                    return defaultColor(province);
                }

                if (renderContext.extraState === undefined) {
                    let maxManpower = 0;
                    worldMap.forEachState(state => (state.manpower > maxManpower ? maxManpower = state.manpower : 0, false));
                    renderContext.extraState = maxManpower;
                }

                const stateId = provinceToState[province.id];
                const state = worldMap.getStateById(stateId);
                const value = manpowerHandler(state?.manpower ?? 0) / manpowerHandler(renderContext.extraState);
                return valueToColorGYR(value);
            }
        case 'victorypoint':
            {
                if (renderContext.extraState === undefined) {
                    let maxVictoryPoint = 0;
                    worldMap.forEachState(state => Object.values(state.victoryPoints).forEach(
                        vp => vp !== undefined && vp > maxVictoryPoint ? maxVictoryPoint = vp: 0));
                    renderContext.extraState = maxVictoryPoint;
                }

                const stateId = provinceToState[province.id];
                const state = worldMap.getStateById(stateId);
                const value = victoryPointsHandler(state ? state.victoryPoints[province.id] ?? 0.1 : 0) / victoryPointsHandler(renderContext.extraState);
                return valueToColorGreyScale(value);
            }
        case 'strategicregionid':
            {
                if (renderContext.extraState === undefined) {
                    renderContext.extraState = avoidPowerOf2(worldMap.strategicRegionsCount);
                }
                const strategicRegionId = provinceToStrategicRegion[province.id];
                return valueAndMaxToColor(strategicRegionId === undefined || strategicRegionId < 0 ? 0 : strategicRegionId, renderContext.extraState);
            }
        case 'supplyareaid':
            {
                if (renderContext.extraState === undefined) {
                    renderContext.extraState = avoidPowerOf2(worldMap.supplyAreasCount);
                }
                const stateId = provinceToState[province.id];
                const supplyAreaId = stateId !== undefined ? stateToSupplyArea[stateId] : undefined;
                return supplyAreaId !== undefined ? valueAndMaxToColor(supplyAreaId < 0 ? 0 : supplyAreaId, renderContext.extraState) : defaultColor(province);
            }
        case 'supplyvalue':
            {
                if (province.type === 'sea') {
                    return defaultColor(province);
                }

                if (renderContext.extraState === undefined) {
                    let maxSupplyValue = 0;
                    worldMap.forEachSupplyArea(supplyArea => (supplyArea.value > maxSupplyValue ? maxSupplyValue = supplyArea.value: 0, false));
                    renderContext.extraState = maxSupplyValue;
                }

                const stateId = provinceToState[province.id];
                const supplyAreaId = stateId ? stateToSupplyArea[stateId] : undefined;
                const supplyArea = worldMap.getSupplyAreaById(supplyAreaId);
                const value = (supplyArea?.value ?? 0) / (renderContext.extraState);
                return valueToColorGYR(value);
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

function defaultColor(province: Province) {
    return province.type === 'land' ? 0 : 0x1010B0;
}

function toCommaDivideNumber(value: number): string {
    return value.toString(10).replace(/(?<!^)(\d{3})(?=(?:\d{3})*$)/g, ',$1');
}
