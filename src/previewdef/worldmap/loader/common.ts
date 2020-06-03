import { Zone, Point, Region, MapLoaderExtra } from "../definitions";
import { DetailValue, Enum } from '../../../hoiformat/schema';
import { hsvToRgb } from '../../../util/common';
import { Loader as CommonLoader, FileLoader as CommonFileLoader, FolderLoader as CommonFolderLoader, mergeInLoadResult as commonMergeInLoadResult, LoadResult as CommonLoadResult, LoadResultOD as CommonLoadResultOD } from '../../../util/loader';
import { maxBy } from "lodash";

export abstract class Loader<T> extends CommonLoader<T, MapLoaderExtra> {}
export abstract class FileLoader<T> extends CommonFileLoader<T, MapLoaderExtra> {}
export abstract class FolderLoader<T, F> extends CommonFolderLoader<T, F, MapLoaderExtra, MapLoaderExtra> {}

export const mergeInLoadResult = commonMergeInLoadResult;

export type LoadResult<T> = CommonLoadResult<T, MapLoaderExtra>;
export type LoadResultOD<T> = CommonLoadResultOD<T, MapLoaderExtra>;

export function pointEqual(a: Point, b: Point): boolean {
    return a.x === b.x && a.y === b.y;
}

export function convertColor(color: DetailValue<Enum> | undefined): number {
    if (!color) {
        return 0;
    }

    const vec = color._value._values.map(e => parseFloat(e));
    if (vec.length < 3) {
        return 0;
    }

    if (!color._attachment || color._attachment.toLowerCase() === 'rgb') {
        return (vec[0] << 16) | (vec[1] << 8) | vec[2];
    }

    if (color._attachment.toLowerCase() === 'hsv') {
        const { r, g, b } = hsvToRgb(vec[0], vec[1], vec[2]);
        return (r << 16) | (g << 8) | b;
    }

    return 0;
}

export function sortItems<T extends { id: number }>(
    items: T[],
    validMaxId: number,
    onMaxIdTooLarge: (maxId: number) => void,
    onConflict: (newItem: T, existingItem: T, badId: number) => void,
    onNotExist: (startId: number, endId: number) => void,
    reassignMinusOneId: boolean = true,
    badId: number = -1,
): { sorted: T[], badId: number } {
    const maxId = maxBy(items, 'id')?.id ?? 0;
    if (maxId > validMaxId) {
        onMaxIdTooLarge(maxId);
    }

    const result: T[] = new Array(maxId + 1);
    items.forEach(p => {
        if (reassignMinusOneId && p.id === -1) {
            p.id = badId--;
        }
        if (result[p.id]) {
            const conflictItem = result[p.id];
            onConflict(p, conflictItem, badId);
            conflictItem.id = badId--;
            result[conflictItem.id] = conflictItem;
        }
        result[p.id] = p;
    });

    let lastNotExistStateId: number | undefined = undefined;
    for (let i = 1; i <= maxId; i++) {
        if (result[i]) {
            if (lastNotExistStateId !== undefined) {
                onNotExist(lastNotExistStateId, i - 1);
                lastNotExistStateId = undefined;
            }
        } else {
            if (lastNotExistStateId === undefined) {
                lastNotExistStateId = i;
            }
        }
    };

    return {
        sorted: result,
        badId,
    };
}

export function mergeRegion<K extends string, T extends { [k in K]: number[] }>(
    input: T,
    subRegionIdType: K,
    subRegions: (Region | undefined | null)[],
    width: number,
    onRegionNotExist: (regionId: number) => void,
    onNoRegion: () => void
): T & Region {
    const regionsInInput = input[subRegionIdType]
        .map(r => {
            const region = subRegions[r];
            if (!region) {
                onRegionNotExist(r);
            }
            return region;
        })
        .filter((r): r is Region => !!r);

    let result: T & Region;
    if (regionsInInput.length > 0) {
        result = Object.assign(input, mergeRegions(regionsInInput, width));
    } else {
        result = Object.assign(input, { boundingBox: { x: 0, y: 0, w: 0, h: 0 }, centerOfMass: { x: 0, y: 0 }, mass: 0 });
        if (input[subRegionIdType].length > 0) {
            onNoRegion();
        }
    }

    return result;
}

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
