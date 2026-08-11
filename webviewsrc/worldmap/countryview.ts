import { Province, Region } from "./definitions";
import { mergeRegions } from "../../src/previewdef/worldmap/loader/region";
import { FEWorldMap } from "./loader";

export interface CountryRegion extends Region {
    owner: string;
    province: Province;
}

export function getCountryRegions(
    worldMap: Pick<FEWorldMap, 'width' | 'forEachProvince'>,
    provinceToState: Record<number, number | undefined>,
    stateToOwnerCountry: Record<number, string | undefined>,
): CountryRegion[] {
    const provincesById = new Map<number, Province>();
    const owners = new Map<number, string>();
    worldMap.forEachProvince(province => {
        const stateId = provinceToState[province.id];
        const owner = stateId === undefined ? undefined : stateToOwnerCountry[stateId];
        if (province.type === 'land' && owner) {
            provincesById.set(province.id, province);
            owners.set(province.id, owner);
        }
    });

    const result: CountryRegion[] = [];
    const remaining = new Set<number>(provincesById.keys());
    while (remaining.size > 0) {
        const provinceId = remaining.values().next().value!;
        const owner = owners.get(provinceId)!;
        const component: Province[] = [];
        const queue = [provinceId];
        remaining.delete(provinceId);

        while (queue.length > 0) {
            const province = provincesById.get(queue.pop()!)!;
            component.push(province);
            for (const edge of province.edges) {
                if (owners.get(edge.to) === owner && remaining.delete(edge.to)) {
                    queue.push(edge.to);
                }
            }
        }

        result.push({ owner, province: component[0], ...mergeRegions(component, worldMap.width) });
    }

    return result;
}
