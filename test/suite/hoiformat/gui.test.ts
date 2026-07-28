import * as assert from 'assert';
import { GuiFile } from '../../../src/hoiformat/gui';
import { parseHoi4File } from '../../../src/hoiformat/hoiparser';
import { guiFileSchema } from '../../../src/hoiformat/gui';
import { convertNodeToJson } from '../../../src/hoiformat/schema';

suite('GUI fullScreen', () => {
    test('parses fullScreen on a window type', () => {
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