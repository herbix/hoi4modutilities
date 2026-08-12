import { Zone, Point, Region, MapLoaderExtra } from "../definitions";
import { DetailValue, Enum } from '../../../hoiformat/schema';
import { clipNumber, hsvToRgb } from '../../../util/common';
import { Loader as CommonLoader, FileLoader as CommonFileLoader, FolderLoader as CommonFolderLoader, mergeInLoadResult as commonMergeInLoadResult, LoadResult as CommonLoadResult, LoadResultOD as CommonLoadResultOD } from '../../../util/loader/loader';
import { maxBy } from 'lodash';
import { mergeRegions } from '../graphutils';

export abstract class Loader<T> extends CommonLoader<T, MapLoaderExtra> {}
export abstract class FileLoader<T> extends CommonFileLoader<T, MapLoaderExtra> {}
export abstract class FolderLoader<T, F, A extends unknown[]=[]> extends CommonFolderLoader<T, F, MapLoaderExtra, MapLoaderExtra, A> {}

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
        let [ r, g, b ] = vec;
        r = clipNumber(r, 0, 255);
        g = clipNumber(g, 0, 255);
        b = clipNumber(b, 0, 255);
        return (r << 16) | (g << 8) | b;
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

export function addPointToZone(zone: Zone, point: Point): void {
    if (point.x < zone.x) {
        zone.w += zone.x - point.x;
        zone.x = point.x;
    } else if (point.x >= zone.x + zone.w) {
        zone.w = point.x - zone.x + 1;
    }

    if (point.y < zone.y) {
        zone.h += zone.y - point.y;
        zone.y = point.y;
    } else if (point.y >= zone.y + zone.h) {
        zone.h = point.y - zone.y + 1;
    }
}
