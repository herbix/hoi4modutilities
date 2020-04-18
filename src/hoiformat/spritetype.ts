import { forEachNodeValue, getPropertyNodes, getStringPropertyOrUndefined } from "./hoinodeutils";
import { Node, Token } from "./hoiparser";

export interface SpriteType {
    name: string;
    texturefile: string;
    token: Token | null;
}

export function getSpriteTypes(node: Node): SpriteType[] {
    const result: SpriteType[] = [];

    forEachNodeValue(node, stsNode => {
        if (stsNode.name !== 'spriteTypes') {
            return;
        }

        const sprites = getPropertyNodes(stsNode, 'SpriteType');
        for (const sprite of sprites) {
            const name = getStringPropertyOrUndefined(sprite, 'name');
            const texturefile = getStringPropertyOrUndefined(sprite, 'texturefile');
            if (name && texturefile) {
                result.push({
                    name,
                    texturefile,
                    token: sprite.nameToken,
                });
            }
        }
    });

    return result;
}
