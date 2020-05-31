import { Node, Token } from "./hoiparser";
import { SchemaDef, convertNodeToJson, DetailValue } from "./schema";
import { NumberPosition } from "../util/common";

interface SpriteTypes {
    spritetype: SpriteTypeDef[];
    corneredtilespritetype: CorneredTileSpriteTypeDef[];
}

interface SpriteTypeDef {
    name: DetailValue<string>;
    texturefile: string;
    noofframes: number;
    _token: Token | undefined;
}

interface CorneredTileSpriteTypeDef {
    name: DetailValue<string>;
    texturefile: string;
    noofframes: number;
    size: NumberPosition;
    bordersize: NumberPosition;
    tilingCenter: boolean;
    _token: Token | undefined;
}

export interface SpriteType {
    name: string;
    texturefile: string;
    noofframes: number;
    token: Token | undefined;
}

export interface CorneredTileSpriteType {
    name: string;
    texturefile: string;
    noofframes: number;
    size: NumberPosition;
    bordersize: NumberPosition;
    tilingCenter: boolean;
    token: Token | undefined;
}

interface SpriteFile {
    spritetypes: SpriteTypes[];
}

const corneredTileSpriteTypeSchema: SchemaDef<CorneredTileSpriteTypeDef> = {
    name: {
        _innerType: "string",
        _type: "detailvalue",
    },
    texturefile: "string",
    noofframes: "number",
    size: {
        x: "number",
        y: "number",
    },
    bordersize: {
        x: "number",
        y: "number",
    },
    tilingCenter: "boolean",
};

const spriteTypesSchema: SchemaDef<SpriteTypes> = {
    spritetype: {
        _innerType: {
            name: {
                _innerType: "string",
                _type: "detailvalue",
            },
            texturefile: "string",
            noofframes: "number",
        },
        _type: "array",
    },
    corneredtilespritetype: {
        _innerType: corneredTileSpriteTypeSchema,
        _type: "array",
    }
};

const spriteFileSchema: SchemaDef<SpriteFile> = {
    spritetypes: {
        _innerType: spriteTypesSchema,
        _type: "array",
    },
};

export function getSpriteTypes(node: Node): (SpriteType | CorneredTileSpriteType)[] {
    const file = convertNodeToJson<SpriteFile>(node, spriteFileSchema);
    const result: (SpriteType | CorneredTileSpriteType)[] = [];

    for (const spritetypes of file.spritetypes) {
        for (const sprite of spritetypes.spritetype) {
            const name = sprite.name?._value;
            const texturefile = sprite.texturefile;
            if (name && texturefile) {
                result.push({
                    name,
                    texturefile,
                    noofframes: sprite.noofframes ?? 1,
                    token: sprite.name!._startToken,
                });
            }
        }
        
        for (const sprite of spritetypes.corneredtilespritetype) {
            const name = sprite.name?._value;
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
                    token: sprite.name!._startToken,
                });
            }
        }
    }

    return result;
}
