import { LabelFontSize } from '../definitions';
import type { ConditionItem } from '../../../src/hoiformat/condition';
import type { Province, ProvinceEdge, State, WorldMapMessage } from '../definitions';
import type { FEWorldMap, Loader } from '../loader';
import type { RenderContext, Renderer } from '../renderer';
import type { ViewPoint } from '../viewpoint';
import { vscode } from '../../util/vscode';
import { feLocalize } from '../../util/i18n';
import { ViewMode, ViewModeControllerBase } from './viewbase';
import { solveWithCondition, solveWithConditionAsSet, toCommaDivideNumber } from '../common';
import { BehaviorSubject } from 'rxjs';

export class StateViewModeController extends ViewModeControllerBase<number> {
    public readonly viewMode: ViewMode = 'state';
    public readonly edgeRenderScale = 1;
    public readonly labelRenderScale = 1;
    public readonly editModeHover$: BehaviorSubject<number | undefined> = new BehaviorSubject<number | undefined>(undefined);
    private readonly resourceImages: Record<string, HTMLImageElement | undefined> = {};

    constructor(loader: Loader, selected?: number) {
        super(loader, selected);
        loader.worldMap$.subscribe(worldMap => this.loadResourceImages(worldMap));
        this.loadResourceImages(loader.worldMap);
    }

    public override renderMapLabels(renderContext: RenderContext, worldMap: FEWorldMap, xOffset: number): void {
        const resourceYOffset = renderContext.topBar.display.selectedValues$.value.includes('localisedlabel') ? LabelFontSize / 2 : 0;
        this.renderRegionLabels(
            renderContext,
            xOffset,
            province => renderContext.provinceToState[province.id],
            id => worldMap.getStateById(id),
            renderContext.topBar.colorSet$.value === 'resources' ? (state, labelPosition) => {
                const { width } = this.measureResources(state, 0.7, 16);
                this.renderResources(
                    renderContext.mapCanvasContext,
                    state,
                    renderContext.viewPoint.convertX(labelPosition.x + xOffset) - width / 2,
                    renderContext.viewPoint.convertY(labelPosition.y) + 5 + resourceYOffset,
                    0.7,
                    16,
                );
            } : undefined,
        );
    }

    public override shouldRenderProvinceEdge(renderContext: RenderContext, province: Province, edge: ProvinceEdge, worldMap: FEWorldMap): boolean {
        const stateFromId = renderContext.provinceToState[province.id];
        const stateToId = renderContext.provinceToState[edge.to];
        const strategicRegionFromId = renderContext.provinceToStrategicRegion[province.id];
        const strategicRegionToId = renderContext.provinceToStrategicRegion[edge.to];
        return !(stateFromId === stateToId && (stateFromId !== undefined || strategicRegionFromId === strategicRegionToId));
    }

    public override onClick(): void {
        if (!this.editMode) {
            super.onClick();
        } else {
            const worldMap = this.loader.worldMap;
            const selectedState = worldMap.getStateById(this.selected$.value);
            const hoverProvince = worldMap.getProvinceById(this.editModeHover$.value);
            if (!selectedState || !hoverProvince) {
                return;
            }

            const hoverState = worldMap.getStateByProvinceId(hoverProvince.id);
            
            vscode.postMessage<WorldMapMessage>({
                command: 'moveprovince',
                type: 'state',
                province: hoverProvince.id,
                to: selectedState.id,
                from: hoverState?.id,
                toFile: selectedState.file,
                fromFile: hoverState?.file,
            });
        }
    }

    public override renderHoverSelection(renderer: Renderer, worldMap: FEWorldMap): void {
        const selectedState = worldMap.getStateById(this.selected$.value);
        if (!this.editMode) {
            const hoverState = worldMap.getStateById(this.hover$.value);
            renderer.renderRegionHoverSelection(worldMap, hoverState, selectedState);
            if (hoverState && renderer.isTooltipVisible()) {
                this.renderStateTooltip(renderer, hoverState, worldMap);
            }
        } else {
            const hoverProvince = worldMap.getProvinceById(this.editModeHover$.value);
            renderer.renderRegionHoverSelectionInEditMode(worldMap, hoverProvince, selectedState);
        }
    }

