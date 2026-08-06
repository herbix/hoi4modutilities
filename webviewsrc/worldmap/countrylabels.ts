import { Point, Zone } from "./definitions";

export interface CountryLabelRegion {
    id: number;
    owner: string;
    text: string;
    color: number;
    boundingBox: Zone;
    coverZones: Zone[];
    boundaryPaths?: Point[][];
    centerOfMass: Point;
    mass: number;
    neighbours: number[];
    textWidthRatio?: number;
}

export interface CountryLabel {
    owner: string;
    text: string;
    color: number;
    center: Point;
    fallbackCenter: Point;
    angle: number;
    maxWidth: number;
    fontSize: number;
    arc?: {
        centerOffset: Point;
        centerAngle: number;
        radius: number;
        span: number;
        direction: 1 | -1;
    };
}

interface Segment { from: Point; to: Point; }
interface Triangle { a: number; b: number; c: number; center: Point; radiusSqr: number; }
interface SkeletonEdge { to: number; length: number; clearance: number; }
interface SkeletonNode { point: Point; edges: SkeletonEdge[]; }
interface Circle { center: Point; radius: number; }
interface ZoneIndex { contains(point: Point): boolean; }

const maxLabelSpan = Math.PI / 3;
const maxStraightAngle = Math.PI / 6;
const maxCurvedAngle = Math.PI / 3;
const maxBoundarySamples = 96;
const maxCandidatePaths = 4;
const tau = Math.PI * 2;

export function calculateCountryLabels(regions: CountryLabelRegion[], mapWidth: number): CountryLabel[] {
    const byId = new Map(regions.map(region => [region.id, region]));
    const remaining = new Set(regions.map(region => region.id));
    const result: CountryLabel[] = [];

    while (remaining.size > 0) {
        const start = remaining.values().next().value as number;
        const component: CountryLabelRegion[] = [];
        const queue = [start];
        remaining.delete(start);
        while (queue.length > 0) {
            const region = byId.get(queue.pop()!);
            if (!region) {
                continue;
            }
            component.push(region);
            for (const neighbour of region.neighbours) {
                if (byId.get(neighbour)?.owner === region.owner && remaining.delete(neighbour)) {
                    queue.push(neighbour);
                }
            }
        }
        const label = layoutComponent(component, mapWidth);
        if (label) {
            result.push(label);
        }
    }
    return result;
}

function layoutComponent(regions: CountryLabelRegion[], mapWidth: number): CountryLabel | undefined {
    const region = regions[0];
    if (!region) {
        return undefined;
    }
    const originX = region.centerOfMass.x;
    const mass = regions.reduce((sum, item) => sum + Math.max(1, item.mass), 0);
    const center = {
        x: regions.reduce((sum, item) => sum + unwrapX(item.centerOfMass.x, originX, mapWidth) * Math.max(1, item.mass), 0) / mass,
        y: regions.reduce((sum, item) => sum + item.centerOfMass.y * Math.max(1, item.mass), 0) / mass,
    };
    const zones = regions.flatMap(item => item.coverZones.map(zone => ({
        ...zone,
        x: unwrapX(zone.x + zone.w / 2, center.x, mapWidth) - zone.w / 2,
    })));
    const zoneIndex = createZoneIndex(zones);
    const textWidthRatio = Math.max(1, region.textWidthRatio ?? estimateTextWidth(region.text));
    // The extra three character heights are Imhof's 1.5-character margins at both ends.
    const aspect = 1 / (textWidthRatio + 3);
    const boundary = sampleBoundary(collectBoundary(regions, center.x, mapWidth));
    const skeleton = createSkeleton(boundary, zoneIndex);
    const paths = findCandidatePaths(skeleton, aspect);

    let best = placeStraight(region, zones, zoneIndex, center, textWidthRatio, aspect, mapWidth, 0);
    for (const path of paths) {
        const points = path.map(index => skeleton[index].point);
        const angle = Math.atan2(points[points.length - 1].y - points[0].y, points[points.length - 1].x - points[0].x);
        const straight = placeStraight(region, zones, zoneIndex, center, textWidthRatio, aspect, mapWidth, angle, points);
        if (straight && isBetter(straight, best)) {
            best = straight;
        }
        const circle = circleThrough(points[0], points[Math.floor(points.length / 2)], points[points.length - 1]);
        const curved = circle && placeCurved(region, circle, points, zoneIndex, center, textWidthRatio, aspect, mapWidth);
        if (curved && isBetter(curved, best)) {
            best = curved;
        }
    }
    return best;
}

