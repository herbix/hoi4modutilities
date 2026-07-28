import * as vscode from 'vscode';
import { forceError } from '../common';
import { PNG } from 'pngjs';
import { parseHoi4File } from '../../hoiformat/hoiparser';
import { getSpriteTypes } from '../../hoiformat/spritetype';
import { readFileFromModOrHOI4, hoiFileExpiryToken, expiryToken } from '../fileloader';
import { PromiseCache } from '../cache';
import { ddsToPng, tgaToPng } from './converter';
import { AnySpriteType } from '../../hoiformat/spritetype';
import { Sprite, Image, CorneredTileSprite, ProgressBarSprite } from './sprite';
import { localize } from '../i18n';
import { error } from '../debug';
import { DDS } from './dds';
import { UserError } from '../common';
import { gfxIndex } from '../../indexing/gfxindex';
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

export function clearImageCache(): void {
    imageCache.clear();
    spriteCache.clear();
    gfxMapCache.clear();
}

export async function getSpriteByGfxName(name: string, gfxFilePath: string | string[]): Promise<Sprite | undefined> {
    const pathFromIndex = await gfxIndex.getGfxContainerFile(name);
    if (pathFromIndex) {
        return await spriteCache.get(pathFromIndex + '?' + name);
    } else if (Array.isArray(gfxFilePath)) {
        for (const path of gfxFilePath) {
            const result = await spriteCache.get(path + '?' + name);
            if (result !== undefined) {
                return result;
            }
        }
    } else {
        return await spriteCache.get(gfxFilePath + '?' + name);
    }

    return undefined;
}

async function spriteCacheExpiryToken(key: string, spritePromise: Promise<Sprite | undefined>): Promise<string> {
    const [gfxFilePath] = key.split('?');
    const gfxToken = await hoiFileExpiryToken(gfxFilePath);
    const sprite = await spritePromise;
    if (sprite) {
        if (sprite instanceof ProgressBarSprite) {
            return `${gfxToken}:${await expiryToken(sprite.image.path)}:${await expiryToken(sprite.backgroundImage.path)}`;
        }
        return `${gfxToken}:${expiryToken(sprite.image.path)}`;
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

    if ('texturefile2' in sprite) {
        const backgroundImage = await imageCache.get(sprite.texturefile2);
        if (backgroundImage === undefined) {
            return undefined;
        }
        return new ProgressBarSprite(name, image, backgroundImage, sprite.size, sprite.horizontal);
    }

    if ('bordersize' in sprite) {
        return new CorneredTileSprite(name, image, sprite.noofframes, sprite.size, sprite.bordersize);
    }

    return new Sprite(name, image, sprite.noofframes);
}

async function getImage(relativePath: string): Promise<Image | undefined> {
    let readFileResult: [Buffer, vscode.Uri] | undefined = undefined;
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

        relativePath = relativePath.toLowerCase();
        if (relativePath.endsWith('.dds')) {
            const dds = DDS.parse(buffer.buffer, buffer.byteOffset);
            png = ddsToPng(dds);
            pngBuffer = PNG.sync.write(png);
        
        } else if (relativePath.endsWith('.tga')) {
            png = tgaToPng(buffer);
            pngBuffer = PNG.sync.write(png);

        } else if (relativePath.endsWith('.png')) {
            pngBuffer = buffer;
            png = PNG.sync.read(buffer);

        } else {
            throw new UserError('Unsupported image type: ' + relativePath);
        }

        return new Image(pngBuffer, png.width, png.height, realPath);

    } catch (e) {
        let err = forceError(e);
        // From PNG parser
        if (err.message === 'Invalid file signature') {
            err = new UserError(err.message);
        }
        if (!(err instanceof UserError)) {
            error("Failed to get image " + relativePath);
        }
        error(err);
        return undefined;
    }
}

async function loadGfxMap(path: string): Promise<Record<string, AnySpriteType>> {
    const gfxMap: Record<string, AnySpriteType> = {};
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
