import type { ConditionItem } from '../../../src/hoiformat/condition';
import type { MoveProvinceItem, Province, ProvinceEdge, StrategicRegion, WorldMapMessage } from '../definitions';
import type { FEWorldMap, Loader } from '../loader';
import type { RenderContext, Renderer } from '../renderer';
import type { ViewPoint } from '../viewpoint';
import { vscode } from '../../util/vscode';
import { BehaviorSubject } from 'rxjs';
import { feLocalize } from '../../util/i18n';
import { ViewMode, ViewModeControllerBase } from './viewbase';
import type { ViewModeControllers } from './index';

export class StrategicRegionViewModeController extends ViewModeControllerBase<number> {
    public readonly viewMode: ViewMode = 'strategicregion';
    public readonly edgeRenderScale = 0.25;
    public readonly labelRenderScale = 0.25;
    public readonly editModeHover$: BehaviorSubject<number | undefined> = new BehaviorSubject<number | undefined>(undefined);

    constructor(private readonly viewModeControllers: ViewModeControllers, loader: Loader, selected?: number) {
        super(loader, selected);
    }

    public override renderMapLabels(renderContext: RenderContext, worldMap: FEWorldMap, xOffset: number): void {
        this.renderRegionLabels(
            renderContext,
            xOffset,
            province => renderContext.provinceToStrategicRegion[province.id],
            id => worldMap.getStrategicRegionById(id),
        );
    }

    public override shouldRenderProvinceEdge(renderContext: RenderContext, province: Province, edge: ProvinceEdge, worldMap: FEWorldMap): boolean {
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
            const hoverState = worldMap.getStateByProvinceId(hoverProvince.id);
            const items: MoveProvinceItem[] = [];
            if (!this.viewModeControllers.linkStateStrategicRegion || !hoverState) {
                items.push({
                    type: 'strategicregion',
                    provinces: [hoverProvince.id],
                    to: selectedStrategicRegion.id,
                    from: hoverStrategicRegion?.id,
                    toFile: selectedStrategicRegion.file,
                    fromFile: hoverStrategicRegion?.file,
                });
            } else {
                const provinces = hoverState.provinces.filter(provinceId => {
                    const strategicRegion = worldMap.getStrategicRegionByProvinceId(provinceId);
                    return strategicRegion === hoverStrategicRegion;
                });

                items.push({
                    type: 'strategicregion',
                    provinces,
                    to: selectedStrategicRegion.id,
                    from: hoverStrategicRegion?.id,
                    toFile: selectedStrategicRegion.file,
                    fromFile: hoverStrategicRegion?.file,
                });
            }

            vscode.postMessage<WorldMapMessage>({ command: 'moveprovince', items });
        }
    }

    public override renderHoverSelection(renderer: Renderer, worldMap: FEWorldMap): void {
        const selectedStrategicRegion = worldMap.getStrategicRegionById(this.selected$.value);
        if (!this.editMode) {
            const hoverStrategicRegion = worldMap.getStrategicRegionById(this.hover$.value);
            renderer.renderRegionHoverSelection(worldMap, hoverStrategicRegion, selectedStrategicRegion);
            if (hoverStrategicRegion && renderer.isTooltipVisible()) {
                this.renderStrategicRegionTooltip(renderer, hoverStrategicRegion, worldMap);
            }
        } else {
            const hoverProvince = worldMap.getProvinceById(this.editModeHover$.value);
            const hoverState = hoverProvince ? worldMap.getStateByProvinceId(hoverProvince.id) : undefined;
            if (!this.viewModeControllers.linkStateStrategicRegion || !hoverProvince || !hoverState) {
                renderer.renderRegionHoverSelectionInEditMode(worldMap, hoverProvince, selectedStrategicRegion);
            } else {
                const hoverStrategicRegion = worldMap.getStrategicRegionByProvinceId(hoverProvince.id);
                const provinceIds = hoverState.provinces.filter(provinceId => {
                    const strategicRegion = worldMap.getStrategicRegionByProvinceId(provinceId);
                    return strategicRegion === hoverStrategicRegion;
                });
                const provinces = provinceIds
                    .map(provinceId => worldMap.getProvinceById(provinceId))
                    .filter((province): province is Province => province !== undefined);
                renderer.renderRegionHoverSelectionInEditMode(worldMap, provinces, selectedStrategicRegion);
            }
        }
    }

    public override updateHover(x: number, y: number, selectedConditions: ConditionItem[]): void {
        const worldMap = this.loader.worldMap;
        const province = worldMap.getProvinceByPosition(x, y);
        this.hover$.next(province === undefined ? undefined : worldMap.getStrategicRegionByProvinceId(province.id)?.id);
        this.editModeHover$.next(province?.id);
    }

    public override clearHover(): void {
        super.clearHover();
        this.editModeHover$.next(undefined);
    }

    public override openMapItem(useHoverValue: boolean): void {
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

    public override canEdit(): boolean {
        return this.selected$.value !== undefined;
    }

    public override canOpenMapItem(): boolean {
        return this.selected$.value !== undefined;
    }

    public override search(viewPoint: ViewPoint, id: number): void {
        this.searchById(viewPoint, id, this.loader.worldMap.getStrategicRegionById);
    }

    public override getSearchPlaceholder(): string {
        return this.getIdSearchPlaceholder(this.loader.worldMap.strategicRegionsCount);
    }

    public override canViewSelected(): boolean {
        return this.selected$.value !== undefined;
    }

    public override viewSelected(viewPoint: ViewPoint): void {
        const strategicRegion = this.loader.worldMap.getStrategicRegionById(this.selected$.value);
        if (strategicRegion) {
            this.viewSelectedRegion(viewPoint, strategicRegion);
        }
    }

    public override canAddMapItem(): boolean {
        return true;
    }

    public override addMapItem(): void {
        vscode.postMessage<WorldMapMessage>({
            command: 'addmapitem',
            type: 'strategicregion',
        });
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
