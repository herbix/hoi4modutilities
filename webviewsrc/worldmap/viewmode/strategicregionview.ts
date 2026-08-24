import type { ConditionItem } from '../../../src/hoiformat/condition';
import type { Province, ProvinceEdge, StrategicRegion, WorldMapMessage } from '../definitions';
import type { FEWorldMap } from '../loader';
import type { RenderContext, Renderer } from '../renderer';
import type { ViewPoint } from '../viewpoint';
import { vscode } from '../../util/vscode';
import { BehaviorSubject } from 'rxjs';
import { feLocalize } from '../../util/i18n';
import { ViewMode, ViewModeControllerBase } from './viewbase';

export class StrategicRegionViewModeController extends ViewModeControllerBase<number> {
    public readonly viewMode: ViewMode = 'strategicregion';
    public readonly edgeRenderScale = 0.25;
    public readonly labelRenderScale = 0.25;
    public readonly editModeHover$: BehaviorSubject<number | undefined> = new BehaviorSubject<number | undefined>(undefined);

    public renderMapLabels(renderContext: RenderContext, worldMap: FEWorldMap, xOffset: number): void {
        this.renderRegionLabels(
            renderContext,
            xOffset,
            province => renderContext.provinceToStrategicRegion[province.id],
            id => worldMap.getStrategicRegionById(id),
        );
    }

    public shouldRenderProvinceEdge(renderContext: RenderContext, province: Province, edge: ProvinceEdge, worldMap: FEWorldMap): boolean {
        return renderContext.provinceToStrategicRegion[province.id] !== renderContext.provinceToStrategicRegion[edge.to];
    }

    public override onClick(): void {
        if (!this.editMode) {
            super.onClick();
        } else {
            const worldMap = this.loader.worldMap;
            const selectedStrategicRegion = worldMap.getStrategicRegionById(this.selected$.value);
            const hoverProvince = worldMap.getProvinceById(this.editModeHover$.value);
            if (!selectedStrategicRegion || !hoverProvince) {
                return;
            }

            const hoverStrategicRegion = worldMap.getStrategicRegionByProvinceId(hoverProvince.id);
            
            vscode.postMessage<WorldMapMessage>({
                command: 'moveprovince',
                type: 'strategicregion',
                province: hoverProvince.id,
                to: selectedStrategicRegion.id,
                from: hoverStrategicRegion?.id,
                toFile: selectedStrategicRegion.file,
                fromFile: hoverStrategicRegion?.file,
            });
        }
    }

    public renderHoverSelection(renderer: Renderer, worldMap: FEWorldMap): void {
        const selectedStrategicRegion = worldMap.getStrategicRegionById(this.selected$.value);
        if (!this.editMode) {
            const hoverStrategicRegion = worldMap.getStrategicRegionById(this.hover$.value);
            renderer.renderRegionHoverSelection(worldMap, hoverStrategicRegion, selectedStrategicRegion);
            if (hoverStrategicRegion && renderer.isTooltipVisible()) {
                this.renderStrategicRegionTooltip(renderer, hoverStrategicRegion, worldMap);
            }
        } else {
            const hoverProvince = worldMap.getProvinceById(this.editModeHover$.value);
            renderer.renderRegionHoverSelectionInEditMode(worldMap, hoverProvince, selectedStrategicRegion);
        }
    }

    public updateHover(x: number, y: number, selectedConditions: ConditionItem[]): void {
        const worldMap = this.loader.worldMap;
        const province = worldMap.getProvinceByPosition(x, y);
        this.hover$.next(province === undefined ? undefined : worldMap.getStrategicRegionByProvinceId(province.id)?.id);
        this.editModeHover$.next(province?.id);
    }

    public override clearHover(): void {
        super.clearHover();
        this.editModeHover$.next(undefined);
    }

    public openMapItem(useHoverValue: boolean): void {
        const worldMap = this.loader.worldMap;
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

    public canEdit(): boolean {
        return this.selected$.value !== undefined;
    }

    public canOpenMapItem(): boolean {
        return this.selected$.value !== undefined;
    }

    public override search(viewPoint: ViewPoint, id: number): void {
        this.searchById(viewPoint, id, this.loader.worldMap.getStrategicRegionById);
    }

    public override getSearchPlaceholder(): string {
        return this.getIdSearchPlaceholder(this.loader.worldMap.strategicRegionsCount);
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
