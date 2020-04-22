import { parseDds } from './image/ddsparser';
import { PNG } from 'pngjs';
import { parseHoi4File } from '../hoiformat/hoiparser';
import { getSpriteTypes } from '../hoiformat/spritetype';
import { readFileFromModOrHOI4 } from './fileloader';
import { PromiseCache } from './cache';
import { ddsToPng } from './image/converter';
import { SpriteType } from '../hoiformat/schema';

export const imageCache = new PromiseCache({
    factory: getImage,
    life: 10 * 60 * 1000
});

const spriteCache = new PromiseCache({
    factory: getSpriteByKey,
    life: 10 * 60 * 1000
});

const focusesGFX = 'interface/goals.gfx';
const technologiesGFX = 'interface/technologies.gfx';
const gfxMapCache = new PromiseCache({
    factory: loadGfxMap,
    life: 10 * 60 * 1000
});

const defaultFocusIcon = 'gfx/interface/goals/goal_unknown.dds';

export async function getFocusIcon(name: string): Promise<Image | undefined> {
    const sprite = await getSpriteByGfxName(name, focusesGFX);
    if (sprite !== undefined) {
        return sprite.image;
    }

    return await imageCache.get(defaultFocusIcon);
}

export function getTechnologyIcon(name: string): Promise<Sprite | undefined> {
    return getSpriteByGfxName(name, technologiesGFX);
}

export async function getSpriteByGfxName(name: string, gfxFilePath: string | string[]): Promise<Sprite | undefined> {
    let result: Sprite | undefined = undefined;
    if (Array.isArray(gfxFilePath)) {
        for (const path of gfxFilePath) {
            result = await spriteCache.get(path + '!' + name);
            if (result !== undefined) {
                break;
            }
        }
    } else {
        result = await spriteCache.get(gfxFilePath + '!' + name);
    }

    return result;
}

function getSpriteByKey(key: string): Promise<Sprite | undefined> {
    const [gfxFilePath, name] = key.split('!');
    return getSpriteByGfxNameImpl(name, gfxFilePath);
}

async function getSpriteByGfxNameImpl(name: string, gfxFilePath: string): Promise<Sprite | undefined> {
    const gfxMap = await gfxMapCache.get(gfxFilePath);
    const sprite = gfxMap[name];

    if (sprite === undefined) {
        return undefined;
    }

    const image = await imageCache.get(sprite.texturefile);
    if (image === undefined) {
        return undefined;
    }

    return new Sprite(image, sprite.noofframes);
}

async function getImage(relativePath: string): Promise<Image | undefined> {
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

        return new Image(pngBuffer, png.width, png.height, realPath);

    } catch (e) {
        console.error(e);
        return undefined;
    }
}

async function loadGfxMap(path: string): Promise<Record<string, SpriteType>> {
    const gfxMap: Record<string, SpriteType> = {};
    try {
        const [buffer] = await readFileFromModOrHOI4(path);
        const gfx = buffer.toString('utf-8');
        const node = parseHoi4File(gfx);
        const spriteTypes = getSpriteTypes(node);

        spriteTypes.forEach(st => gfxMap[st.name] = st);

    } catch (e) {
        console.error(e);
    }

    return gfxMap;
}

function toDataUrl(buffer: Buffer): string {
    return 'data:image/png;base64,' + buffer.toString('base64');
}

export class Image {
    private cachedUri: string | undefined = undefined;
    constructor(
        readonly pngBuffer: Buffer,
        readonly width: number,
        readonly height: number,
        readonly path: string) {
    }

    public get uri(): string {
        if (this.cachedUri) {
            return this.cachedUri;
        }

        return this.cachedUri = toDataUrl(this.pngBuffer);
    }
}

export class Sprite {
    private cachedFrames: string[] | undefined = undefined;
    constructor(
        readonly image: Image,
        readonly noOfFrames: number) {
    }

    public get frames(): string[] {
        if (this.cachedFrames) {
            return this.cachedFrames;
        }

        if (this.noOfFrames === 1) {
            return this.cachedFrames = [ this.image.uri ];
        }

        const png = new PNG(PNG.sync.read(this.image.pngBuffer));
        const frameWidth = this.width;
        const framePng = new PNG({ width: frameWidth, height: png.height });
        const result: string[] = [];

        for (var i = 0; i < this.noOfFrames; i++) {
            png.bitblt(framePng, i * frameWidth, 0, frameWidth, png.height, 0, 0);
            result.push(toDataUrl(PNG.sync.write(framePng)));
        }

        return this.cachedFrames = result;
    }

    public get width(): number {
        return this.image.width / this.noOfFrames;
    }

    public get height(): number {
        return this.image.height;
    }
}