function collectBoundary(regions: CountryLabelRegion[], originX: number, mapWidth: number): Segment[] {
    const paths = regions.flatMap(region => region.boundaryPaths ?? []);
    if (paths.length === 0) {
        return regions.flatMap(region => region.coverZones.flatMap(zone => {
            const x = unwrapX(zone.x + zone.w / 2, originX, mapWidth) - zone.w / 2;
            const corners = [{ x, y: zone.y }, { x: x + zone.w, y: zone.y },
                { x: x + zone.w, y: zone.y + zone.h }, { x, y: zone.y + zone.h }];
            return corners.map((point, index) => ({ from: point, to: corners[(index + 1) % corners.length] }));
        }));
    }
    const result: Segment[] = [];
    for (const path of paths) {
        let previous = path[0] && { x: unwrapX(path[0].x, originX, mapWidth), y: path[0].y };
        for (let i = 1; previous && i < path.length; i++) {
            const current = { x: unwrapX(path[i].x, previous.x, mapWidth), y: path[i].y };
            if (distanceSqr(previous, current) > 0) {
                result.push({ from: previous, to: current });
            }
            previous = current;
        }
    }
    return result;
}

function sampleBoundary(segments: Segment[]): Point[] {
    const total = segments.reduce((sum, segment) => sum + distance(segment.from, segment.to), 0);
    if (total === 0) {
        return [];
    }
    const step = Math.max(1, total / maxBoundarySamples);
    const result: Point[] = [];
    const seen = new Set<string>();
    let traversed = 0;
    let next = 0;
    for (const segment of segments) {
        const length = distance(segment.from, segment.to);
        while (next <= traversed + length && result.length < maxBoundarySamples) {
            const ratio = length === 0 ? 0 : (next - traversed) / length;
            const point = { x: segment.from.x + (segment.to.x - segment.from.x) * ratio,
                y: segment.from.y + (segment.to.y - segment.from.y) * ratio };
            const key = `${point.x.toFixed(2)},${point.y.toFixed(2)}`;
            if (!seen.has(key)) {
                seen.add(key);
                result.push(point);
            }
            next += step;
        }
        traversed += length;
    }
    return result;
}

function createSkeleton(points: Point[], zoneIndex: ZoneIndex): SkeletonNode[] {
    const triangles = triangulate(points);
    const nodes = triangles.map(triangle => ({ point: triangle.center, edges: [] as SkeletonEdge[] }));
    const edgeMap = new Map<string, { triangle: number; from: number; to: number }>();
    triangles.forEach((triangle, triangleIndex) => {
        for (const [from, to] of [[triangle.a, triangle.b], [triangle.b, triangle.c], [triangle.c, triangle.a]] as [number, number][]) {
            const key = from < to ? `${from},${to}` : `${to},${from}`;
            const other = edgeMap.get(key);
            if (!other) {
                edgeMap.set(key, { triangle: triangleIndex, from, to });
                continue;
            }
            const first = triangles[other.triangle];
            if (!lineInside(first.center, triangle.center, zoneIndex)) {
                continue;
            }
            const edgeFrom = points[from];
            const edgeTo = points[to];
            const oppositeSides = cross(edgeFrom, edgeTo, first.center) * cross(edgeFrom, edgeTo, triangle.center) < 0;
            const clearance = oppositeSides ? distance(edgeFrom, edgeTo) / 2 :
                Math.min(Math.sqrt(first.radiusSqr), Math.sqrt(triangle.radiusSqr));
            const length = distance(first.center, triangle.center);
            if (clearance > 0 && length > 0 && Number.isFinite(clearance)) {
                nodes[other.triangle].edges.push({ to: triangleIndex, length, clearance });
                nodes[triangleIndex].edges.push({ to: other.triangle, length, clearance });
            }
        }
    });
    return nodes;
}

