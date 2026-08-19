import { MapFontGlyph } from "../definitions";

export interface SourceGlyph extends MapFontGlyph {
    texture: string;
    sourceX: number;
    sourceY: number;
}

export function parseFontFile(content: string, fontFile: string, usedCharacters: Set<number>): {
    lineHeight: number,
    glyphs: Map<number, SourceGlyph>,
} {
    const common = content.match(/^common\s+.*\blineHeight=(\d+)/m);
    const page = content.match(/^page\s+.*\bfile="([^"]+)"/m);
    const directory = fontFile.substring(0, fontFile.lastIndexOf('/') + 1);
    const texture = page ? directory + page[1] : fontFile.replace(/\.fnt$/i, '.dds');
    const glyphs = new Map<number, SourceGlyph>();

    for (const line of content.split(/\r?\n/)) {
        if (!/^char\s+/.test(line)) {
            continue;
        }
        const values: Record<string, number> = {};
        for (const match of line.matchAll(/([a-z]+)=\s*(-?\d+)/gi)) {
            values[match[1].toLocaleLowerCase()] = Number(match[2]);
        }
        if (!usedCharacters.has(values.id)) {
            continue;
        }
        glyphs.set(values.id, {
            texture,
            sourceX: values.x,
            sourceY: values.y,
            x: 0,
            y: 0,
            w: values.width,
            h: values.height,
            xOffset: values.xoffset,
            yOffset: values.yoffset,
            xAdvance: values.xadvance,
        });
    }

    return { lineHeight: Number(common?.[1] ?? 0), glyphs };
}
