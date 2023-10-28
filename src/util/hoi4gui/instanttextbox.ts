import { HOIPartial } from "../../hoiformat/schema";
import { ParentInfo, calculateBBox, RenderCommonOptions, normalizeNumberLike } from "./common";
import { htmlEscape } from "../html";
import { InstantTextBoxType } from "../../hoiformat/gui";

export interface RenderInstantTextBoxOptions extends RenderCommonOptions {
}

export async function renderInstantTextBox(textbox: HOIPartial<InstantTextBoxType>, parentInfo: ParentInfo, options: RenderInstantTextBoxOptions): Promise<string> {
    const [x, y, width, height] = calculateBBox({ ...textbox, size: { width: textbox.maxwidth, height: textbox.maxheight } }, parentInfo);
    const borderX = normalizeNumberLike(textbox.bordersize?.x, width);
    const borderY = normalizeNumberLike(textbox.bordersize?.y, height);
    const format = textbox.format?._name.replace('centre', 'center');
    const font = textbox.font ?? '';
    const fontMatch = /\d+/.exec(font.replace('hoi4', ''));
    const fontSize = Math.ceil(parseInt(fontMatch?.find(() => true) ?? '16') * 0.7);

    return `<div
    ${options.id ? `id="${options.id}"` : ''}
    start="${textbox._token?.start}"
    end="${textbox._token?.end}"
    class="
        ${options?.classNames ? options.classNames : ''}
        ${options.styleTable.style('positionAbsolute', () => `position: absolute;`)}
        ${options.styleTable.style('borderBox', () => `box-sizing: border-box;`)}
        ${options.styleTable.oneTimeStyle('instanttextbox', () => `
            left: ${x}px;
            top: ${y}px;
            width: ${width}px;
            height: ${height}px;
            font-size: ${fontSize}px;
            text-align: ${format};
            padding: ${borderY}px ${borderX}px;
            ${textbox.vertical_alignment === 'center' ? `vertical-align: middle; line-height: ${height}px;` : ''}
        `)}
        ${options.styleTable.style('instanttextbox-common', () => `
            color: white;
            text-shadow: 0 0 3px black, 0px 0px 5px black;
        `)}
        ${options.enableNavigator ? 'navigator navigator-highlight' : ''}
    ">
        ${htmlEscape(textbox.text ?? ' ')}
    </div>`;
}