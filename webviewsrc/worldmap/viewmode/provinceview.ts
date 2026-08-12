import { BehaviorSubject } from 'rxjs';
import type { ConditionItem } from '../../../src/hoiformat/condition';
import type { Province, ProvinceEdge, WorldMapMessage } from '../definitions';
import type { FEWorldMap } from '../loader';
import { Renderer } from '../renderer';
import type { RenderContext } from '../renderer';
import type { ViewPoint } from '../viewpoint';
import { vscode } from '../../util/vscode';
import { feLocalize } from '../../util/i18n';
import { ViewMode, ViewModeControllerBase } from './viewbase';
import { solveWithCondition, solveWithConditionAsSet, toCommaDivideNumber } from '../common';

export class ProvinceViewModeController extends ViewModeControllerBase<number> {
    public readonly viewMode: ViewMode = 'province';
    public readonly edgeRenderScale = 2;
    public readonly labelRenderScale = 3;
    public readonly hover$: BehaviorSubject<number | undefined> = new BehaviorSubject<number | undefined>(undefined);
    public readonly selected$: BehaviorSubject<number | undefined> = new BehaviorSubject<number | undefined>(undefined);

    constructor(selected?: number) {
        super();
        this.selected$.next(selected);
    }

    public renderMapLabels(renderContext: RenderContext, worldMap: FEWorldMap, xOffset: number): void {
        const { mapCanvasContext: context, topBar, viewPoint } = renderContext;
        const renderedProvinces = renderContext.renderedProvincesByOffset[xOffset] ?? [];
        const showSupply = topBar.display.selectedValues$.value.includes('supply');
        const fontSize = 10;

        for (const province of renderedProvinces) {
            const labelPosition = province.centerOfMass;
            context.fillStyle = showSupply && worldMap.getSupplyNodeByProvinceId(province.id) ?
                '#ffffff' : Renderer.getProvinceLabelColor(province, labelPosition, worldMap, renderContext);
            const state = worldMap.getStateByProvinceId(province.id);
            const victoryPoints = state?.victoryPoints[province.id];
            if (victoryPoints !== undefined && province.localisedName && topBar.display.selectedValues$.value.includes('localisedlabel')) {
                context.fillText(`${province.localisedName} (${victoryPoints})`, viewPoint.convertX(labelPosition.x + xOffset), viewPoint.convertY(labelPosition.y) - fontSize / 2);
                context.fillText(province.id.toString(), viewPoint.convertX(labelPosition.x + xOffset), viewPoint.convertY(labelPosition.y) + fontSize / 2);
            } else {
                context.fillText(province.id.toString(), viewPoint.convertX(labelPosition.x + xOffset), viewPoint.convertY(labelPosition.y));
            }
        }
    }

    public shouldRenderProvinceEdge(
        renderContext: RenderContext,
        province: Province,
        edge: ProvinceEdge,
        worldMap: FEWorldMap,
    ): boolean {
        return true;
    }

    public renderHoverSelection(renderer: Renderer, worldMap: FEWorldMap): void {
        let province = worldMap.getProvinceById(this.selected$.value);
        if (province) {
            renderer.renderSelectedProvince(province, worldMap);
        }

        province = worldMap.getProvinceById(this.hover$.value);
        if (province) {
            if (this.selected$ !== this.hover$ && renderer.isMouseHighlightVisible()) {
                renderer.renderHoverProvince(province, worldMap);
            }
            if (renderer.isTooltipVisible()) {
                this.renderProvinceTooltip(renderer, province, worldMap);
            }
        }
    }

    public updateHover(worldMap: FEWorldMap, x: number, y: number, selectedConditions: ConditionItem[]): void {
        const province = worldMap.getProvinceByPosition(x, y);
        this.hover$.next(province?.id);
    }

