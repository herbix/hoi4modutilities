import { parseDds } from './image/ddsparser';
import { PNG } from 'pngjs';
import { parseHoi4File } from '../hoiformat/hoiparser';
import { getSpriteTypes } from '../hoiformat/spritetype';
import { readFileFromModOrHOI4 } from './fileloader';
import { PromiseCache } from './cache';
import { ddsToPng } from './image/converter';

export interface Image {
    uri: string;
    width: number;
    height: number;
    path: string;
}

export const imageCache = new PromiseCache({
    factory: getImage,
    life: 10 * 60 * 1000
});

const gfxMapCache = new PromiseCache({
    factory: loadGfxMap,
    life: 10 * 60 * 1000
});

const defaultFocusIcon = 'gfx/interface/goals/goal_unknown.dds';

export async function getFocusIcon(name: string): Promise<Image | null> {
    const gfxMap = await gfxMapCache.get();
    const ddsPath = gfxMap[name] ?? defaultFocusIcon;

    const result = await imageCache.get(ddsPath);
    if (result === null && ddsPath !== defaultFocusIcon) {
        return await imageCache.get(defaultFocusIcon);
    }

    return result;
}

async function getImage(relativePath: string): Promise<Image | null> {
    try {
        const [buffer, realPath] = await readFileFromModOrHOI4(relativePath);
        let png: PNG;
        let pngBuffer: Buffer;

        if (relativePath.endsWith('.dds')) {
            const dds = parseDds(buffer.buffer);
            png = ddsToPng(dds);
            pngBuffer = PNG.sync.write(png);

        } else if (relativePath.endsWith('.png')) {
            pngBuffer = buffer;
            png = PNG.sync.read(buffer);

        } else {
            throw new Error('Unsupported image type: ' + relativePath);
        }

        const result: Image = {
            uri: 'data:image/png;base64,' + pngBuffer.toString('base64'),
            width: png.width,
            height: png.height,
            path: realPath,
        };

        return result;

    } catch (e) {
        console.error(e);
        return null;
    }
}

async function loadGfxMap(): Promise<Record<string, string>> {
    const gfxMap: Record<string, string> = {};
    try {
        const [buffer] = await readFileFromModOrHOI4('interface/goals.gfx');
        const gfx = buffer.toString('utf-8');
        const node = parseHoi4File(gfx);
        const spriteTypes = getSpriteTypes(node);

        spriteTypes.forEach(st => gfxMap[st.name] = st.texturefile);

    } catch (e) {
        console.error(e);
    }

    return gfxMap;
}
