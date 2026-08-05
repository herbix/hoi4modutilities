import { Point, Zone } from "./definitions";

export interface CountryLabelRegion {
    id: number;
    owner: string;
    text: string;
    color: number;
    boundingBox: Zone;
    coverZones: Zone[];
    centerOfMass: Point;
    mass: number;
    neighbours: number[];
}

export interface CountryLabel {
    text: string;
    color: number;
    center: Point;
    angle: number;
    maxWidth: number;
    fontSize: number;
}

const maxLabelAngle = Math.PI / 6;
export const minCountryLabelWidthScale = 0.65;

export function calculateCountryLabels(regions: CountryLabelRegion[], mapWidth: number): CountryLabel[] {
    const regionById = new Map(regions.map(region => [region.id, region]));
    const regionsByOwner = new Map<string, CountryLabelRegion[]>();

    for (const region of regions) {
        const ownerRegions = regionsByOwner.get(region.owner) ?? [];
        ownerRegions.push(region);
        regionsByOwner.set(region.owner, ownerRegions);
    }

    const result: CountryLabel[] = [];
    for (const ownerRegions of regionsByOwner.values()) {
        const remaining = new Set(ownerRegions.map(region => region.id));

        while (remaining.size > 0) {
            const start = remaining.values().next().value as number;
            const component: CountryLabelRegion[] = [];
            const queue = [start];
            remaining.delete(start);

            while (queue.length > 0) {
                const region = regionById.get(queue.pop()!);
                if (!region) {
                    continue;
                }

                component.push(region);
                for (const neighbour of region.neighbours) {
                    const neighbourRegion = regionById.get(neighbour);
                    if (neighbourRegion?.owner === region.owner && remaining.delete(neighbour)) {
                        queue.push(neighbour);
                    }
                }
            }

            const label = calculateCountryLabel(component, mapWidth);
            if (label) {
                result.push(label);
            }
        }
    }

    return result;
}

function calculateCountryLabel(regions: CountryLabelRegion[], mapWidth: number): CountryLabel | undefined {
    const firstRegion = regions[0];
    if (!firstRegion) {
        return undefined;
    }

    const originX = firstRegion.centerOfMass.x;
    const points = regions.map(region => ({
        x: unwrapX(region.centerOfMass.x, originX, mapWidth),
        y: region.centerOfMass.y,
        weight: Math.max(1, region.mass),
    }));
    const totalMass = points.reduce((sum, point) => sum + point.weight, 0);
    const center = {
        x: points.reduce((sum, point) => sum + point.x * point.weight, 0) / totalMass,
        y: points.reduce((sum, point) => sum + point.y * point.weight, 0) / totalMass,
    };

    let covarianceXX = 0;
    let covarianceXY = 0;
    let covarianceYY = 0;
    for (const point of points) {
        const dx = point.x - center.x;
        const dy = point.y - center.y;
        covarianceXX += dx * dx * point.weight;
        covarianceXY += dx * dy * point.weight;
        covarianceYY += dy * dy * point.weight;
    }

    let angle = 0.5 * Math.atan2(2 * covarianceXY, covarianceXX - covarianceYY);
    if (Math.abs(covarianceXX) + Math.abs(covarianceXY) + Math.abs(covarianceYY) < 0.001) {
        angle = firstRegion.boundingBox.w >= firstRegion.boundingBox.h ? 0 : Math.PI / 2;
    }
    if (angle > Math.PI / 2) {
        angle -= Math.PI;
    } else if (angle < -Math.PI / 2) {
        angle += Math.PI;
    }
    angle = Math.max(-maxLabelAngle, Math.min(maxLabelAngle, angle));

    const zones = regions.flatMap(region => region.coverZones.map(zone => ({
        ...zone,
        x: unwrapX(zone.x + zone.w / 2, center.x, mapWidth) - zone.w / 2,
    })));
    const zoneIndex = createZoneIndex(zones);
    const candidateCenters = regions.map(region => {
        const zone = region.coverZones.reduce((largest, current) => current.w * current.h > largest.w * largest.h ? current : largest,
            region.coverZones[0] ?? region.boundingBox);
        return {
            x: unwrapX(zone.x + zone.w / 2, center.x, mapWidth),
            y: zone.y + zone.h / 2,
        };
    }).sort((a, b) => distanceSqr(a, center) - distanceSqr(b, center)).slice(0, 40);
    if (zoneIndex.contains(center)) {
        candidateCenters.unshift(center);
    }

    const direction = { x: Math.cos(angle), y: Math.sin(angle) };
    const across = { x: -direction.y, y: direction.x };
    const bounds = zones.reduce((result, zone) => ({
        left: Math.min(result.left, zone.x),
        right: Math.max(result.right, zone.x + zone.w),
        top: Math.min(result.top, zone.y),
        bottom: Math.max(result.bottom, zone.y + zone.h),
    }), { left: Number.POSITIVE_INFINITY, right: Number.NEGATIVE_INFINITY, top: Number.POSITIVE_INFINITY, bottom: Number.NEGATIVE_INFINITY });
    const maxDistance = Math.hypot(bounds.right - bounds.left, bounds.bottom - bounds.top);
    const labelSpace = candidateCenters.map(candidate => calculateLabelSpace(candidate, direction, across, zoneIndex, maxDistance))
        .reduce((best, current) => current.width * current.height > best.width * best.height ? current : best,
            { center: candidateCenters[0], width: 0, height: 0 });

    const maxWidth = labelSpace.width * 0.85;
    const maxHeight = labelSpace.height * 0.55;
    const fontSize = Math.min(maxHeight, maxWidth / estimateTextWidth(firstRegion.text) / minCountryLabelWidthScale);
    if (maxWidth < 8) {
        return undefined;
    }

    return {
        text: firstRegion.text,
        color: firstRegion.color,
        center: { x: wrapX(labelSpace.center.x, mapWidth), y: labelSpace.center.y },
        angle,
        maxWidth,
        fontSize,
    };
}

