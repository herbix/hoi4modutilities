import { PNG } from "pngjs";
import { parseHoi4File } from "../../../hoiformat/hoiparser";
import { convertNodeToJson, Enum, SchemaDef } from "../../../hoiformat/schema";
import { debug, error } from "../../../util/debug";
import { listFilesFromModOrHOI4, readFileFromModOrHOI4 } from "../../../util/fileloader";
import { DDS } from "../../../util/image/dds";
import { MapFont, MapFontGlyph } from "../definitions";
import { LoadResult } from "./common";
import { parseFontFile, SourceGlyph } from "./bitmapfont";

interface BitmapFontDefinition {
    name: string;
    path: string;
    fontfiles: Enum;
}

interface BitmapFontContainer {
    bitmapfont: BitmapFontDefinition[];
    bitmapfont_override: BitmapFontDefinition[];
}

interface BitmapFontFile {
    bitmapfonts: BitmapFontContainer[];
}

const bitmapFontDefinitionSchema: SchemaDef<BitmapFontDefinition> = {
    name: "string",
    path: "string",
    fontfiles: "enum",
};

const bitmapFontFileSchema: SchemaDef<BitmapFontFile> = {
    bitmapfonts: {
        _innerType: {
            bitmapfont: {
                _innerType: bitmapFontDefinitionSchema,
                _type: "array",
            },
            bitmapfont_override: {
                _innerType: bitmapFontDefinitionSchema,
                _type: "array",
            },
        },
        _type: "array",
    },
};

export async function loadMapFont(countryNames: string[]): Promise<LoadResult<MapFont | undefined>> {
    const dependencies: string[] = ['interface/*'];
    try {
        const { fontFiles, definitionFile } = await findMapFontFiles();
        debug('World map font', definitionFile ?? '[Vanilla] gfx/fonts/hoi_mapfont4', fontFiles);
        if (definitionFile) {
            dependencies.push(definitionFile);
        }

        const usedCharacters = new Set<number>();
        for (const name of countryNames) {
            for (const character of name.toLocaleUpperCase()) {
                usedCharacters.add(character.codePointAt(0)!);
            }
        }

        const glyphs = new Map<number, SourceGlyph>();
        let lineHeight = 0;
        for (const fontFileWithoutExtension of fontFiles) {
            const fontFile = fontFileWithoutExtension.toLocaleLowerCase().endsWith('.fnt') ? fontFileWithoutExtension : fontFileWithoutExtension + '.fnt';
            const [buffer] = await readFileFromModOrHOI4(fontFile);
            dependencies.push(fontFile);
            const parsed = parseFontFile(buffer.toString(), fontFile, usedCharacters);
            lineHeight = lineHeight || parsed.lineHeight;
            for (const [id, glyph] of parsed.glyphs) {
                glyphs.set(id, glyph);
            }
        }

        if (glyphs.size === 0 || lineHeight === 0) {
            return { result: undefined, warnings: [], dependencies };
        }

        const result = await createFontAtlas(glyphs, lineHeight, dependencies);
        return { result, warnings: [], dependencies };
    } catch (e) {
        error(e);
        return { result: undefined, warnings: [], dependencies };
    }
}

async function findMapFontFiles(): Promise<{ fontFiles: string[], definitionFile?: string }> {
    const files = (await listFilesFromModOrHOI4('interface', { mod: true, hoi4: false, dlc: false, recursively: true }))
        .filter(file => file.toLocaleLowerCase().endsWith('.gfx'))
        .sort((a, b) => a.localeCompare(b));
    let result: { fontFiles: string[], definitionFile?: string } | undefined;

    for (const file of files) {
        const relativeFile = 'interface/' + file;
        try {
            const [buffer] = await readFileFromModOrHOI4(relativeFile, { hoi4: false, dlc: false });
            const parsed = convertNodeToJson<BitmapFontFile>(parseHoi4File(buffer.toString()), bitmapFontFileSchema);
            for (const container of parsed.bitmapfonts) {
                for (const font of container.bitmapfont.concat(container.bitmapfont_override)) {
                    if (font.name?.toLocaleLowerCase() !== 'tahoma_60') {
                        continue;
                    }
                    const fontFiles = (font.fontfiles._values.length > 0 ? font.fontfiles._values : font.path ? [font.path] : [])
                        .filter((fontFile): fontFile is string => !!fontFile)
                        .map(fontFile => fontFile.replace(/^"|"$/g, ''));
                    if (fontFiles.length > 0) {
                        result = { fontFiles, definitionFile: relativeFile };
                    }
                }
            }
        } catch {
            // Other interface files may use syntax outside this small schema. They do not affect the map font.
        }
    }

    return result ?? { fontFiles: ['gfx/fonts/hoi_mapfont4'] };
}

async function createFontAtlas(sourceGlyphs: Map<number, SourceGlyph>, lineHeight: number, dependencies: string[]): Promise<MapFont> {
    const atlasWidth = 1024;
    let x = 1;
    let y = 1;
    let rowHeight = 0;
    for (const glyph of sourceGlyphs.values()) {
        if (glyph.w === 0 || glyph.h === 0) {
            continue;
        }
        if (x + glyph.w + 1 > atlasWidth) {
            x = 1;
            y += rowHeight + 1;
            rowHeight = 0;
        }
        glyph.x = x;
        glyph.y = y;
        x += glyph.w + 1;
        rowHeight = Math.max(rowHeight, glyph.h);
    }
    const atlas = new PNG({ width: atlasWidth, height: Math.max(1, y + rowHeight + 1) });
    const glyphsByTexture = new Map<string, SourceGlyph[]>();
    for (const glyph of sourceGlyphs.values()) {
        const pageGlyphs = glyphsByTexture.get(glyph.texture) ?? [];
        pageGlyphs.push(glyph);
        glyphsByTexture.set(glyph.texture, pageGlyphs);
    }

    for (const [texture, glyphs] of glyphsByTexture) {
        const [buffer] = await readFileFromModOrHOI4(texture);
        dependencies.push(texture);
        const image = DDS.parse(buffer.buffer, buffer.byteOffset).images[0];
        const pixels = image.getFullRgba();
        for (const glyph of glyphs) {
            for (let row = 0; row < glyph.h; row++) {
                const sourceStart = ((glyph.sourceY + row) * image.width + glyph.sourceX) * 4;
                const targetStart = ((glyph.y + row) * atlas.width + glyph.x) * 4;
                atlas.data.set(pixels.subarray(sourceStart, sourceStart + glyph.w * 4), targetStart);
            }
        }
    }

    const glyphs: Record<number, MapFontGlyph | undefined> = {};
    for (const [id, glyph] of sourceGlyphs) {
        const { sourceX, sourceY, texture, ...packedGlyph } = glyph;
        glyphs[id] = packedGlyph;
    }
    return {
        lineHeight,
        imageUri: 'data:image/png;base64,' + PNG.sync.write(atlas).toString('base64'),
        glyphs,
    };
}
