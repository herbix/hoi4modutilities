import { Province, Region, Point } from "./definitions";
import { FEWorldMap } from "./loader";
import { distanceSqr, intersectZone, inZone, mergeRegions } from "../../src/previewdef/worldmap/graphutils";

export interface CountryRegion extends Region {
    owner: string;
    province: Province;
    labelPosition: Point;
}

export function getCountryRegions(
    worldMap: Pick<FEWorldMap, 'width' | 'forEachProvince'>,
    renderedProvinces: Province[],
    provinceToState: Record<number, number | undefined>,
    stateToOwnerCountry: Record<number, string | undefined>,
): CountryRegion[] {
    const provincesById = new Map<number, Province>();
    const provinceToOwnerCountry = new Map<number, string>();
    const renderedOwnerCountries = new Set(renderedProvinces.map(p => {
        const stateId = provinceToState[p.id];
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
        result.push({ owner, province: component[0], ...region, labelPosition: getLabelPosition(component, region, worldMap.width) });
    }

    return result;
}

function getLabelPosition(provinces: Province[], region: Region, mapWidth: number): Point {
    let candidate = region.centerOfMass;

    // inside any province?
    for (const province of provinces) {
        if (inZone(candidate, province.boundingBox) && province.coverZones.some(z => inZone(candidate, z))) {
            return candidate;
        }
    }

    // scan a line from the center of mass
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
        if (distanceSqr(candidate, leftOrTopRegion.centerOfMass) < distanceSqr(candidate, rightOrBottomRegion.centerOfMass)) {
            return leftOrTopRegion.centerOfMass;
        } else {
            return rightOrBottomRegion.centerOfMass;
        }
    } else if (rightOrBottomRegion && !leftOrTopRegion) {
        return rightOrBottomRegion.centerOfMass;
    } else if (leftOrTopRegion && !rightOrBottomRegion) {
        return leftOrTopRegion.centerOfMass;
    }

    // select nearest province
    let minDistance = Number.MAX_VALUE;
    let nearestProvince: Province | undefined = undefined;
    for (const province of provinces) {
        const d = distanceSqr(candidate, province.centerOfMass);
        if (d < minDistance) {
            minDistance = d;
            nearestProvince = province;
        }
    }

    return nearestProvince?.centerOfMass ?? candidate;
}

