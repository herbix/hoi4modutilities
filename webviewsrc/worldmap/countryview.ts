import { Province, Region } from "../../src/previewdef/worldmap/definitions";
import { mergeRegions } from "../../src/previewdef/worldmap/loader/region";

export interface CountryTag extends Region {
    owner: string;
    province: Province;
}

export function getCountryTags(
    provinces: { width: number; forEachProvince(callback: (province: Province) => boolean | void): void },
    provinceToState: Record<number, number | undefined>,
    getStateOwner: (stateId: number) => string | undefined,
): CountryTag[] {
    const provincesById = new Map<number, Province>();
    const owners = new Map<number, string>();
    provinces.forEachProvince(province => {
        const stateId = provinceToState[province.id];
        const owner = stateId === undefined ? undefined : getStateOwner(stateId);
        if (province.type === 'land' && owner) {
            provincesById.set(province.id, province);
            owners.set(province.id, owner);
        }
    });

    const result: CountryTag[] = [];
    const remaining = new Set(provincesById.keys());
    while (remaining.size > 0) {
        const provinceId = remaining.values().next().value as number;
        const owner = owners.get(provinceId)!;
        const component: Province[] = [];
        const queue = [provinceId];
        remaining.delete(provinceId);

        while (queue.length > 0) {
            const province = provincesById.get(queue.pop()!)!;
            component.push(province);
            for (const edge of province.edges) {
                if (edge.path.length > 0 && owners.get(edge.to) === owner && remaining.delete(edge.to)) {
                    queue.push(edge.to);
                }
            }
        }

        result.push({ owner, province: component[0], ...mergeRegions(component, provinces.width) });
    }

    return result;
}
