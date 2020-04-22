import { InstantTextBoxType, HOIPartial } from "../../hoiformat/schema";
import { ParentInfo, calculateBBox, RenderCommonOptions } from "./common";

export interface RenderInstantTextBoxOptions extends RenderCommonOptions {

}

export async function renderInstantTextBox(textbox: HOIPartial<InstantTextBoxType>, parentInfo: ParentInfo, options: RenderInstantTextBoxOptions): Promise<string> {
    if (!textbox.text) {
        return '';
    }

    const [x, y, width, height] = calculateBBox({ ...textbox, size: { width: textbox.maxwidth, height: textbox.maxheight } }, parentInfo);
    const format = textbox.format?._name;
    const font = textbox.font ?? '';
    const fontMatch = /\d+/.exec(font);
    const fontSize = parseInt(fontMatch?.find(() => true) ?? '12');

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
        color: white;
    ">
        ${textbox.text}
    </div>`;
}