function triangulate(input: Point[]): Triangle[] {
    if (input.length < 3) {
        return [];
    }
    const points = [...input];
    const bounds = input.reduce((box, point) => ({ left: Math.min(box.left, point.x), right: Math.max(box.right, point.x),
        top: Math.min(box.top, point.y), bottom: Math.max(box.bottom, point.y) }),
    { left: Infinity, right: -Infinity, top: Infinity, bottom: -Infinity });
    const size = Math.max(1, bounds.right - bounds.left, bounds.bottom - bounds.top);
    const center = { x: (bounds.left + bounds.right) / 2, y: (bounds.top + bounds.bottom) / 2 };
    const superStart = points.length;
    points.push({ x: center.x - size * 32, y: center.y + size * 16 }, { x: center.x, y: center.y - size * 32 },
        { x: center.x + size * 32, y: center.y + size * 16 });
    let triangles = [makeTriangle(superStart, superStart + 1, superStart + 2, points)!];

    for (let pointIndex = 0; pointIndex < input.length; pointIndex++) {
        const bad = triangles.filter(triangle => distanceSqr(points[pointIndex], triangle.center) <= triangle.radiusSqr + 0.0001);
        const badSet = new Set(bad);
        const border = new Map<string, [number, number]>();
        for (const triangle of bad) {
            for (const [from, to] of [[triangle.a, triangle.b], [triangle.b, triangle.c], [triangle.c, triangle.a]] as [number, number][]) {
                const key = from < to ? `${from},${to}` : `${to},${from}`;
                if (border.has(key)) {
                    border.delete(key);
                } else {
                    border.set(key, [from, to]);
                }
            }
        }
        triangles = triangles.filter(triangle => !badSet.has(triangle));
        for (const [from, to] of border.values()) {
            const triangle = makeTriangle(from, to, pointIndex, points);
            if (triangle) {
                triangles.push(triangle);
            }
        }
    }
    return triangles.filter(triangle => triangle.a < input.length && triangle.b < input.length && triangle.c < input.length);
}

function makeTriangle(a: number, b: number, c: number, points: Point[]): Triangle | undefined {
    const pa = points[a], pb = points[b], pc = points[c];
    const denominator = 2 * (pa.x * (pb.y - pc.y) + pb.x * (pc.y - pa.y) + pc.x * (pa.y - pb.y));
    if (Math.abs(denominator) < 0.000001) {
        return undefined;
    }
    const aa = pa.x * pa.x + pa.y * pa.y, bb = pb.x * pb.x + pb.y * pb.y, cc = pc.x * pc.x + pc.y * pc.y;
    const center = { x: (aa * (pb.y - pc.y) + bb * (pc.y - pa.y) + cc * (pa.y - pb.y)) / denominator,
        y: (aa * (pc.x - pb.x) + bb * (pa.x - pc.x) + cc * (pb.x - pa.x)) / denominator };
    return { a, b, c, center, radiusSqr: distanceSqr(center, pa) };
}

function findCandidatePaths(graph: SkeletonNode[], aspect: number): number[][] {
    const clearances = graph.flatMap(node => node.edges.map(edge => edge.clearance));
    if (clearances.length === 0) {
        return [];
    }
    const result: number[][] = [];
    const seen = new Set<string>();
    const maximum = Math.max(...clearances);
    for (let clearance = maximum; clearance >= Math.max(0.5, maximum / 16) && result.length < maxCandidatePaths; clearance /= Math.SQRT2) {
        for (const component of graphComponents(graph, clearance)) {
            const first = dijkstra(graph, component, component[0], clearance);
            const start = farthest(first.distances, component);
            const second = dijkstra(graph, component, start, clearance);
            const end = farthest(second.distances, component);
            if (second.distances[end] < 2 * clearance / aspect) {
                continue;
            }
            const key = start < end ? `${start},${end}` : `${end},${start}`;
            if (!seen.has(key)) {
                seen.add(key);
                result.push(restorePath(end, second.previous));
            }
            if (result.length >= maxCandidatePaths) {
                break;
            }
        }
    }
    return result;
}

