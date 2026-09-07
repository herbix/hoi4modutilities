import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { guiIndex } from '../../../src/indexing/guiindex';
import * as fileloader from '../../../src/util/fileloader';

suite('GuiIndex', () => {
    setup(() => guiIndex.clearIndex());

    teardown(() => {
        sinon.restore();
        guiIndex.clearIndex();
    });

    test('indexes named top-level GUI elements and ignores nested elements', async () => {
        sinon.stub(fileloader, 'listFilesFromModOrHOI4').resolves(['test.gui']);
        sinon.stub(fileloader, 'readFileFromModOrHOI4').resolves([
            Buffer.from(`
                guiTypes = {
                    containerWindowType = {
                        name = "root_container"
                        containerWindowType = { name = "nested_container" }
                        iconType = { name = "nested_icon" }
                    }
                    windowType = { name = "root_window" }
                    scrollbarType = { name = "root_scrollbar" }
                    extendedScrollbarType = { name = "root_extended_scrollbar" }
                }
            `),
            vscode.Uri.file('test.gui'),
        ]);

        await guiIndex.buildWorkspaceIndex();

        assert.deepStrictEqual(guiIndex.get('root_container'), {
            type: 'containerwindow',
            file: 'interface/test.gui',
        });
        assert.deepStrictEqual(guiIndex.get('root_window'), {
            type: 'window',
            file: 'interface/test.gui',
        });
        assert.deepStrictEqual(guiIndex.get('root_scrollbar'), {
            type: 'scrollbar',
            file: 'interface/test.gui',
        });
        assert.deepStrictEqual(guiIndex.get('root_extended_scrollbar'), {
            type: 'extendedscrollbar',
            file: 'interface/test.gui',
        });
        assert.strictEqual(guiIndex.get('nested_container'), undefined);
        assert.strictEqual(guiIndex.get('nested_icon'), undefined);
    });
});