    public openMapItem(worldMap: FEWorldMap, useHoverValue: boolean): void {
        const selected = useHoverValue ? this.hover$.value : this.selected$.value;
        if (selected) {
            const province = worldMap.getProvinceById(selected);
            const definitionsFile = worldMap.provinceDefinitionsFile;
            if (province && definitionsFile) {
                vscode.postMessage<WorldMapMessage>({
                    command: 'openfile',
                    type: 'provincedefinition',
                    file: definitionsFile,
                    start: undefined,
                    end: undefined,
                    lineNumber: province.lineNumber,
                });
            }
        }
    }

    public canOpenMapItem(worldMap: FEWorldMap): boolean {
        const selected = this.selected$.value;
        return selected !== undefined && !!worldMap.provinceDefinitionsFile && worldMap.getProvinceById(selected)?.lineNumber !== undefined;
    }

    public override search(worldMap: FEWorldMap, viewPoint: ViewPoint, id: number): void {
        this.searchById(viewPoint, id, worldMap.getProvinceById);
    }

    public override getSearchPlaceholder(worldMap: FEWorldMap): string {
        return this.getIdSearchPlaceholder(worldMap.provincesCount);
    }

    private renderProvinceTooltip(renderer: Renderer, province: Province, worldMap: FEWorldMap): void {
        const selectedConditions = renderer.selectedConditions;
        const stateObject = worldMap.getStateByProvinceId(province.id);
        const strategicRegion = worldMap.getStrategicRegionByProvinceId(province.id);
        const supplyArea = stateObject ? worldMap.getSupplyAreaByStateId(stateObject.id) : undefined;
        const railwayLevel = worldMap.getRailwayLevelByProvinceId(province.id);
        const supplyNode = worldMap.getSupplyNodeByProvinceId(province.id);
        const victoryPoints = stateObject?.victoryPoints[province.id];
        const owner = worldMap.getCountryByState(stateObject, selectedConditions, 'owner');
        const controller = worldMap.getCountryByState(stateObject, selectedConditions, 'controller');
        const isDemilitarizedZone = stateObject ? solveWithCondition(stateObject.isDemilitarizedZone, selectedConditions) : false;

        renderer.renderTooltip(`
${stateObject?.impassable ? '|r|' + feLocalize('worldmap.tooltip.impassable', 'Impassable') : ''}
${isDemilitarizedZone ? '|r|' + feLocalize('worldmap.tooltip.demilitarizedzone', 'Demilitarized zone') : ''}
${feLocalize('worldmap.tooltip.province', 'Province')}=${province.id}${province.localisedName ? ` (${province.localisedName})` : ''}
${victoryPoints ? `${feLocalize('worldmap.tooltip.victorypoint', 'Victory point')}=${victoryPoints}` : ''}
${stateObject ? `
${feLocalize('worldmap.tooltip.state', 'State')}=${stateObject.id}${stateObject.localisedName ? ` (${stateObject.localisedName})` : ''}`: ''
}
${supplyArea ? `
${feLocalize('worldmap.tooltip.supplyarea', 'Supply area')}=${supplyArea.id}
` : ''}
${railwayLevel ? `
${feLocalize('worldmap.tooltip.railwaylevel', 'Railway level')}=${railwayLevel}
` : ''}
${supplyNode ? `
${feLocalize('worldmap.tooltip.supplynode', 'Supply node')}=true
` : ''}
${strategicRegion ? `
${feLocalize('worldmap.tooltip.strategicregion', 'Strategic region')}=${strategicRegion.id}
`: ''
}
${stateObject ? `
${feLocalize('worldmap.tooltip.owner', 'Owner')}=${owner}
${controller && owner !== controller ? `${feLocalize('worldmap.tooltip.controller', 'Controller')}=${controller}` : ''}
${feLocalize('worldmap.tooltip.coreof', 'Core of')}=${solveWithConditionAsSet(stateObject.cores, selectedConditions).join(',')}
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
${feLocalize('worldmap.tooltip.adjacencies', 'Adjecencies')}=${province.edges.filter(edge => edge.type !== 'impassable' && edge.to !== -1).map(edge => edge.to).join(',')}
${worldMap.getProvinceWarnings(province, stateObject, strategicRegion, supplyArea).map(warning => '|r|' + warning).join('\n')}`);
    }
}
