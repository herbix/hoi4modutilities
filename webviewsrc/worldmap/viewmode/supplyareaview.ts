import { BehaviorSubject } from 'rxjs';
import type { ConditionItem } from '../../../src/hoiformat/condition';
import type { Province, ProvinceEdge, SupplyArea, WorldMapMessage } from '../definitions';
import type { FEWorldMap } from '../loader';
import type { Renderer, RenderContext } from '../renderer';
import type { ViewPoint } from '../viewpoint';
import { vscode } from '../../util/vscode';
import { feLocalize } from '../../util/i18n';
import { ViewMode, ViewModeControllerBase } from './viewbase';

export class SupplyAreaViewModeController extends ViewModeControllerBase<number> {
    public readonly viewMode: ViewMode = 'supplyarea';
    public readonly edgeRenderScale = 0.5;
    public readonly labelRenderScale = 1;
    public readonly hover$ = new BehaviorSubject<number | undefined>(undefined);
    public readonly selected$: BehaviorSubject<number | undefined>;

    constructor(selected?: number) {
        super();
        this.selected$ = new BehaviorSubject<number | undefined>(selected);
    }

    public renderMapLabels(renderContext: RenderContext, worldMap: FEWorldMap, xOffset: number): void {
        this.renderRegionLabels(
            renderContext,
            worldMap,
            xOffset,
            province => {
                const stateId = renderContext.provinceToState[province.id];
                return stateId === undefined ? undefined : renderContext.stateToSupplyArea[stateId];
            },
            id => worldMap.getSupplyAreaById(id),
        );
    }

    public shouldRenderProvinceEdge(renderContext: RenderContext, province: Province, edge: ProvinceEdge, worldMap: FEWorldMap): boolean {
        const stateFromId = renderContext.provinceToState[province.id];
        const stateToId = renderContext.provinceToState[edge.to];
        const strategicRegionFromId = renderContext.provinceToStrategicRegion[province.id];
        const strategicRegionToId = renderContext.provinceToStrategicRegion[edge.to];
        const insideState = stateFromId === stateToId && (stateFromId !== undefined || strategicRegionFromId === strategicRegionToId);
        const insideSupplyArea = stateFromId !== undefined && stateToId !== undefined &&
            renderContext.stateToSupplyArea[stateFromId] === renderContext.stateToSupplyArea[stateToId];
        return !insideState && !insideSupplyArea;
    }

    public renderHoverSelection(renderer: Renderer, worldMap: FEWorldMap): void {
        const hover = worldMap.getSupplyAreaById(this.hover$.value);
        const selected = worldMap.getSupplyAreaById(this.selected$.value);
        renderer.renderRegionHoverSelection(worldMap, this.toProvinceRegion(hover, worldMap), this.toProvinceRegion(selected, worldMap));
        if (hover && renderer.isTooltipVisible()) {
            this.renderSupplyAreaTooltip(renderer, hover, worldMap);
        }
    }

    public updateHover(worldMap: FEWorldMap, x: number, y: number, selectedConditions: ConditionItem[]): void {
        const province = worldMap.getProvinceByPosition(x, y);
        const state = province === undefined ? undefined : worldMap.getStateByProvinceId(province.id);
        this.hover$.next(state === undefined ? undefined : worldMap.getSupplyAreaByStateId(state.id)?.id);
    }

    public openMapItem(worldMap: FEWorldMap, useHoverValue: boolean): void {
        const selected = useHoverValue ? this.hover$.value : this.selected$.value;
        if (selected) {
            const supplyArea = worldMap.getSupplyAreaById(selected);
            if (supplyArea) {
                vscode.postMessage<WorldMapMessage>({
                    command: 'openfile',
                    type: 'supplyarea',
                    file: supplyArea.file,
                    start: supplyArea.token?.start,
                    end: supplyArea.token?.end,
                });
            }
        }
    }

    public canOpenMapItem(worldMap: FEWorldMap): boolean {
        return this.selected$.value !== undefined;
    }

    public override search(worldMap: FEWorldMap, viewPoint: ViewPoint, id: number): void {
        this.searchById(viewPoint, id, worldMap.getSupplyAreaById);
    }

    public override getSearchPlaceholder(worldMap: FEWorldMap): string {
        return this.getIdSearchPlaceholder(worldMap.supplyAreasCount);
    }

    private toProvinceRegion(supplyArea: SupplyArea | undefined, worldMap: FEWorldMap): { provinces: number[] } | undefined {
        if (!supplyArea) {
            return undefined;
        }

        const provinces: number[] = [];
        for (const stateId of supplyArea.states) {
            const state = worldMap.getStateById(stateId);
            if (state) {
                provinces.push(...state.provinces);
            }
        }
        return { provinces };
    }

    private renderSupplyAreaTooltip(renderer: Renderer, supplyArea: SupplyArea, worldMap: FEWorldMap): void {
        renderer.renderTooltip(`
${feLocalize('worldmap.tooltip.supplyarea', 'Supply area')}=${supplyArea.id}
${feLocalize('worldmap.tooltip.supplyvalue', 'Supply value')}=${supplyArea.value}
${feLocalize('worldmap.tooltip.states', 'States')}=${supplyArea.states.join(',')}
${worldMap.getSupplyAreaWarnings(supplyArea).map(warning => '|r|' + warning).join('\n')}`);
    }
}
