import * as assert from 'assert';
import { Province } from '../../../src/previewdef/worldmap/definitions';
import { getCountryTags } from '../../../webviewsrc/worldmap/countryview';

suite('Country view', () => {
    test('uses the center of mass of each connected country territory for tags', () => {
        const provinces = [
            province(1, 0, 0, 10, 10, [2]),
            province(2, 10, 0, 20, 10, [1]),
            province(3, 50, 0, 10, 10, []),
            province(4, 70, 0, 10, 10, []),
        ];
        const owners: Record<number, string | undefined> = {
            1: 'AAA',
            2: 'AAA',
            3: 'AAA',
        };

        const tags = getCountryTags({
            width: 100,
            forEachProvince: callback => provinces.forEach(callback),
        }, { 1: 1, 2: 2, 3: 3, 4: 4 }, stateId => owners[stateId]);

        assert.deepStrictEqual(tags.map(tag => [tag.owner, tag.province.id, tag.centerOfMass]), [
            ['AAA', 1, { x: 15, y: 5 }],
            ['AAA', 3, { x: 55, y: 5 }],
        ]);
    });
});

function province(id: number, x: number, y: number, w: number, h: number, neighbours: number[]): Province {
    return {
        id,
        type: 'land',
        boundingBox: { x, y, w, h },
        centerOfMass: { x: x + w / 2, y: y + h / 2 },
        mass: w * h,
        edges: neighbours.map(to => ({ to, path: [[{ x, y }]], type: '' })),
    } as Province;
}