function graphComponents(graph: SkeletonNode[], clearance: number): number[][] {
    const remaining = new Set(graph.map((node, index) => node.edges.some(edge => edge.clearance >= clearance) ? index : -1)
        .filter(index => index >= 0));
    const result: number[][] = [];
    while (remaining.size > 0) {
        const component: number[] = [];
        const stack = [remaining.values().next().value as number];
        remaining.delete(stack[0]);
        while (stack.length > 0) {
            const node = stack.pop()!;
            component.push(node);
            for (const edge of graph[node].edges) {
                if (edge.clearance >= clearance && remaining.delete(edge.to)) {
                    stack.push(edge.to);
                }
            }
        }
        result.push(component);
    }
    return result;
}

function dijkstra(graph: SkeletonNode[], component: number[], source: number, clearance: number) {
    const allowed = new Set(component);
    const distances = new Array(graph.length).fill(Infinity);
    const previous = new Array(graph.length).fill(-1);
    const queue: { node: number; distance: number }[] = [{ node: source, distance: 0 }];
    distances[source] = 0;
    while (queue.length > 0) {
        queue.sort((a, b) => b.distance - a.distance);
        const current = queue.pop()!;
        if (current.distance !== distances[current.node]) {
            continue;
        }
        for (const edge of graph[current.node].edges) {
            const next = current.distance + edge.length;
            if (edge.clearance >= clearance && allowed.has(edge.to) && next < distances[edge.to]) {
                distances[edge.to] = next;
                previous[edge.to] = current.node;
                queue.push({ node: edge.to, distance: next });
            }
        }
    }
    return { distances, previous };
}

function farthest(distances: number[], nodes: number[]): number {
    return nodes.reduce((best, node) => distances[node] > distances[best] ? node : best, nodes[0]);
}

function restorePath(end: number, previous: number[]): number[] {
    const result: number[] = [];
    for (let node = end; node !== -1; node = previous[node]) {
        result.push(node);
    }
    return result.reverse();
}

// Three representative path points are sufficient for the preview; the paper's iterative least-squares refinement is intentionally omitted.
function circleThrough(first: Point, middle: Point, last: Point): Circle | undefined {
    const denominator = 2 * (first.x * (middle.y - last.y) + middle.x * (last.y - first.y) + last.x * (first.y - middle.y));
    if (Math.abs(denominator) < 0.0001) {
        return undefined;
    }
    const a = first.x * first.x + first.y * first.y;
    const b = middle.x * middle.x + middle.y * middle.y;
    const c = last.x * last.x + last.y * last.y;
    const center = { x: (a * (middle.y - last.y) + b * (last.y - first.y) + c * (first.y - middle.y)) / denominator,
        y: (a * (last.x - middle.x) + b * (first.x - last.x) + c * (middle.x - first.x)) / denominator };
    const radius = distance(center, first);
    return Number.isFinite(radius) && radius > 0 ? { center, radius } : undefined;
}

function placeCurved(region: CountryLabelRegion, circle: Circle, path: Point[], zoneIndex: ZoneIndex, componentCenter: Point,
    textWidthRatio: number, aspect: number, mapWidth: number): CountryLabel | undefined {
    const maximumHeight = aspect * circle.radius * maxLabelSpan / (1 + aspect * maxLabelSpan / 2);
    let best: { angle: number; height: number; span: number } | undefined;
    const count = Math.min(7, path.length);
    for (let i = 0; i < count; i++) {
        const point = path[Math.round(i * (path.length - 1) / Math.max(1, count - 1))];
        const angle = Math.atan2(point.y - circle.center.y, point.x - circle.center.x);
        if (horizontalAngle(angle + readableDirection(angle) * Math.PI / 2) > maxCurvedAngle) {
            continue;
        }
        let lower = 0;
        let upper = maximumHeight;
        let span = 0;
        for (let iteration = 0; iteration < 9; iteration++) {
            const height = (lower + upper) / 2;
            const candidateSpan = height / (aspect * (circle.radius - height / 2));
            if (candidateSpan <= maxLabelSpan && curvedBoxInside(circle, angle, candidateSpan, height, zoneIndex)) {
                lower = height;
                span = candidateSpan;
            } else {
                upper = height;
            }
        }
        if (lower > 0 && (!best || lower > best.height || lower === best.height &&
            horizontalAngle(angle + readableDirection(angle) * Math.PI / 2) <
            horizontalAngle(best.angle + readableDirection(best.angle) * Math.PI / 2))) {
            best = { angle, height: lower, span };
        }
    }
    if (!best) {
        return undefined;
    }
    const labelCenter = pointOnCircle(circle, best.angle);
    const direction = readableDirection(best.angle);
    const center = { x: wrapX(labelCenter.x, mapWidth), y: labelCenter.y };
    return {
        owner: region.owner, text: region.text, color: region.color, center, fallbackCenter: center,
        angle: normalizeUprightAngle(best.angle + direction * Math.PI / 2),
        maxWidth: best.height * textWidthRatio, fontSize: best.height,
        arc: { centerOffset: { x: circle.center.x - labelCenter.x, y: circle.center.y - labelCenter.y },
            centerAngle: best.angle, radius: circle.radius, span: best.span, direction },
    };
}

