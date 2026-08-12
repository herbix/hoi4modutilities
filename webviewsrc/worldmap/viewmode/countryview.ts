import { BehaviorSubject } from 'rxjs';
import type { ConditionItem } from '../../../src/hoiformat/condition';
import { distanceSqr, intersectZone, inZone, mergeRegions } from '../../../src/previewdef/worldmap/graphutils';
import type { Point, Province, ProvinceEdge, Region, WorldMapMessage } from '../definitions';
import type { FEWorldMap } from '../loader';
import { Renderer } from '../renderer';
import type { RenderContext } from '../renderer';
import { vscode } from '../../util/vscode';
import { feLocalize } from '../../util/i18n';
import { ViewMode, ViewModeControllerBase } from './viewbase';

interface CountryRegion extends Region {
    owner: string;
    province: Province;
    labelPosition: Point;
}

export class CountryViewModeController extends ViewModeControllerBase<string> {
    public readonly viewMode: ViewMode = 'country';
    public readonly edgeRenderScale = 0.25;
    public readonly labelRenderScale = 0.25;
    public readonly hover$ = new BehaviorSubject<string | undefined>(undefined);
    public readonly selected$: BehaviorSubject<string | undefined>;

    constructor(selected?: string) {
        super();
        this.selected$ = new BehaviorSubject<string | undefined>(selected);
    }

    public renderMapLabels(renderContext: RenderContext, worldMap: FEWorldMap, xOffset: number): void {
        const { mapCanvasContext: context, topBar, viewPoint } = renderContext;
        const renderedProvinces = renderContext.renderedProvincesByOffset[xOffset] ?? [];
        const fontSize = 10;
        let countryRegions = renderContext.viewModeState as CountryRegion[] | undefined;
        if (!countryRegions) {
            countryRegions = getCountryRegions(
                worldMap,
                renderedProvinces,
                renderContext.provinceToState,
                renderContext.stateToOwnerCountry,
            );
            renderContext.viewModeState = countryRegions;
        }

        for (const { owner, province, boundingBox, labelPosition } of countryRegions) {
            if (!viewPoint.bboxInView(boundingBox, xOffset)) {
                continue;
            }

            context.fillStyle = Renderer.getProvinceLabelColor(province, labelPosition, worldMap, renderContext);
            const country = worldMap.getCountryByTag(owner);
            if (country?.localisedName && topBar.display.selectedValues$.value.includes('localisedlabel')) {
                context.fillText(country.localisedName, viewPoint.convertX(labelPosition.x + xOffset), viewPoint.convertY(labelPosition.y) - fontSize / 2);
                context.fillText(owner, viewPoint.convertX(labelPosition.x + xOffset), viewPoint.convertY(labelPosition.y) + fontSize / 2);
            } else {
                context.fillText(owner, viewPoint.convertX(labelPosition.x + xOffset), viewPoint.convertY(labelPosition.y));
            }
        }
    }

    public shouldRenderProvinceEdge(renderContext: RenderContext, province: Province, edge: ProvinceEdge, worldMap: FEWorldMap): boolean {
        const stateFromId = renderContext.provinceToState[province.id];
        const stateToId = renderContext.provinceToState[edge.to];
        const ownerFrom = stateFromId === undefined ? undefined : renderContext.stateToOwnerCountry[stateFromId];
        const ownerTo = stateToId === undefined ? undefined : renderContext.stateToOwnerCountry[stateToId];
        return ownerFrom !== ownerTo;
    }

    public renderHoverSelection(renderer: Renderer, worldMap: FEWorldMap): void {
        const hover = this.hover$.value;
        renderer.renderRegionHoverSelection(
            worldMap,
            this.getCountryProvinces(hover, worldMap, renderer.selectedConditions),
            this.getCountryProvinces(this.selected$.value, worldMap, renderer.selectedConditions),
        );
        if (hover && renderer.isTooltipVisible()) {
            this.renderCountryTooltip(renderer, hover, worldMap);
        }
    }

    public updateHover(worldMap: FEWorldMap, x: number, y: number, selectedConditions: ConditionItem[]): void {
        const province = worldMap.getProvinceByPosition(x, y);
        const state = province === undefined ? undefined : worldMap.getStateByProvinceId(province.id);
        this.hover$.next(state === undefined ? undefined : worldMap.getCountryByState(state, selectedConditions, 'owner'));
    }

    public openMapItem(worldMap: FEWorldMap, useHoverValue: boolean): void {
        const selected = useHoverValue ? this.hover$.value : this.selected$.value;
        if (selected) {
            const country = worldMap.getCountryByTag(selected);
            if (country) {
                vscode.postMessage<WorldMapMessage>({ command: 'openfile', type: 'country', file: country.file, start: 0, end: 0 });
            }
        }
    }

    public canOpenMapItem(worldMap: FEWorldMap): boolean {
        return this.selected$.value !== undefined;
    }

