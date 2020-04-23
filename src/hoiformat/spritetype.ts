import { Node } from "./hoiparser";
import { convertNodeFromFileToJson, SpriteType, CorneredTileSpriteType, toNumberLike } from "./schema";

export function getSpriteTypes(node: Node): (SpriteType | CorneredTileSpriteType)[] {
    const file = convertNodeFromFileToJson(node);
    const result: (SpriteType | CorneredTileSpriteType)[] = [];

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
        
        for (const sprite of spritetypes.corneredtilespritetype) {
            const name = sprite.name;
            const texturefile = sprite.texturefile;
            if (name && texturefile) {
                result.push({
                    name,
                    texturefile,
                    noofframes: sprite.noofframes ?? 1,
                    size: {
                        x: sprite.size?.x ?? 100,
                        y: sprite.size?.y ?? 100,
                    },
                    bordersize: {
                        x: sprite.bordersize?.x ?? 0,
                        y: sprite.bordersize?.y ?? 0,
                    },
                    tilingCenter: sprite.tilingCenter ?? false,
                    _token: sprite._token,
                });
            }
        }
    }

    return result;
}
