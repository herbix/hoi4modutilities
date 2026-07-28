import { Node, Token } from "./hoiparser";
import { SchemaDef, convertNodeToJson, DetailValue } from "./schema";
import { NumberPosition } from "../util/common";

interface SpriteTypes {
    spritetype: SpriteTypeDef[];
    corneredtilespritetype: CorneredTileSpriteTypeDef[];
    frameanimatedspritetype: SpriteTypeDef[];
    textspritetype: SpriteTypeDef[];
    progressbartype: ProgressBarTypeDef[];
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

interface ProgressBarTypeDef {
    name: DetailValue<string>;
    texturefile1: string;
    texturefile2: string;
    size: NumberPosition;
    horizontal: boolean;
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

export interface ProgressBarType {
    name: string;
    texturefile: string;
    texturefile2: string;
    size: NumberPosition;
    horizontal: boolean;
    token: Token | undefined;
}

export type AnySpriteType = SpriteType | CorneredTileSpriteType | ProgressBarType;

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

const spriteTypeSchema: SchemaDef<SpriteTypeDef> = {
    name: {
        _innerType: "string",
        _type: "detailvalue",
    },
    texturefile: "string",
    noofframes: "number",
};

const progressBarTypeSchema: SchemaDef<ProgressBarTypeDef> = {
    name: {
        _innerType: "string",
        _type: "detailvalue",
    },
    texturefile1: "string",
    texturefile2: "string",
    size: {
        x: "number",
        y: "number",
    },
    horizontal: "boolean",
};

const spriteTypesSchema: SchemaDef<SpriteTypes> = {
    spritetype: {
        _innerType: spriteTypeSchema,
        _type: "array",
    },
    corneredtilespritetype: {
        _innerType: corneredTileSpriteTypeSchema,
        _type: "array",
    },
    frameanimatedspritetype: {
        _innerType: spriteTypeSchema,
        _type: "array",
    },
    textspritetype: {
        _innerType: spriteTypeSchema,
        _type: "array",
    },
    progressbartype: {
        _innerType: progressBarTypeSchema,
        _type: "array",
    },
};

const spriteFileSchema: SchemaDef<SpriteFile> = {
    spritetypes: {
        _innerType: spriteTypesSchema,
        _type: "array",
    },
};

export function getSpriteTypes(node: Node): AnySpriteType[] {
    const file = convertNodeToJson<SpriteFile>(node, spriteFileSchema);
    const result: AnySpriteType[] = [];

    for (const spritetypes of file.spritetypes) {
        for (const sprite of spritetypes.spritetype.concat(spritetypes.frameanimatedspritetype).concat(spritetypes.textspritetype)) {
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

        for (const sprite of spritetypes.progressbartype) {
            const name = sprite.name?._value;
            const texturefile = sprite.texturefile1;
            const texturefile2 = sprite.texturefile2;
            if (name && texturefile && texturefile2) {
                const size = {
                    x: sprite.size?.x ?? 100,
                    y: sprite.size?.y ?? 100,
                };
                result.push({
                    name,
                    texturefile,
                    texturefile2,
                    size,
                    horizontal: sprite.horizontal ?? (size.x >= size.y),
                    token: sprite.name!._startToken,
                });
            }
        }
    }

    return result;
}
