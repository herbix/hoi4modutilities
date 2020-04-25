import { InstantTextBoxType, HOIPartial } from "../../hoiformat/schema";
import { ParentInfo, calculateBBox, RenderCommonOptions, normalizeNumberLike } from "./common";

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
    ${options.classNames ? `class="${options.classNames}"` : ''}
    style="
        position: absolute;
        left: ${x}px;
        top: ${y}px;
        width: ${width}px;
        height: ${height}px;
        font-size: ${fontSize}px;
        text-align: ${format};
        padding: ${borderY}px ${borderX}px;
        box-sizing: border-box;
        color: white;
        text-shadow: 0 0 3px black, 0px 0px 5px black;
    ">
        ${textbox.text}
    </div>`;
}