function curvedBoxInside(circle: Circle, centerAngle: number, span: number, height: number, zoneIndex: ZoneIndex): boolean {
    for (let angular = 0; angular <= 6; angular++) {
        const angle = centerAngle - span / 2 + span * angular / 6;
        for (const offset of [-height * 0.48, 0, height * 0.48]) {
            if (!zoneIndex.contains({ x: circle.center.x + Math.cos(angle) * (circle.radius + offset),
                y: circle.center.y + Math.sin(angle) * (circle.radius + offset) })) {
                return false;
            }
        }
    }
    return true;
}

function placeStraight(region: CountryLabelRegion, zones: Zone[], zoneIndex: ZoneIndex, componentCenter: Point,
    textWidthRatio: number, aspect: number, mapWidth: number, sourceAngle: number, path: Point[] = []): CountryLabel | undefined {
    const sourceUprightAngle = normalizeUprightAngle(sourceAngle);
    const angle = Math.max(-maxStraightAngle, Math.min(maxStraightAngle, sourceUprightAngle));
    const along = { x: Math.cos(angle), y: Math.sin(angle) };
    const across = { x: -along.y, y: along.x };
    const bounds = zones.reduce((box, zone) => ({ left: Math.min(box.left, zone.x), right: Math.max(box.right, zone.x + zone.w),
        top: Math.min(box.top, zone.y), bottom: Math.max(box.bottom, zone.y + zone.h) }),
    { left: Infinity, right: -Infinity, top: Infinity, bottom: -Infinity });
    const maximumDistance = Math.hypot(bounds.right - bounds.left, bounds.bottom - bounds.top);
    const candidates = [...path.filter((_, index) => index % Math.max(1, Math.floor(path.length / 6)) === 0), componentCenter,
        ...[...zones].sort((a, b) => b.w * b.h - a.w * a.h).slice(0, 12)
            .map(zone => ({ x: zone.x + zone.w / 2, y: zone.y + zone.h / 2 }))];
    let best: { center: Point; height: number } | undefined;
    for (const center of candidates) {
        if (!zoneIndex.contains(center)) {
            continue;
        }
        const width = symmetricDistance(center, along, zoneIndex, maximumDistance);
        const availableHeight = symmetricDistance(center, across, zoneIndex, maximumDistance);
        const height = Math.min(availableHeight, width * aspect) * 0.8;
        if (height > (best?.height ?? 0)) {
            best = { center, height };
        }
    }
    if (!best || best.height <= 0) {
        return undefined;
    }
    const center = { x: wrapX(best.center.x, mapWidth), y: best.center.y };
    return { owner: region.owner, text: region.text, color: region.color, center, fallbackCenter: center,
        angle, maxWidth: best.height * textWidthRatio, fontSize: best.height };
}

function symmetricDistance(center: Point, direction: Point, zoneIndex: ZoneIndex, maximum: number): number {
    return 2 * Math.min(rayDistance(center, direction, zoneIndex, maximum),
        rayDistance(center, { x: -direction.x, y: -direction.y }, zoneIndex, maximum));
}

