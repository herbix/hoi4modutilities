import * as assert from 'assert';
import { GuiFile } from '../../src/hoiformat/gui';

const moduleLoader = require('module') as {
    _load: (request: string, ...args: unknown[]) => unknown;
};
const originalLoad = moduleLoader._load;
moduleLoader._load = (request: string, ...args: unknown[]) =>
    request === 'vscode' ? {} : originalLoad(request, ...args);

const { guiFileSchema } = require('../../src/hoiformat/gui') as typeof import('../../src/hoiformat/gui');
const { parseHoi4File } = require('../../src/hoiformat/hoiparser') as typeof import('../../src/hoiformat/hoiparser');
const { convertNodeToJson } = require('../../src/hoiformat/schema') as typeof import('../../src/hoiformat/schema');

moduleLoader._load = originalLoad;

describe('GUI fullScreen', () => {
    it('parses fullScreen on a window type', () => {
        const gui = convertNodeToJson<GuiFile>(parseHoi4File(`
            guiTypes = {
                windowType = {
                    name = "full_screen_window"
                    size = { x = 1024 y = 768 }
                    fullScreen = yes
                }
            }
        `), guiFileSchema);

        assert.strictEqual(gui.guitypes[0].windowtype[0].fullscreen, true);
    });
});