    private getCountryProvinces(
        tag: string | undefined,
        worldMap: FEWorldMap,
        selectedConditions: ConditionItem[],
    ): { provinces: number[] } | undefined {
        if (!tag) {
            return undefined;
        }

        const ownerCountryToState = worldMap.getOwnerCountryToStatesMap(selectedConditions);
        const provinces: number[] = [];
        for (const stateId of ownerCountryToState[tag] ?? []) {
            const state = worldMap.getStateById(stateId);
            if (state) {
                provinces.push(...state.provinces);
            }
        }
        return { provinces };
    }

    private renderCountryTooltip(renderer: Renderer, tag: string, worldMap: FEWorldMap): void {
        const ownerCountryToState = worldMap.getOwnerCountryToStatesMap(renderer.selectedConditions);
        const states = ownerCountryToState[tag] ?? [];
        const country = worldMap.getCountryByTag(tag);
        renderer.renderTooltip(`
${feLocalize('worldmap.tooltip.country', 'Country')}=${tag}${country?.localisedName ? ` (${country.localisedName})` : ''}
${feLocalize('worldmap.tooltip.states', 'States')}=${states.join(',')}`);
    }
}

function getCountryRegions(
    worldMap: Pick<FEWorldMap, 'width' | 'forEachProvince'>,
    renderedProvinces: Province[],
    provinceToState: Record<number, number | undefined>,
    stateToOwnerCountry: Record<number, string | undefined>,
): CountryRegion[] {
    const provincesById = new Map<number, Province>();
    const provinceToOwnerCountry = new Map<number, string>();
    const renderedOwnerCountries = new Set(renderedProvinces.map(province => {
        const stateId = provinceToState[province.id];
        return stateId !== undefined ? stateToOwnerCountry[stateId] : undefined;
    }));
    worldMap.forEachProvince(province => {
        const stateId = provinceToState[province.id];
        const owner = stateId === undefined ? undefined : stateToOwnerCountry[stateId];
        if (province.type === 'land' && owner && renderedOwnerCountries.has(owner)) {
            provincesById.set(province.id, province);
            provinceToOwnerCountry.set(province.id, owner);
        }
    });

    const result: CountryRegion[] = [];
    const remaining = new Set<number>(provincesById.keys());
    while (remaining.size > 0) {
        const provinceId = remaining.values().next().value!;
        const owner = provinceToOwnerCountry.get(provinceId)!;
        const component: Province[] = [];
        const queue = [provinceId];
        remaining.delete(provinceId);

        while (queue.length > 0) {
            const province = provincesById.get(queue.pop()!)!;
            component.push(province);
            for (const edge of province.edges) {
                if (provinceToOwnerCountry.get(edge.to) === owner && remaining.delete(edge.to)) {
                    queue.push(edge.to);
                }
            }
        }

        const region = mergeRegions(component, worldMap.width);
        result.push({
            owner,
            province: component[0],
            ...region,
            labelPosition: getLabelPosition(component, region, worldMap.width),
        });
    }

    return result;
}

function getLabelPosition(provinces: Province[], region: Region, mapWidth: number): Point {
    const candidate = region.centerOfMass;

    for (const province of provinces) {
        if (inZone(candidate, province.boundingBox) && province.coverZones.some(zone => inZone(candidate, zone))) {
            return candidate;
        }
    }

    const scanZone = region.boundingBox.w > region.boundingBox.h ?
        { x: candidate.x, y: region.boundingBox.y, w: 0, h: region.boundingBox.h } :
        { x: region.boundingBox.x, y: candidate.y, w: region.boundingBox.w, h: 0 };
    const leftOrTopProvinces: Province[] = [];
    const rightOrBottomProvinces: Province[] = [];
    for (const province of provinces) {
        if (intersectZone(scanZone, province.boundingBox)) {
            if (region.boundingBox.w > region.boundingBox.h) {
                (province.centerOfMass.y < candidate.y ? leftOrTopProvinces : rightOrBottomProvinces).push(province);
            } else {
                (province.centerOfMass.x < candidate.x ? leftOrTopProvinces : rightOrBottomProvinces).push(province);
            }
        }
    }

    const leftOrTopRegion = leftOrTopProvinces.length > 0 ? mergeRegions(leftOrTopProvinces, mapWidth) : undefined;
    const rightOrBottomRegion = rightOrBottomProvinces.length > 0 ? mergeRegions(rightOrBottomProvinces, mapWidth) : undefined;
    if (leftOrTopRegion && rightOrBottomRegion) {
        return distanceSqr(candidate, leftOrTopRegion.centerOfMass) < distanceSqr(candidate, rightOrBottomRegion.centerOfMass) ?
            leftOrTopRegion.centerOfMass : rightOrBottomRegion.centerOfMass;
    }
    if (rightOrBottomRegion) {
        return rightOrBottomRegion.centerOfMass;
    }
    if (leftOrTopRegion) {
        return leftOrTopRegion.centerOfMass;
    }

    let minDistance = Number.MAX_VALUE;
    let nearestProvince: Province | undefined;
    for (const province of provinces) {
        const distance = distanceSqr(candidate, province.centerOfMass);
        if (distance < minDistance) {
            minDistance = distance;
            nearestProvince = province;
        }
    }

    return nearestProvince?.centerOfMass ?? candidate;
}
