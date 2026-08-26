import * as assert from 'assert';
import { ContainerWindowType, GuiFile, guiFileSchema } from '../../../src/hoiformat/gui';
import { parseHoi4File } from '../../../src/hoiformat/hoiparser';
import { HOIPartial, convertNodeToJson } from '../../../src/hoiformat/schema';
import { Sprite } from '../../../src/util/image/sprite';
import {
    RenderContainerWindowOptions,
    renderContainerWindow,
    renderContainerWindowChildren,
} from '../../../src/util/hoi4gui/containerwindow';
import { StyleTable } from '../../../src/util/styletable';

suite('GUI container window rendering', () => {
    test('keeps source order across all supported child types', async () => {
        const container = parseContainerWindow(`
            buttonType = { name = "button" }
            editBoxType = { name = "edit" }
            dropDownBoxType = { name = "dropdown" }
            overlappingElementsBoxType = { name = "overlap" }
            smoothListBoxType = { name = "smooth" }
            listBoxType = { name = "list" }
            scrollbarType = { name = "scrollbar" }
            extendedScrollbarType = { name = "extended" }
            iconType = { name = "icon" }
            instantTextBoxType = { name = "text" }
            gridBoxType = { name = "grid" }
            containerWindowType = { name = "container" }
        `);
        const onRenderChild: RenderContainerWindowOptions['onRenderChild'] = async (type, child) =>
            `[${type}:${child.name}]`;

        const rendered = await renderContainerWindowChildren(container, {
            size: { width: 500, height: 400 },
            orientation: 'upper_left',
        }, {
            styleTable: new StyleTable(),
            onRenderChild,
        });

        assert.deepStrictEqual(rendered.match(/\[[^\]]+\]/g), [
            '[button:button]',
            '[editbox:edit]',
            '[dropdownbox:dropdown]',
            '[overlappingelementsbox:overlap]',
            '[smoothlistbox:smooth]',
            '[listbox:list]',
            '[scrollbar:scrollbar]',
            '[extendedscrollbar:extended]',
            '[icon:icon]',
            '[instanttextbox:text]',
            '[gridbox:grid]',
            '[containerwindow:container]',
        ]);
    });

    test('keeps source order inside dropdown boxes', async () => {
        const container = parseContainerWindow(`
            dropDownBoxType = {
                name = "dropdown"
                buttonType = { name = "first" }
                expandedWindow = { name = "expanded" }
                iconType = { name = "third" }
                expandButton = { name = "expand" }
                editBoxType = { name = "last" }
            }
        `);
        const onRenderChild: RenderContainerWindowOptions['onRenderChild'] = async (type, child) =>
            type === 'dropdownbox' ? undefined : `[${child.name}]`;

        const rendered = await renderContainerWindowChildren(container, {
            size: { width: 500, height: 400 },
            orientation: 'upper_left',
        }, {
            styleTable: new StyleTable(),
            onRenderChild,
        });

        assert.deepStrictEqual(rendered.match(/\[[^\]]+\]/g), [
            '[first]',
            '[expanded]',
            '[third]',
            '[expand]',
            '[last]',
        ]);
    });

    test('renders generic controls', async () => {
        const container = parseContainerWindow(`
            editBoxType = { name = "edit" position = { x = 5 y = 6 } size = { x = 100 y = 24 } borderSize = { x = 3 y = 2 } text = "value" }
            dropDownBoxType = {
                name = "dropdown" position = { x = 10 y = 40 } size = { x = 180 y = 30 }
                editBoxType = { name = "dropdown_edit" position = { x = 4 y = 3 } size = { x = 120 y = 24 } text = "selected" }
                expandButton = { name = "expand" spriteType = "GFX_button" }
                expandedWindow = { name = "expanded" position = { x = -200 y = -200 } show_position = { x = 17 y = 29 } size = { x = 180 y = 100 } }
            }
            listBoxType = { name = "list" position = { x = 10 y = 80 } size = { x = 180 y = 30 } background = "GFX_list" }
            scrollbarType = {
                name = "scrollbar" position = { x = 390 y = 10 } size = { x = 16 y = 120 } horizontal = 1
                guiButtonType = { name = "slider" spriteType = "GFX_slider" position = { x = -12 y = 0 } }
                guiButtonType = { parent = "slider" name = "down" spriteType = "GFX_down" position = { x = 0 y = 120 } }
            }
        `);
        const styleTable = new StyleTable();

        const rendered = await renderContainerWindow(container, {
            size: { width: 500, height: 400 },
            orientation: 'upper_left',
        }, {
            styleTable,
            enableNavigator: true,
            getSprite: async () => ({
                id: 'test',
                width: 10,
                height: 10,
                frames: [{ uri: 'data:image/png;base64,' }],
            }) as unknown as Sprite,
        });
        const styles = styleTable.toStyleElement('nonce');

        assert.ok(rendered.includes('value'));
        assert.ok(rendered.includes('gui-dropdown-button'));
        assert.ok(rendered.includes('gui-dropdown-expanded" hidden'));
        assert.match(styles, /left: 17px;\s+top: 29px;/);
        assert.match(styles, /left: 10px;\s+top: 80px;\s+width: 180px;\s+height: 30px;/);
        assert.match(styles, /left: 390px;\s+top: 10px;\s+width: 16px;\s+height: 120px;/);
        assert.match(styles, /left: 120px;\s+top: -12px;/);
    });
});

function parseContainerWindow(children: string): HOIPartial<ContainerWindowType> {
    const gui = convertNodeToJson<GuiFile>(parseHoi4File(`
        guiTypes = {
            containerWindowType = {
                name = "root"
                size = { x = 500 y = 400 }
                ${children}
            }
        }
    `), guiFileSchema);

    return gui.guitypes[0].containerwindowtype[0];
}
