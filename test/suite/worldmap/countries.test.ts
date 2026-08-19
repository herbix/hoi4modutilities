import * as assert from 'assert';
import { findCountryLocalisedName, getCountryLocalisationKeys } from '../../../src/previewdef/worldmap/loader/countrylocalisation';

suite('country map localisation', () => {
    test('prefers cosmetic and autonomy-specific country names', () => {
        assert.deepStrictEqual(getCountryLocalisationKeys('AAA', 'democratic', 'AAA_COSMETIC', {
            overlord: 'BBB',
            autonomousState: 'autonomy_dominion',
        }), [
            'AAA_COSMETIC_democratic',
            'AAA_COSMETIC',
            'AAA_BBB_autonomy_dominion',
            'AAA_democratic',
            'AAA',
        ]);
    });

    test('does not use an unresolved localisation key as a country name', () => {
        const keys = getCountryLocalisationKeys('AAA', 'democratic');
        assert.strictEqual(findCountryLocalisedName(keys, key => key), undefined);
        assert.strictEqual(findCountryLocalisedName(keys, key => key === 'AAA' ? 'Country A' : key), 'Country A');
    });
});
