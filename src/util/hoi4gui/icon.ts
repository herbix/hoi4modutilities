import { HOIPartial, IconType } from "../../hoiformat/schema";
import { ParentInfo, calculateBBox, renderSprite, RenderCommonOptions } from "./common";

export interface RenderIconOptions extends RenderCommonOptions {
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

    return renderSprite({x, y}, image, image, icon.frame ?? 0, options);
}
