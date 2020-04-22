import { Node } from "./hoiparser";
import { convertNodeFromFileToJson, SpriteType } from "./schema";

export function getSpriteTypes(node: Node): SpriteType[] {
    const file = convertNodeFromFileToJson(node);
    const result: SpriteType[] = [];

    for (const spritetypes of file.spritetypes) {
        for (const sprite of spritetypes.spritetype) {
            const name = sprite.name;
            const texturefile = sprite.texturefile;
            if (name && texturefile) {
                result.push({
                    name,
                    texturefile,
                    noofframes: sprite.noofframes ?? 1,
                    _token: sprite._token,
                });
            }
        }
    }

    return result;
}
