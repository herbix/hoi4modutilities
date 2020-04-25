import { parseDds } from './ddsparser';
import { PNG } from 'pngjs';
import { parseHoi4File } from '../../hoiformat/hoiparser';
import { getSpriteTypes } from '../../hoiformat/spritetype';
import { readFileFromModOrHOI4 } from '../fileloader';
import { PromiseCache } from '../cache';
import { ddsToPng } from './converter';
import { SpriteType, CorneredTileSpriteType } from '../../hoiformat/schema';
import { Sprite, Image, CorneredTileSprite } from './sprite';
import { localize } from '../i18n';
import { error } from '../debug';
export { Sprite, Image };

const imageCache = new PromiseCache({
    factory: getImage,
    life: 10 * 60 * 1000
});

const spriteCache = new PromiseCache({
    factory: getSpriteByKey,
    life: 10 * 60 * 1000
});

const gfxMapCache = new PromiseCache({
    factory: loadGfxMap,
    life: 10 * 60 * 1000
});

export function getImageByPath(relativePath: string): Promise<Image | undefined> {
    return imageCache.get(relativePath);
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

    if ('bordersize' in sprite) {
        return new CorneredTileSprite(image, sprite.noofframes, sprite.size, sprite.bordersize);
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
        error(e);
        return undefined;
    }
}

async function loadGfxMap(path: string): Promise<Record<string, (SpriteType | CorneredTileSpriteType)>> {
    const gfxMap: Record<string, SpriteType> = {};
    try {
        const [buffer, realPath] = await readFileFromModOrHOI4(path);
        const gfx = buffer.toString('utf-8');
        const node = parseHoi4File(gfx, localize('infile', 'In file {0}:\n', realPath));
        const spriteTypes = getSpriteTypes(node);

        spriteTypes.forEach(st => gfxMap[st.name] = st);

    } catch (e) {
        error(e);
    }

    return gfxMap;
}
