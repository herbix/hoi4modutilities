import * as assert from 'assert';
import { parseHoi4File } from '../../../src/hoiformat/hoiparser';
import { getSpriteTypes } from '../../../src/hoiformat/spritetype';
import { Image, ProgressBarSprite } from '../../../src/util/image/sprite';
import { renderSprite } from '../../../src/util/hoi4gui/nodecommon';
import { StyleTable } from '../../../src/util/styletable';

suite('progressBarType', () => {
    test('keeps progressBarType separate and preserves its declared size', () => {
        const sprites = getSpriteTypes(parseHoi4File(`
            spriteTypes = {
                progressBarType = {
                    name = "GFX_test_progress"
                    textureFile1 = "gfx/interface/progress.dds"
                    textureFile2 = "gfx/interface/progress_bg.dds"
                    size = { x = 218 y = 21 }
                    horizontal = yes
                }
            }
        `));
        const sprite = sprites[0];

        assert.ok('texturefile' in sprite);
        if ('texturefile2' in sprite) {
            assert.strictEqual(sprite.texturefile, 'gfx/interface/progress.dds');
            assert.strictEqual(sprite.texturefile2, 'gfx/interface/progress_bg.dds');
            assert.deepStrictEqual(sprite.size, { x: 218, y: 21 });
            assert.strictEqual(sprite.horizontal, true);
        }
    });

    test('renders a progress bar with its declared size', () => {
        const imagePath = {} as import('vscode').Uri;
        const sprite = new ProgressBarSprite(
            'GFX_test_progress',
            new Image(Buffer.from([1]), 934, 40, imagePath),
            new Image(Buffer.from([2]), 934, 40, imagePath),
            { x: 934, y: 35 },
            true,
        );
        const styleTable = new StyleTable();

        renderSprite({ x: 0, y: 0 }, sprite, sprite, 0, 1, { styleTable });
        const styles = styleTable.toStyleElement('test');

        assert.match(styles, /width: 934px;/);
        assert.match(styles, /height: 35px;/);
        assert.match(styles, /width: 467px;/);
    });
});