import { DropdownBoxType } from '../../hoiformat/gui';
import { HOIPartial } from '../../hoiformat/schema';
import { calculateBBox, ParentInfo } from './common';
import { RenderNodeCommonOptions } from './nodecommon';

export interface RenderDropdownBoxOptions extends RenderNodeCommonOptions {
    renderChildren(dropdownBox: HOIPartial<DropdownBoxType>, parentInfo: ParentInfo): Promise<string>;
}

export async function renderDropdownBox(
    dropdownBox: HOIPartial<DropdownBoxType>,
    parentInfo: ParentInfo,
    options: RenderDropdownBoxOptions,
): Promise<string> {
    const [x, y, width, height, orientation] = calculateBBox(dropdownBox, parentInfo);
    const children = await options.renderChildren(dropdownBox, { size: { width, height }, orientation });

    return `<div
    start="${dropdownBox._token?.start}"
    end="${dropdownBox._token?.end}"
    class="
        gui-dropdown
        ${options.styleTable.style('positionAbsolute', () => `position: absolute;`)}
        ${options.styleTable.oneTimeStyle('dropdownbox', () => `
            left: ${x}px;
            top: ${y}px;
            width: ${width}px;
            height: ${height}px;
            overflow: visible;
        `)}
        ${options.enableNavigator ? 'navigator navigator-highlight' : ''}
    ">
        ${children}
    </div>`;
}
