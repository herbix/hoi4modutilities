import * as assert from 'assert';
import { State } from '../../../src/previewdef/worldmap/definitions';
import { isCountryBorder, selectCountryTagStates } from '../../../webviewsrc/worldmap/countryview';

suite('Country view', () => {
    test('uses the largest state of each owner for country tags', () => {
        const states = [
            { id: 1, mass: 10 },
            { id: 2, mass: 30 },
            { id: 3, mass: 20 },
            { id: 4, mass: 40 },
        ] as State[];
        const owners: Record<number, string | undefined> = {
            1: 'AAA',
            2: 'AAA',
            3: 'BBB',
            4: undefined,
        };

        const tags = selectCountryTagStates({
            forEachState: callback => states.forEach(callback),
        }, stateId => owners[stateId]);

        assert.deepStrictEqual(tags.map(tag => [tag.owner, tag.state.id]), [
            ['AAA', 2],
            ['BBB', 3],
        ]);
    });

    test('only treats different owners as a country border', () => {
        assert.strictEqual(isCountryBorder('AAA', 'AAA'), false);
        assert.strictEqual(isCountryBorder(undefined, undefined), false);
        assert.strictEqual(isCountryBorder('AAA', 'BBB'), true);
        assert.strictEqual(isCountryBorder('AAA', undefined), true);
    });
});
