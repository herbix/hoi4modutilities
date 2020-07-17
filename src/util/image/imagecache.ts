import { PNG } from 'pngjs';
import { parseHoi4File } from '../../hoiformat/hoiparser';
import { getSpriteTypes } from '../../hoiformat/spritetype';
import { readFileFromModOrHOI4, hoiFileExpiryToken } from '../fileloader';
import { PromiseCache } from '../cache';
import { ddsToPng } from './converter';
import { SpriteType, CorneredTileSpriteType } from '../../hoiformat/spritetype';
import { Sprite, Image, CorneredTileSprite } from './sprite';
import { localize } from '../i18n';
import { error } from '../debug';
import { DDS } from './dds';
import { getLastModifiedAsync } from '../nodecommon';
import { UserError } from '../common';
export { Sprite, Image };

const imageCache = new PromiseCache({
    expireWhenChange: hoiFileExpiryToken,
    factory: getImage,
    life: 10 * 60 * 1000
});

const spriteCache = new PromiseCache({
    expireWhenChange: spriteCacheExpiryToken,
    factory: getSpriteByKey,
    life: 10 * 60 * 1000
});

const gfxMapCache = new PromiseCache({
    expireWhenChange: hoiFileExpiryToken,
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
            result = await spriteCache.get(path + '?' + name);
            if (result !== undefined) {
                break;
            }
        }
    } else {
        result = await spriteCache.get(gfxFilePath + '?' + name);
    }

    return result;
}

async function spriteCacheExpiryToken(key: string, spritePromise: Promise<Sprite | undefined>): Promise<string> {
    const [gfxFilePath] = key.split('?');
    const gfxToken = await hoiFileExpiryToken(gfxFilePath);
    const sprite = await spritePromise;
    if (sprite) {
        return `${gfxToken}:${sprite.image.path}@${await getLastModifiedAsync(sprite.image.path)}`;
    }
    return gfxToken;
}

function getSpriteByKey(key: string): Promise<Sprite | undefined> {
    const [gfxFilePath, name] = key.split('?');
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
        return new CorneredTileSprite(name, image, sprite.noofframes, sprite.size, sprite.bordersize);
    }

    return new Sprite(name, image, sprite.noofframes);
}

async function getImage(relativePath: string): Promise<Image | undefined> {
    let readFileResult: [Buffer, string] | undefined = undefined;
    try {
        readFileResult = await readFileFromModOrHOI4(relativePath);
    } catch(e) {
        if (!(e instanceof UserError)) {
            error("Failed to get image " + relativePath);
        }
        error(e);

        if (relativePath.length <= 4 || relativePath.endsWith('.dds')) {
            return undefined;
        }

        // in case .png or .tga not exist but .dds exist
        relativePath = relativePath.substr(0, relativePath.length - 4) + '.dds';
    }

    try {
        const [buffer, realPath] = readFileResult ?? await readFileFromModOrHOI4(relativePath);
        let png: PNG;
        let pngBuffer: Buffer;

        if (relativePath.endsWith('.dds')) {
            const dds = DDS.parse(buffer.buffer);
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
        if (!(e instanceof UserError)) {
            error("Failed to get image " + relativePath);
        }
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
