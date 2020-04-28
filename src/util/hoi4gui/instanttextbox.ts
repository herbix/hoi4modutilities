import { InstantTextBoxType, HOIPartial } from "../../hoiformat/schema";
import { ParentInfo, calculateBBox, RenderCommonOptions, normalizeNumberLike } from "./common";
import { htmlEscape } from "../html";

export interface RenderInstantTextBoxOptions extends RenderCommonOptions {
}

export async function renderInstantTextBox(textbox: HOIPartial<InstantTextBoxType>, parentInfo: ParentInfo, options: RenderInstantTextBoxOptions): Promise<string> {
    if (!textbox.text) {
        return '';
    }

    const [x, y, width, height] = calculateBBox({ ...textbox, size: { width: textbox.maxwidth, height: textbox.maxheight } }, parentInfo);
    const borderX = normalizeNumberLike(textbox.bordersize?.x, width);
    const borderY = normalizeNumberLike(textbox.bordersize?.y, height);
    const format = textbox.format?._name;
    const font = textbox.font ?? '';
    const fontMatch = /\d+/.exec(font);
    const fontSize = Math.ceil(parseInt(fontMatch?.find(() => true) ?? '16') * 0.7);

    return `<div
    ${options.id ? `id="${options.id}"` : ''}
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
        `)}
        ${options.styleTable.style('instanttextbox-common', () => `
            color: white;
            text-shadow: 0 0 3px black, 0px 0px 5px black;
        `)}
    ">
        ${htmlEscape(textbox.text)}
    </div>`;
}