function rayDistance(center: Point, direction: Point, zoneIndex: ZoneIndex, maximum: number): number {
    const step = Math.max(1, maximum / 64);
    let previous = 0;
    for (let value = step; value <= maximum; value += step) {
        if (!zoneIndex.contains({ x: center.x + direction.x * value, y: center.y + direction.y * value })) {
            let lower = previous;
            let upper = value;
            for (let i = 0; i < 5; i++) {
                const middle = (lower + upper) / 2;
                if (zoneIndex.contains({ x: center.x + direction.x * middle, y: center.y + direction.y * middle })) {
                    lower = middle;
                } else {
                    upper = middle;
                }
            }
            return lower;
        }
        previous = value;
    }
    return maximum;
}

function createZoneIndex(zones: Zone[]): ZoneIndex {
    const cellSize = 32;
    const cells = new Map<string, Zone[]>();
    for (const zone of zones) {
        for (let x = Math.floor(zone.x / cellSize); x <= Math.floor((zone.x + zone.w - 0.001) / cellSize); x++) {
            for (let y = Math.floor(zone.y / cellSize); y <= Math.floor((zone.y + zone.h - 0.001) / cellSize); y++) {
                const key = `${x},${y}`;
                const cell = cells.get(key) ?? [];
                cell.push(zone);
                cells.set(key, cell);
            }
        }
    }
    return { contains(point: Point) {
        return (cells.get(`${Math.floor(point.x / cellSize)},${Math.floor(point.y / cellSize)}`) ?? [])
            .some(zone => point.x >= zone.x && point.x < zone.x + zone.w && point.y >= zone.y && point.y < zone.y + zone.h);
    } };
}

function lineInside(from: Point, to: Point, zoneIndex: ZoneIndex): boolean {
    for (let i = 0; i <= 6; i++) {
        if (!zoneIndex.contains({ x: from.x + (to.x - from.x) * i / 6, y: from.y + (to.y - from.y) * i / 6 })) {
            return false;
        }
    }
    return true;
}

function isBetter(label: CountryLabel, current: CountryLabel | undefined): boolean {
    if (!current || label.fontSize > current.fontSize * 1.001) {
        return true;
    }
    if (Math.abs(label.fontSize - current.fontSize) <= current.fontSize * 0.001) {
        return (label.arc?.radius ?? Infinity) > (current.arc?.radius ?? Infinity) ||
            Math.abs(label.angle) < Math.abs(current.angle);
    }
    return false;
}

function readableDirection(angle: number): 1 | -1 {
    return Math.cos(angle + Math.PI / 2) >= 0 ? 1 : -1;
}

function horizontalAngle(angle: number): number {
    return Math.abs(normalizeUprightAngle(angle));
}

function pointOnCircle(circle: Circle, angle: number): Point {
    return { x: circle.center.x + Math.cos(angle) * circle.radius, y: circle.center.y + Math.sin(angle) * circle.radius };
}

function cross(from: Point, to: Point, point: Point): number {
    return (to.x - from.x) * (point.y - from.y) - (to.y - from.y) * (point.x - from.x);
}

function distance(a: Point, b: Point): number { return Math.sqrt(distanceSqr(a, b)); }
function distanceSqr(a: Point, b: Point): number { return (a.x - b.x) ** 2 + (a.y - b.y) ** 2; }

function normalizeUprightAngle(angle: number): number {
    angle = (angle + Math.PI) % tau - Math.PI;
    if (angle > Math.PI / 2) {
        angle -= Math.PI;
    } else if (angle < -Math.PI / 2) {
        angle += Math.PI;
    }
    return angle;
}

function unwrapX(x: number, origin: number, mapWidth: number): number {
    if (mapWidth > 0) {
        while (x - origin > mapWidth / 2) { x -= mapWidth; }
        while (x - origin < -mapWidth / 2) { x += mapWidth; }
    }
    return x;
}

function wrapX(x: number, mapWidth: number): number {
    return mapWidth > 0 ? (x % mapWidth + mapWidth) % mapWidth : x;
}

function estimateTextWidth(text: string): number {
    return Math.max(1, Array.from(text).reduce((sum, character) => sum +
        (/\s/.test(character) ? 0.35 : character.charCodeAt(0) > 0xFF ? 1 : 0.62), 0));
}