interface ZoneIndex {
    contains(point: Point): boolean;
}

function createZoneIndex(zones: Zone[]): ZoneIndex {
    const cellSize = 32;
    const cells = new Map<string, Zone[]>();
    for (const zone of zones) {
        const left = Math.floor(zone.x / cellSize);
        const right = Math.floor((zone.x + zone.w - 0.001) / cellSize);
        const top = Math.floor(zone.y / cellSize);
        const bottom = Math.floor((zone.y + zone.h - 0.001) / cellSize);
        for (let x = left; x <= right; x++) {
            for (let y = top; y <= bottom; y++) {
                const key = `${x},${y}`;
                const cell = cells.get(key) ?? [];
                cell.push(zone);
                cells.set(key, cell);
            }
        }
    }

    return {
        contains(point: Point) {
            const cell = cells.get(`${Math.floor(point.x / cellSize)},${Math.floor(point.y / cellSize)}`) ?? [];
            return cell.some(zone => point.x >= zone.x && point.x < zone.x + zone.w && point.y >= zone.y && point.y < zone.y + zone.h);
        },
    };
}

function calculateLabelSpace(center: Point, direction: Point, across: Point, zoneIndex: ZoneIndex, maxDistance: number) {
    const width = measureSymmetricDistance(center, direction, zoneIndex, maxDistance);
    const height = measureSymmetricDistance(center, across, zoneIndex, maxDistance);
    const bandOffset = height * 0.4;
    const widths = [width];
    for (const offset of [-bandOffset, -bandOffset / 2, bandOffset / 2, bandOffset]) {
        const bandCenter = { x: center.x + across.x * offset, y: center.y + across.y * offset };
        widths.push(measureSymmetricDistance(bandCenter, direction, zoneIndex, maxDistance));
    }
    return { center, width: Math.min(...widths), height };
}

function measureSymmetricDistance(center: Point, direction: Point, zoneIndex: ZoneIndex, maxDistance: number): number {
    if (!zoneIndex.contains(center)) {
        return 0;
    }
    return 2 * Math.min(
        measureDistance(center, direction, zoneIndex, maxDistance),
        measureDistance(center, { x: -direction.x, y: -direction.y }, zoneIndex, maxDistance));
}

function measureDistance(center: Point, direction: Point, zoneIndex: ZoneIndex, maxDistance: number): number {
    for (let distance = 1; distance <= maxDistance; distance++) {
        if (!zoneIndex.contains({ x: center.x + direction.x * distance, y: center.y + direction.y * distance })) {
            return distance - 1;
        }
    }
    return maxDistance;
}

function distanceSqr(a: Point, b: Point): number {
    return (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
}

function unwrapX(x: number, origin: number, mapWidth: number): number {
    if (mapWidth <= 0) {
        return x;
    }
    while (x - origin > mapWidth / 2) {
        x -= mapWidth;
    }
    while (x - origin < -mapWidth / 2) {
        x += mapWidth;
    }
    return x;
}

function wrapX(x: number, mapWidth: number): number {
    if (mapWidth <= 0) {
        return x;
    }
    return (x % mapWidth + mapWidth) % mapWidth;
}

function estimateTextWidth(text: string): number {
    let result = 0;
    for (const character of text) {
        result += /\s/.test(character) ? 0.35 : character.charCodeAt(0) > 0xFF ? 1 : 0.62;
    }
    return Math.max(1, result);
}
