import { ListBoxType, OverlappingElementsBoxType, SmoothListBoxType } from '../../hoiformat/gui';
import { HOIPartial } from '../../hoiformat/schema';
import { calculateBBox, ParentInfo } from './common';
import { RenderNodeCommonOptions, renderSprite } from './nodecommon';

export interface RenderLayoutBoxOptions extends RenderNodeCommonOptions {
}

type LayoutBox = HOIPartial<ListBoxType> | HOIPartial<OverlappingElementsBoxType> | HOIPartial<SmoothListBoxType>;

export async function renderListBox(listBox: HOIPartial<ListBoxType>, parentInfo: ParentInfo, options: RenderLayoutBoxOptions): Promise<string> {
    return await renderLayoutBox(listBox, parentInfo, options, listBox.background);
}

export async function renderOverlappingElementsBox(overlappingElementsBox: HOIPartial<OverlappingElementsBoxType>, parentInfo: ParentInfo, options: RenderLayoutBoxOptions): Promise<string> {
    return await renderLayoutBox(overlappingElementsBox, parentInfo, options);
}

export async function renderSmoothListBox(smoothListBox: HOIPartial<SmoothListBoxType>, parentInfo: ParentInfo, options: RenderLayoutBoxOptions): Promise<string> {
    return await renderLayoutBox(smoothListBox, parentInfo, options);
}

async function renderLayoutBox(layoutBox: LayoutBox, parentInfo: ParentInfo, options: RenderLayoutBoxOptions, backgroundSprite?: string): Promise<string> {
    const [x, y, width, height] = calculateBBox(layoutBox, parentInfo);
    const backgroundImage = options.getSprite && backgroundSprite ? await options.getSprite(backgroundSprite, 'bg', layoutBox.name) : undefined;
    const background = backgroundImage ? renderSprite({ x: 0, y: 0 }, { width, height }, backgroundImage, 0, 1, options) : '';

    return `<div
    start="${layoutBox._token?.start}"
    end="${layoutBox._token?.end}"
    class="
        ${options.styleTable.style('positionAbsolute', () => `position: absolute;`)}
        ${options.styleTable.style('borderBox', () => `box-sizing: border-box;`)}
        ${options.styleTable.oneTimeStyle('layoutbox', () => `
            left: ${x}px;
            top: ${y}px;
            width: ${width}px;
            height: ${height}px;
        `)}
        ${options.enableNavigator ? 'navigator navigator-highlight' : ''}
    ">
        ${background}
    </div>`;
}