    public override updateHover(x: number, y: number, selectedConditions: ConditionItem[]): void {
        const worldMap = this.loader.worldMap;
        const province = worldMap.getProvinceByPosition(x, y);
        const state = province === undefined ? undefined : worldMap.getStateByProvinceId(province.id);
        this.hover$.next(state?.id);
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
            const state = worldMap.getStateById(selected);
            if (state) {
                vscode.postMessage<WorldMapMessage>({
                    command: 'openfile',
                    type: 'state',
                    file: state.file,
                    start: state.token?.start,
                    end: state.token?.end,
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
        this.searchById(viewPoint, id, this.loader.worldMap.getStateById);
    }

    public override getSearchPlaceholder(): string {
        return this.getIdSearchPlaceholder(this.loader.worldMap.statesCount);
    }

    public override canViewSelected(): boolean {
        return this.selected$.value !== undefined;
    }

    public override viewSelected(viewPoint: ViewPoint): void {
        const state = this.loader.worldMap.getStateById(this.selected$.value);
        if (state) {
            this.viewSelectedRegion(viewPoint, state);
        }
    }

    private loadResourceImages(worldMap: FEWorldMap): void {
        for (const resource of worldMap.resources) {
            const image = new Image();
            image.onload = () => {
                this.resourceImages[resource.name] = image;
            };
            image.src = resource.imageUri;
        }
    }

    private renderStateTooltip(renderer: Renderer, state: State, worldMap: FEWorldMap): void {
        const selectedConditions = renderer.selectedConditions;
        const supplyArea = worldMap.getSupplyAreaByStateId(state.id);
        const owner = worldMap.getCountryByState(state, selectedConditions, 'owner');
        const controller = worldMap.getCountryByState(state, selectedConditions, 'controller');
        const isDemilitarizedZone = solveWithCondition(state.isDemilitarizedZone, selectedConditions);
        const claimBy = solveWithConditionAsSet(state.claimBy, selectedConditions);
        renderer.renderTooltip(`
${state.impassable ? '|r|' + feLocalize('worldmap.tooltip.impassable', 'Impassable') : ''}
${isDemilitarizedZone ? '|r|' + feLocalize('worldmap.tooltip.demilitarizedzone', 'Demilitarized zone') : ''}
${feLocalize('worldmap.tooltip.state', 'State')}=${state.id}${state.localisedName ? ` (${state.localisedName})` : ''}
${supplyArea ? `
${feLocalize('worldmap.tooltip.supplyarea', 'Supply area')}=${supplyArea.id}
` : ''}
${feLocalize('worldmap.tooltip.owner', 'Owner')}=${owner}
${controller && owner !== controller ? `${feLocalize('worldmap.tooltip.controller', 'Controller')}=${controller}` : ''}
${feLocalize('worldmap.tooltip.coreof', 'Core of')}=${solveWithConditionAsSet(state.cores, selectedConditions).join(',')}
${claimBy.length > 0 ? feLocalize('worldmap.tooltip.claimby', 'Claim by') + '=' + claimBy.join(',') : ''}
${feLocalize('worldmap.tooltip.manpower', 'Manpower')}=${toCommaDivideNumber(state.manpower)}
${feLocalize('worldmap.tooltip.category', 'Category')}=${state.category}
${supplyArea ? `
${feLocalize('worldmap.tooltip.supplyvalue', 'Supply value')}=${supplyArea.value}
` : ''}
${feLocalize('worldmap.tooltip.provinces', 'Provinces')}=${state.provinces.join(',')}
${worldMap.getStateWarnings(state, supplyArea).map(warning => '|r|' + warning).join('\n')}`,
            (width, height) => {
                const resources = this.measureResources(state);
                return { width: Math.max(width, resources.width), height: height + resources.height };
            },
            (context, x, y) => this.renderResources(context, state, x, y));
    }

    private measureResources(state: State, scale: number = 1, labelWidth: number = 30): { width: number, height: number } {
        let fullWidth = 0;
        let maxHeight = 0;
        for (const resource in state.resources) {
            if (!state.resources[resource]) {
                continue;
            }
            const image = this.resourceImages[resource];
            if (image) {
                maxHeight = Math.max(maxHeight, image.naturalHeight * scale);
                fullWidth += image.naturalWidth * scale;
            } else {
                maxHeight = Math.max(maxHeight, 24 * scale);
                fullWidth += 24 * scale;
            }
            fullWidth += labelWidth;
        }
        return { width: fullWidth, height: maxHeight };
    }

    private renderResources(
        context: CanvasRenderingContext2D,
        state: State,
        x: number,
        y: number,
        scale: number = 1,
        labelWidth: number = 30,
    ): void {
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        for (const resource in state.resources) {
            const resourceNumber = state.resources[resource];
            if (!resourceNumber) {
                continue;
            }

            const image = this.resourceImages[resource];
            if (image) {
                context.drawImage(image, x, y, image.naturalWidth * scale, image.naturalHeight * scale);
                context.fillText(resourceNumber.toString(), x + image.naturalWidth * scale + labelWidth / 2, y + image.naturalHeight * scale / 2);
                x += image.naturalWidth * scale + labelWidth;
            } else {
                context.fillStyle = 'gray';
                context.fillRect(x, y, 24 * scale, 24 * scale);
                context.fillText(resourceNumber.toString(), x + 24 * scale + labelWidth / 2, y + 24 * scale / 2);
                x += 24 * scale + labelWidth;
            }
        }
    }
}
