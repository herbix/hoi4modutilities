import type { BehaviorSubject } from 'rxjs';
import { applyCondition } from '../../../src/hoiformat/condition';
import type { ConditionItem } from '../../../src/hoiformat/condition';
import { LabelFontSize, Point, Province, ProvinceEdge, Region, State, StrategicRegion, SupplyArea, WithCondition } from '../definitions';
import type { FEWorldMap } from '../loader';
import { Renderer } from '../renderer';
import type { RenderContext } from '../renderer';
import type { ViewPoint } from '../viewpoint';

export type ViewMode = 'province' | 'state' | 'country' | 'strategicregion' | 'supplyarea' | 'warnings';

type LabeledRegion = State | StrategicRegion | SupplyArea;

export abstract class ViewModeControllerBase<T> {
    public abstract readonly viewMode: ViewMode;
    public abstract readonly edgeRenderScale: number;
    public abstract readonly labelRenderScale: number;
    public abstract readonly hover$: BehaviorSubject<T | undefined>;
    public abstract readonly selected$: BehaviorSubject<T | undefined>;

    public abstract renderMapLabels(renderContext: RenderContext, worldMap: FEWorldMap, xOffset: number): void;
    public abstract shouldRenderProvinceEdge(renderContext: RenderContext, province: Province, edge: ProvinceEdge, worldMap: FEWorldMap): boolean;
    public abstract renderHoverSelection(renderer: Renderer, worldMap: FEWorldMap): void;
    public abstract updateHover(worldMap: FEWorldMap, x: number, y: number, selectedConditions: ConditionItem[]): void;
    public abstract openMapItem(worldMap: FEWorldMap, useHoverValue: boolean): void;
    public abstract canOpenMapItem(worldMap: FEWorldMap): boolean;

    public search(worldMap: FEWorldMap, viewPoint: ViewPoint, id: number): void {
    }

    public getSearchPlaceholder(worldMap: FEWorldMap): string {
        return '';
    }

    public clearHover(): void {
        this.hover$.next(undefined);
    }

    public toggleSelection(): void {
        this.selected$.next(this.selected$.value === this.hover$.value ? undefined : this.hover$.value);
    }

    protected searchById(viewPoint: ViewPoint, id: number, getRegionById: (id: number) => Region | undefined): void {
        const region = getRegionById(id);
        if (region) {
            this.selected$.next(id as T);
            viewPoint.centerZone(region.boundingBox);
        }
    }

    protected getIdSearchPlaceholder(count: number): string {
        return count > 1 ? `1-${count - 1}` : '';
    }

    protected renderRegionLabels<TRegion extends LabeledRegion>(
        renderContext: RenderContext,
        worldMap: FEWorldMap,
        xOffset: number,
        getRegionId: (province: Province) => number | undefined,
        getRegionById: (id: number) => TRegion | undefined,
        renderAdditionalLabels?: (region: TRegion, labelPosition: Point) => void,
    ): void {
        const { mapCanvasContext: context, topBar, viewPoint } = renderContext;
        const renderedProvinces = renderContext.renderedProvincesByOffset[xOffset] ?? [];
        const renderedRegions = new Set<number>();

        for (const province of renderedProvinces) {
            const regionId = getRegionId(province);
            if (regionId === undefined || renderedRegions.has(regionId)) {
                continue;
            }

            renderedRegions.add(regionId);
            const region = getRegionById(regionId);
            if (!region) {
                continue;
            }

            const labelPosition = region.centerOfMass;
            context.fillStyle = Renderer.getProvinceLabelColor(province, labelPosition, worldMap, renderContext);
            if (region.localisedName && topBar.display.selectedValues$.value.includes('localisedlabel')) {
                context.fillText(region.localisedName, viewPoint.convertX(labelPosition.x + xOffset), viewPoint.convertY(labelPosition.y) - LabelFontSize / 2);
                context.fillText(region.id.toString(), viewPoint.convertX(labelPosition.x + xOffset), viewPoint.convertY(labelPosition.y) + LabelFontSize / 2);
            } else {
                context.fillText(region.id.toString(), viewPoint.convertX(labelPosition.x + xOffset), viewPoint.convertY(labelPosition.y));
            }
            renderAdditionalLabels?.(region, labelPosition);
        }
    }
}
