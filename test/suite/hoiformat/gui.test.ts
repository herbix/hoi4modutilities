import * as assert from 'assert';
import { GuiFile, guiFileSchema } from '../../../src/hoiformat/gui';
import { parseHoi4File } from '../../../src/hoiformat/hoiparser';
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

suite('GUI common controls', () => {
    test('parses common layout and input controls', () => {
        const gui = convertNodeToJson<GuiFile>(parseHoi4File(`
            guiTypes = {
                containerWindowType = {
                    name = "controls"
                    size = { x = 500 y = 400 }
                    editBoxType = { name = "name" borderSize = { x = 3 y = 2 } }
                    listBoxType = { name = "list" }
                    smoothListBoxType = { name = "smooth_list" }
                    overlappingElementsBoxType = { name = "overlap" }
                    dropDownBoxType = {
                        name = "dropdown"
                        editBoxType = { name = "dropdown_edit" }
                        expandButton = { name = "expand" spriteType = "GFX_button" }
                        expandedWindow = { name = "expanded" show_position = { x = 0 y = 25 } }
                    }
                    extendedScrollbarType = { name = "scrollbar" slider = { name = "slider" spriteType = "GFX_slider" } }
                }
                scrollbarType = {
                    name = "top_level_scrollbar" horizontal = 1
                    slider = "slider" track = "track" leftButton = "left" rightButton = "right"
                    guiButtonType = { parent = "slider" name = "down" }
                }
                extendedScrollbarType = { name = "top_level_extended_scrollbar" }
            }
        `), guiFileSchema);
        const guiTypes = gui.guitypes[0];
        const container = guiTypes.containerwindowtype[0];

        assert.strictEqual(container.editboxtype.length, 1);
        assert.strictEqual(container.editboxtype[0].bordersize?.x?._value, 3);
        assert.strictEqual(container.editboxtype[0].bordersize?.y?._value, 2);
        assert.strictEqual(container.listboxtype.length, 1);
        assert.strictEqual(container.smoothlistboxtype.length, 1);
        assert.strictEqual(container.overlappingelementsboxtype.length, 1);
        assert.strictEqual(container.dropdownboxtype.length, 1);
        assert.strictEqual(container.extendedscrollbartype.length, 1);
        assert.strictEqual(container.extendedscrollbartype[0].slider?.name, 'slider');
        const dropdown = container.dropdownboxtype[0];
        assert.strictEqual(dropdown.editboxtype.length, 1);
        assert.strictEqual(dropdown.editboxtype[0].name, 'dropdown_edit');
        assert.strictEqual(dropdown.expandbutton?.name, 'expand');
        assert.strictEqual(dropdown.expandedwindow?.name, 'expanded');
        assert.strictEqual(dropdown.expandedwindow?.show_position?.x?._value, 0);
        assert.strictEqual(dropdown.expandedwindow?.show_position?.y?._value, 25);
        assert.strictEqual(guiTypes.scrollbartype.length, 1);
        const scrollbar = guiTypes.scrollbartype[0];
        assert.strictEqual(scrollbar.horizontal, 1);
        assert.strictEqual(scrollbar.guibuttontype[0].parent, 'slider');
        assert.deepStrictEqual([scrollbar.slider, scrollbar.track, scrollbar.leftbutton, scrollbar.rightbutton], ['slider', 'track', 'left', 'right']);
        assert.strictEqual(guiTypes.extendedscrollbartype.length, 1);
    });
});
