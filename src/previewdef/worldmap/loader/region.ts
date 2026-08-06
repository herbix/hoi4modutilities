import { Region, Zone } from "../definitions";

export function mergeRegions(regions: (Zone | Region)[], width: number): Region {
    const oneFourthWidth = 0.25 * width;
    const halfWidth = 0.5 * width;
    const threeFourthWidth = 0.75 * width;
    const nearBorder = regions.map(r => 'mass' in r ? r.boundingBox : r).every(z => z.w + z.x < oneFourthWidth || z.x > threeFourthWidth);

    let massX = 0;
    let massY = 0;
    let mass = 0;

    let minX = 1e10;
    let minY = 1e10;
    let maxX = -1e10;
    let maxY = -1e10;

    for (const region of regions) {
        let regionBondingBox: Zone;
        if ('mass' in region) {
            massX += (region.centerOfMass.x + (nearBorder && region.centerOfMass.x > halfWidth ? -width : 0)) * region.mass;
            massY += region.centerOfMass.y * region.mass;
            mass += region.mass;
            regionBondingBox = region.boundingBox;
        } else {
            const regionMass = region.h * region.w;
            massX += ((region.x + region.w / 2) + (nearBorder && region.x + region.w / 2 > halfWidth ? -width : 0)) * regionMass;
            massY += (region.y + region.h / 2) * regionMass;
            mass += regionMass;
            regionBondingBox = region;
        }

        minX = Math.min(minX, regionBondingBox.x + (nearBorder && regionBondingBox.x > halfWidth ? -width : 0));
        minY = Math.min(minY, regionBondingBox.y);
        maxX = Math.max(maxX, regionBondingBox.x + regionBondingBox.w + (nearBorder && regionBondingBox.x > halfWidth ? -width : 0));
        maxY = Math.max(maxY, regionBondingBox.y + regionBondingBox.h);
    }

    let x = massX / mass;
    if (x < 0) {
        x += width;
    }

    if (minX < 0) {
        minX += width;
        maxX += width;
    }

    return {
        boundingBox: { x: minX, y: minY, w: maxX - minX, h: maxY - minY },
        centerOfMass: { x, y: massY / mass },
        mass,
    };
}
