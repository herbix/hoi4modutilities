import * as assert from 'assert';

const moduleLoader = require('module') as {
    _load: (request: string, ...args: unknown[]) => unknown;
};
const originalLoad = moduleLoader._load;
moduleLoader._load = (request: string, ...args: unknown[]) =>
    request === 'vscode' ? {} : originalLoad(request, ...args);

const { parseHoi4File } = require('../../src/hoiformat/hoiparser') as typeof import('../../src/hoiformat/hoiparser');
const { getSpriteTypes } = require('../../src/hoiformat/spritetype') as typeof import('../../src/hoiformat/spritetype');
const { Image, ProgressBarSprite } = require('../../src/util/image/sprite') as typeof import('../../src/util/image/sprite');
const { renderSprite } = require('../../src/util/hoi4gui/nodecommon') as typeof import('../../src/util/hoi4gui/nodecommon');
const { StyleTable } = require('../../src/util/styletable') as typeof import('../../src/util/styletable');

moduleLoader._load = originalLoad;

describe('progressBarType', () => {
    it('keeps progressBarType separate and preserves its declared size', () => {
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

        assert.ok('texturefile1' in sprite);
        if ('texturefile1' in sprite) {
            assert.strictEqual(sprite.texturefile1, 'gfx/interface/progress.dds');
            assert.strictEqual(sprite.texturefile2, 'gfx/interface/progress_bg.dds');
            assert.deepStrictEqual(sprite.size, { x: 218, y: 21 });
            assert.strictEqual(sprite.horizontal, true);
        }
    });

    it('renders a progress bar with its declared size', () => {
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
