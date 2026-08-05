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

    test('follows the territory principal axis but limits steep labels', () => {
        const horizontal = calculateCountryLabels([
            region(1, 'AAA', 'AAA', 10, 10, 20, 20, 100, [2]),
            region(2, 'AAA', 'AAA', 28, 18, 20, 20, 100, [1]),
        ], 200)[0];
        const vertical = calculateCountryLabels([
            region(1, 'BBB', 'BBB', 10, 10, 50, 40, 100, [2]),
            region(2, 'BBB', 'BBB', 10, 48, 50, 40, 100, [1]),
        ], 200)[0];

        assert.ok(Math.abs(horizontal.angle) < Math.PI / 6);
        assert.ok(Math.abs(vertical.angle) <= Math.PI / 6);
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

    test('keeps labels inside narrow territory bands', () => {
        const narrowRegion = region(1, 'AAA', 'A', 0, 0, 80, 30, 100, []);
        narrowRegion.coverZones = [
            { x: 0, y: 0, w: 80, h: 8 },
            { x: 32, y: 8, w: 16, h: 22 },
        ];
        const label = calculateCountryLabels([narrowRegion], 100)[0];

        assert.ok(label.fontSize < 10, 'narrow cross-sections should constrain the label height');
    });

    test('scales labels beyond the source map font size for large countries', () => {
        const label = calculateCountryLabels([
            region(1, 'AAA', 'AAA', 0, 0, 1000, 300, 300000, []),
        ], 1200)[0];

        assert.ok(label.fontSize > 64, 'the source font size must not cap its rendered map size');
    });

    test('uses limited horizontal compression to keep wide-country labels tall', () => {
        const label = calculateCountryLabels([
            region(1, 'AST', 'AUSTRALIA', 0, 0, 800, 280, 224000, []),
        ], 1200)[0];

        assert.ok(label.fontSize > 140, 'a long name should use the available territory height');
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
