import { BehaviorSubject } from 'rxjs';
import type { ConditionItem } from '../../../src/hoiformat/condition';
import type { Province, ProvinceEdge, StrategicRegion, WorldMapMessage } from '../definitions';
import type { FEWorldMap } from '../loader';
import type { RenderContext, Renderer } from '../renderer';
import type { ViewPoint } from '../viewpoint';
import { vscode } from '../../util/vscode';
import { feLocalize } from '../../util/i18n';
import { ViewMode, ViewModeControllerBase } from './viewbase';

export class StrategicRegionViewModeController extends ViewModeControllerBase<number> {
    public readonly viewMode: ViewMode = 'strategicregion';
    public readonly edgeRenderScale = 0.25;
    public readonly labelRenderScale = 0.25;
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
            province => renderContext.provinceToStrategicRegion[province.id],
            id => worldMap.getStrategicRegionById(id),
        );
    }

    public shouldRenderProvinceEdge(renderContext: RenderContext, province: Province, edge: ProvinceEdge, worldMap: FEWorldMap): boolean {
        return renderContext.provinceToStrategicRegion[province.id] !== renderContext.provinceToStrategicRegion[edge.to];
    }

    public renderHoverSelection(renderer: Renderer, worldMap: FEWorldMap): void {
        const hover = worldMap.getStrategicRegionById(this.hover$.value);
        renderer.renderRegionHoverSelection(worldMap, hover, worldMap.getStrategicRegionById(this.selected$.value));
        if (hover && renderer.isTooltipVisible()) {
            this.renderStrategicRegionTooltip(renderer, hover, worldMap);
        }
    }

    public updateHover(worldMap: FEWorldMap, x: number, y: number, selectedConditions: ConditionItem[]): void {
        const province = worldMap.getProvinceByPosition(x, y);
        const state = province === undefined ? undefined : worldMap.getStateByProvinceId(province.id);
        this.hover$.next(province === undefined ? undefined : worldMap.getStrategicRegionByProvinceId(province.id)?.id);
    }

    public openMapItem(worldMap: FEWorldMap, useHoverValue: boolean): void {
        const selected = useHoverValue ? this.hover$.value : this.selected$.value;
        if (selected) {
            const strategicRegion = worldMap.getStrategicRegionById(selected);
            if (strategicRegion) {
                vscode.postMessage<WorldMapMessage>({
                    command: 'openfile',
                    type: 'strategicregion',
                    file: strategicRegion.file,
                    start: strategicRegion.token?.start,
                    end: strategicRegion.token?.end,
                });
            }
        }
    }

    public canOpenMapItem(worldMap: FEWorldMap): boolean {
        return this.selected$.value !== undefined;
    }

    public override search(worldMap: FEWorldMap, viewPoint: ViewPoint, id: number): void {
        this.searchById(viewPoint, id, worldMap.getStrategicRegionById);
    }

    public override getSearchPlaceholder(worldMap: FEWorldMap): string {
        return this.getIdSearchPlaceholder(worldMap.strategicRegionsCount);
    }

    private renderStrategicRegionTooltip(renderer: Renderer, strategicRegion: StrategicRegion, worldMap: FEWorldMap): void {
        renderer.renderTooltip(`
${feLocalize('worldmap.tooltip.strategicregion', 'Strategic region')}=${strategicRegion.id}
${strategicRegion.navalTerrain ? `
${feLocalize('worldmap.tooltip.navalterrain', 'Naval terrain')}=${strategicRegion.navalTerrain}
`: ''
}
${feLocalize('worldmap.tooltip.provinces', 'Provinces')}=${strategicRegion.provinces.join(',')}
${worldMap.getStrategicRegionWarnings(strategicRegion).map(warning => '|r|' + warning).join('\n')}`);
    }
}
