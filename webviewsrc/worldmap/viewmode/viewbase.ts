import { BehaviorSubject } from 'rxjs';
import type { ConditionItem } from '../../../src/hoiformat/condition';
import { LabelFontSize, Point, Province, ProvinceEdge, Region, State, StrategicRegion, SupplyArea } from '../definitions';
import type { FEWorldMap, Loader } from '../loader';
import { Renderer } from '../renderer';
import type { RenderContext } from '../renderer';
import type { ViewPoint } from '../viewpoint';
import { sendEvent } from '../../util/telemetry';

export type ViewMode = 'province' | 'state' | 'country' | 'strategicregion' | 'supplyarea' | 'warnings';

type LabeledRegion = State | StrategicRegion | SupplyArea;

export abstract class ViewModeControllerBase<T> {
    public abstract readonly viewMode: ViewMode;
    public abstract readonly edgeRenderScale: number;
    public abstract readonly labelRenderScale: number;
    public readonly hover$: BehaviorSubject<T | undefined> = new BehaviorSubject<T | undefined>(undefined);
    public readonly selected$: BehaviorSubject<T | undefined>;

    protected editMode: boolean = false;

    public constructor(protected readonly loader: Loader, selected?: T) {
        this.selected$ = new BehaviorSubject<T | undefined>(selected);
    }

    public abstract renderMapLabels(renderContext: RenderContext, worldMap: FEWorldMap, xOffset: number): void;
    public abstract shouldRenderProvinceEdge(renderContext: RenderContext, province: Province, edge: ProvinceEdge, worldMap: FEWorldMap): boolean;
    public abstract renderHoverSelection(renderer: Renderer, worldMap: FEWorldMap): void;
    public abstract updateHover(x: number, y: number, selectedConditions: ConditionItem[]): void;
    public abstract openMapItem(useHoverValue: boolean): void;
    public abstract canOpenMapItem(): boolean;

    public search(viewPoint: ViewPoint, id: number): void {
    }

    public getSearchPlaceholder(): string {
        return '';
    }

    public clearHover(): void {
        this.hover$.next(undefined);
    }

    public onClick(): void {
        this.selected$.next(this.selected$.value === this.hover$.value ? undefined : this.hover$.value);
    }

    public onDblClick(): void {
        if (!this.editMode) {
            sendEvent('worldmap.open.' + this.viewMode + '.dblclick');
            this.openMapItem(true);
        }
    }

    public onMidButtonClick(): void {
        this.selected$.next(this.hover$.value);
    }

    public canEdit(): boolean {
        return false;
    }

    public enterEditMode(): void {
        this.editMode = true;
    }

    public exitEditMode(): void {
        this.editMode = false;
    }

    public canViewSelected(): boolean {
        return false;
    }

    public viewSelected(viewPoint: ViewPoint): void {
    }

    public canAddMapItem(): boolean {
        return false;
    }

    public addMapItem(): void {
    }

    public selectMapItem(id: T | undefined): void {
        this.selected$.next(id);
    }

    protected searchById(viewPoint: ViewPoint, id: number, getRegionById: (id: number) => Region | undefined): void {
        const region = getRegionById(id);
        if (region) {
            this.selected$.next(id as T);
            this.viewSelectedRegion(viewPoint, region);
        }
    }

    protected getIdSearchPlaceholder(count: number): string {
        return count > 1 ? `1-${count - 1}` : '';
    }

    protected renderRegionLabels<TRegion extends LabeledRegion>(
        renderContext: RenderContext,
        xOffset: number,
        getRegionId: (province: Province) => number | undefined,
        getRegionById: (id: number) => TRegion | undefined,
        renderAdditionalLabels?: (region: TRegion, labelPosition: Point) => void,
    ): void {
        const worldMap = this.loader.worldMap;
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

    protected viewSelectedRegion(viewPoint: ViewPoint, region: Region): void {
        if (region.boundingBox.h > 0 && region.boundingBox.w > 0) {
            viewPoint.centerZone(region.boundingBox);
        }
    }
}
