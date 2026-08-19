import * as assert from 'assert';
import { calculateCountryLabels, CountryLabelRegion } from '../../../webviewsrc/worldmap/countrylabels';

suite('country map labels', () => {
    test('labels each disconnected land component that can fit the name', () => {
        const labels = calculateCountryLabels([
            region(1, 'AAA', 'Country A', 10, 10, 20, 12, 120, [2]),
            region(2, 'AAA', 'Country A', 30, 10, 20, 12, 100, [1]),
            region(3, 'AAA', 'Country A', 120, 50, 40, 20, 50, []),
        ], 200);

        assert.strictEqual(labels.length, 2);
        assert.ok(labels.some(label => label.center.x < 60), 'the main territory should have a label');
        assert.ok(labels.some(label => label.center.x > 100), 'the disconnected territory should have a label');
    });

    test('keeps straight fallback labels readable', () => {
        const horizontal = calculateCountryLabels([
            region(1, 'AAA', 'AAA', 10, 10, 20, 20, 100, [2]),
            region(2, 'AAA', 'AAA', 28, 18, 20, 20, 100, [1]),
        ], 200)[0];
        const vertical = calculateCountryLabels([
            region(1, 'BBB', 'BBB', 10, 10, 50, 40, 100, [2]),
            region(2, 'BBB', 'BBB', 10, 48, 50, 40, 100, [1]),
        ], 200)[0];

        assert.ok(Math.abs(horizontal.angle) < Math.PI / 6);
        assert.ok(Math.abs(vertical.angle) <= Math.PI / 2);
    });

    test('uses a near-vertical label for a narrow north-south country', () => {
        const label = calculateCountryLabels([
            region(1, 'NSC', 'CHILE', 20, 10, 24, 300, 7200, []),
        ], 400)[0];

        assert.ok(Math.abs(label.angle) > Math.PI / 3, 'the support line should follow the country instead of being clamped');
        assert.ok(Math.abs(label.angle) <= Math.PI / 2, 'the text direction must remain readable');
        assert.ok(label.fontSize > 10, 'following the long axis should provide a useful font size');
    });

    test('measures territories across the horizontal map seam locally', () => {
        const label = calculateCountryLabels([
            region(1, 'AAA', 'A', 0, 10, 8, 12, 100, [2]),
            region(2, 'AAA', 'A', 92, 10, 8, 12, 100, [1]),
        ], 100)[0];

        assert.ok(label.center.x < 10 || label.center.x > 90);
        assert.ok(label.maxWidth < 20, 'the map seam must not make the country appear world-wide');
    });

    test('does not size a label across gaps outside the country', () => {
        const splitRegion = region(1, 'AAA', 'A', 0, 10, 100, 20, 100, []);
        splitRegion.coverZones = [{ x: 0, y: 10, w: 30, h: 20 }, { x: 70, y: 10, w: 30, h: 20 }];
        const label = calculateCountryLabels([splitRegion], 200)[0];

        assert.ok(label.maxWidth < 30, 'only the continuous owner-colored segment may contain the label');
    });

    test('uses map adjacencies to place one label across an archipelago', () => {
        const west = region(1, 'ISL', 'ISLANDS', 0, 0, 30, 40, 1200, [2]);
        const east = region(2, 'ISL', 'ISLANDS', 70, 0, 30, 40, 1200, [1]);
        west.connections = [{ from: { x: 30, y: 20 }, to: { x: 70, y: 20 } }];
        const labels = calculateCountryLabels([west, east], 200);

        assert.strictEqual(labels.length, 1);
        assert.ok(labels[0].maxWidth > 30, 'the connection should let the country name span the island group');
    });

    test('scales labels beyond the source map font size for large countries', () => {
        const label = calculateCountryLabels([
            region(1, 'AAA', 'AAA', 0, 0, 1000, 300, 300000, []),
        ], 1200)[0];

        assert.ok(label.fontSize > 64, 'the source font size must not cap its rendered map size');
    });

    test('uses the fixed text aspect instead of horizontally compressing the label', () => {
        const label = calculateCountryLabels([
            region(1, 'AST', 'AUSTRALIA', 0, 0, 800, 280, 224000, []),
        ], 1200)[0];

        assert.ok(label.fontSize > 80, 'the largest fixed-aspect label should use the available length');
        assert.ok(label.fontSize < 100, 'fixed character spacing must not be replaced with the old horizontal compression');
    });

    test('exposes spare width as character spacing for wide countries', () => {
        const label = calculateCountryLabels([
            region(1, 'RUS', 'RUSSIA', 0, 0, 1000, 100, 100000, []),
        ], 1200)[0];

        assert.ok(label.maxWidth > label.fontSize * 5,
            'large countries should spread their name instead of leaving most of the support line unused');
    });

    test('fits and limits a curved label to the paper maximum circular angle', () => {
        const center = { x: 250, y: 250 };
        const innerRadius = 170;
        const outerRadius = 210;
        const startAngle = Math.PI * 0.05;
        const endAngle = Math.PI * 0.95;
        const boundary: { x: number, y: number }[] = [];
        for (let i = 0; i <= 80; i++) {
            const angle = startAngle + (endAngle - startAngle) * i / 80;
            boundary.push({ x: center.x + Math.cos(angle) * outerRadius, y: center.y + Math.sin(angle) * outerRadius });
        }
        for (let i = 80; i >= 0; i--) {
            const angle = startAngle + (endAngle - startAngle) * i / 80;
            boundary.push({ x: center.x + Math.cos(angle) * innerRadius, y: center.y + Math.sin(angle) * innerRadius });
        }
        boundary.push(boundary[0]);

        const coverZones = [];
        for (let y = 20; y < 480; y++) {
            let start = -1;
            for (let x = 20; x < 480; x++) {
                const radius = Math.hypot(x - center.x, y - center.y);
                const angle = (Math.atan2(y - center.y, x - center.x) + Math.PI * 2) % (Math.PI * 2);
                const inside = radius >= innerRadius && radius <= outerRadius && angle >= startAngle && angle <= endAngle;
                if (inside && start < 0) {
                    start = x;
                }
                if ((!inside || x === 479) && start >= 0) {
                    coverZones.push({ x: start, y, w: x - start + (inside ? 1 : 0), h: 1 });
                    start = -1;
                }
            }
        }

        const curved = region(1, 'AAA', 'CURVED LAND', 20, 20, 460, 460, 40000, []);
        curved.coverZones = coverZones;
        curved.boundaryPaths = [boundary];
        const label = calculateCountryLabels([curved], 600)[0];

        assert.ok(label.arc, 'the medial-axis candidate should produce a circular support line');
        assert.ok(label.arc!.span <= Math.PI / 3, 'the circular angle must be at most 60 degrees');
        assert.ok(Math.cos(label.arc!.centerAngle + label.arc!.direction * Math.PI / 2) >= 0,
            'curved text must progress from left to right instead of being reversed');
        assert.ok(label.fontSize > 0);
    });

    test('keeps labels below five map pixels for zoomed rendering', () => {
        const label = calculateCountryLabels([
            region(1, 'SML', 'LONG COUNTRY', 0, 0, 12, 12, 144, []),
        ], 100)[0];

        assert.ok(label, 'the layout must retain a small-country label');
        assert.ok(label.fontSize < 5, 'the renderer should decide when the label becomes readable on screen');
    });
});

function region(id: number, owner: string, text: string, x: number, y: number, w: number, h: number,
    mass: number, neighbours: number[]): CountryLabelRegion {
    return {
        id,
        owner,
        text,
        color: 0x808080,
        boundingBox: { x, y, w, h },
        coverZones: [{ x, y, w, h }],
        centerOfMass: { x: x + w / 2, y: y + h / 2 },
        mass,
        neighbours,
    };
}
