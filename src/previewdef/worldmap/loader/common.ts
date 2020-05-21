import { Zone } from "../definitions";

export function mergeBoundingBox(a: Zone, b: Zone, width: number): Zone {
    if (a.x + a.w < width * 0.25 && b.x > width * 0.75) {
        b = { ...b, x: b.x - width };
    }

    if (b.x + b.w < width * 0.25 && a.x > width * 0.75) {
        a = { ...a, x: a.x - width };
    }

    const l = Math.min(a.x, b.x);
    const t = Math.min(a.y, b.y);
    const r = Math.max(a.x + a.w, b.x + b.w);
    const bo = Math.max(a.y + a.h, b.y + b.h);
    return {
        x: l,
        y: t,
        w: r - l,
        h: bo - t,
    };
}
