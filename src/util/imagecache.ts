import { parseDds, DDS } from './ddsparser';
import { PNG } from 'pngjs';
import { parseHoi4File } from '../hoiformat/hoiparser';
import { getSpriteTypes } from '../hoiformat/spritetype';
import { readFileFromModOrHOI4 } from './fileloader';
import { PromiseCache } from './cache';

export interface Image {
    uri: string;
    width: number;
    height: number;
}

export const imageCache = new PromiseCache<Image | null>({
    factory: getImage,
    life: 10 * 60 * 1000
});

const gfxMapCache = new PromiseCache<Record<string, string>>({
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
        const buffer = (await readFileFromModOrHOI4(relativePath)).buffer;
        const dds = parseDds(buffer);
        const png = ddsToPng(dds);

        const pngBuffer = PNG.sync.write(png);
        const result: Image = {
            uri: 'data:image/png;base64,' + pngBuffer.toString('base64'),
            width: png.width,
            height: png.height
        };

        return result;

    } catch (e) {
        console.error(e);
        return null;
    }
}


function end0count(v: number): number {
    if (v === 0) {
        return 0;
    }

	let r = 0;
	while ((v & 1) === 0) {
		v >>>= 1;
		r++;
	}
	return r;
}

function all1Count(v: number): number {
	v = ((v & 0xAAAAAAAA) >>> 1) + (v & 0x55555555);
	v = ((v & 0xCCCCCCCC) >>> 2) + (v & 0x33333333);
	v = ((v & 0xF0F0F0F0) >>> 4) + (v & 0x0F0F0F0F);
	v = ((v & 0xFF00FF00) >>> 8) + (v & 0x00FF00FF);
	v = ((v & 0xFFFF0000) >>> 16) + (v & 0x0000FFFF);
	return v;
}

function ddsToPng(dds: DDS): PNG {
    const img = dds.mainSurface;
    const buffer = dds.buffer;

    const png = new PNG({ width: img.width, height: img.height });
    const imgbuffer = img.pixelSizeInByte === 2 ? new Uint16Array(buffer, img.offset, img.length / 2) : (
        img.pixelSizeInByte === 4 ? new Uint32Array(buffer, img.offset, img.length / 4) :
        new Uint8Array(buffer, img.offset, img.length)
    );
    const canReadDirectly = img.pixelSizeInByte !== 3;

    const masks = [dds.header.ddspf.dwRBitMask, dds.header.ddspf.dwGBitMask, dds.header.ddspf.dwBBitMask, dds.header.ddspf.dwABitMask];
    const moves = masks.map(end0count);
    const scales = masks.map(v => 255 / ((1 << all1Count(v)) - 1));
    
    for (let y = 0; y < png.height; y++) {
        for (let x = 0; x < png.width; x++) {
            let idx = png.width * y + x;
            let pixel;
            if (canReadDirectly) {
                pixel = imgbuffer[idx];
            } else {
                pixel = imgbuffer[idx * 3] | (imgbuffer[idx * 3 + 1] << 8) | (imgbuffer[idx * 3 + 2] << 16);
            }

            idx <<= 2;
        
            for (let i = 0; i < 4; i++) {
                png.data[idx + i] = ((pixel & masks[i]) >> moves[i]) * scales[i];
                if (i === 3 && (dds.header.ddspf.dwFlags & 1) === 0) {
                    png.data[idx + i] = 255;
                }
            }
        }
    }

    return png;
}

async function loadGfxMap(): Promise<Record<string, string>> {
    const gfxMap: Record<string, string> = {};
    try {
        const buffer = await readFileFromModOrHOI4('interface/goals.gfx');
        const gfx = buffer.toString('utf-8');
        const node = parseHoi4File(gfx);
        const spriteTypes = getSpriteTypes(node);

        spriteTypes.forEach(st => gfxMap[st.name] = st.texturefile);

    } catch (e) {
        console.error(e);
    }

    return gfxMap;
}
