import { HOIPartial } from "../../hoiformat/schema";
import { ParentInfo, calculateBBox } from "./common";
import { IconType } from "../../hoiformat/gui";
import { RenderNodeCommonOptions, renderSprite } from './nodecommon';

export interface RenderIconOptions extends RenderNodeCommonOptions {
}

export async function renderIcon(icon: HOIPartial<IconType>, parentInfo: ParentInfo, options: RenderIconOptions): Promise<string> {
    const spriteType = icon.spritetype ?? icon.quadtexturesprite;
    const image = options.getSprite && spriteType ? await options.getSprite(spriteType, 'icon', icon.name) : undefined;

    if (image === undefined) {
        return '';
    }

    let [x, y] = calculateBBox(icon, parentInfo);
    if (icon.centerposition) {
        x -= image.width / 2;
        y -= image.height / 2;
    }

    const scale = icon.scale ?? 1;

    return `<div
    start="${icon._token?.start}"
    end="${icon._token?.end}"
    class="
        ${options.enableNavigator ? 'navigator navigator-highlight' : ''}
        ${options.styleTable.style('positionAbsolute', () => `position: absolute;`)}
        ${options.styleTable.oneTimeStyle('icon', () => `
            left: ${x}px;
            top: ${y}px;
            width: ${image.width * scale}px;
            height: ${image.height * scale}px;
        `)}
    ">
        ${renderSprite({x: 0, y: 0}, image, image, icon.frame ?? 0, scale, options)}
    </div>`;
}
