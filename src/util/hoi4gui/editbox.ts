import { EditBoxType } from '../../hoiformat/gui';
import { HOIPartial, toNumberLike, toStringAsSymbolIgnoreCase } from '../../hoiformat/schema';
import { calculateBBox, ParentInfo } from './common';
import { renderInstantTextBox } from './instanttextbox';
import { RenderNodeCommonOptions } from './nodecommon';

export interface RenderEditBoxOptions extends RenderNodeCommonOptions {
}

export async function renderEditBox(editBox: HOIPartial<EditBoxType>, parentInfo: ParentInfo, options: RenderEditBoxOptions): Promise<string> {
    const [x, y, width, height, orientation] = calculateBBox(editBox, parentInfo);
    const content = await renderInstantTextBox({
        name: editBox.name,
        orientation: toStringAsSymbolIgnoreCase('upper_left'),
        position: { x: toNumberLike(0), y: toNumberLike(0) },
        bordersize: editBox.bordersize,
        maxwidth: toNumberLike(width),
        maxheight: toNumberLike(height),
        font: editBox.font,
        text: editBox.text,
        format: editBox.format,
        vertical_alignment: 'center',
        _index: editBox._index,
        _token: editBox._token,
    }, { size: { width, height }, orientation }, { ...options, enableNavigator: undefined });

    return `<div
    start="${editBox._token?.start}"
    end="${editBox._token?.end}"
    class="
        ${options.styleTable.style('positionAbsolute', () => `position: absolute;`)}
        ${options.styleTable.style('borderBox', () => `box-sizing: border-box;`)}
        ${options.styleTable.oneTimeStyle('editbox', () => `
            left: ${x}px;
            top: ${y}px;
            width: ${width}px;
            height: ${height}px;
            overflow: hidden;
        `)}
        ${options.enableNavigator ? 'navigator navigator-highlight' : ''}
    ">
        ${content}
    </div>`;
}
