import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { parseDds, DDS } from './ddsparser';
import { PNG } from 'pngjs';
import { parseHoi4File } from '../hoiformat/hoiparser';
import { getSpriteTypes } from '../hoiformat/spritetype';

interface Icon {
    uri: string;
    width: number;
    height: number;
}

let gfxMapLoaded = false;
const gfxMap: Record<string, string> = {};
const cache: Record<string, Icon> = {};

export function getFocusIcon(name: string): Icon | null {
    if (name in cache) {
        return cache[name];
    }

    loadGfxMap();

    const ddsPath = gfxMap[name] ?? 'gfx/interface/goals/goal_unknown.dds';

    const conf = vscode.workspace.getConfiguration('hoi4modutilities');
    const installPath = conf.installPath;

    if (!installPath) {
        return null;
    }

    const fullpath = path.join(installPath, ddsPath);
    if (!fs.existsSync(fullpath)) {
        return null;
    }

    try {
        const buffer = fs.readFileSync(fullpath).buffer; // (await new Promise<Buffer>((resolve, reject) => fs.readFile(fullpath, (e, d) => e ? reject(e) : resolve(d)))).buffer;
        const dds = parseDds(buffer);
        const png = ddsToPng(dds);

        const pngBuffer = PNG.sync.write(png);
        const result: Icon = {
            uri: 'data:image/png;base64,' + pngBuffer.toString('base64'),
            width: png.width,
            height: png.height
        };

        cache[name] = result;
        return result;

    } catch (e) {
        console.error(e);
        return null;
    }
}


function end0count(v: number): number {
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
    const imgbuffer = img.pixelSizeInByte === 1 ? new Uint8Array(buffer, img.offset, img.length) : (
        img.pixelSizeInByte === 2 ? new Uint16Array(buffer, img.offset, img.length / 2) :
        new Uint32Array(buffer, img.offset, img.length / 4)
    );

    const masks = [dds.header.ddspf.dwRBitMask, dds.header.ddspf.dwGBitMask, dds.header.ddspf.dwBBitMask, dds.header.ddspf.dwABitMask];
    const moves = masks.map(end0count);
    const scales = masks.map(v => 255 / ((1 << all1Count(v)) - 1));
    
    for (let y = 0; y < png.height; y++) {
        for (let x = 0; x < png.width; x++) {
            let idx = (png.width * y + x) << 2;
        
            for (let i = 0; i < 4; i++) {
                png.data[idx + i] = ((imgbuffer[idx / 4] & masks[i]) >> moves[i]) * scales[i];
                if (i === 3 && (dds.header.ddspf.dwFlags & 1) === 0) {
                    png.data[idx + i] = 255;
                }
            }
        }
    }

    return png;
}

function loadGfxMap(): void {
    if (gfxMapLoaded) {
        return;
    }

    const conf = vscode.workspace.getConfiguration('hoi4modutilities');
    const installPath = conf.installPath;

    if (!installPath) {
        return;
    }

    const fullpath = path.join(installPath, 'interface/goals.gfx');
    if (!fs.existsSync(fullpath)) {
        return;
    }

    try {
        const buffer = fs.readFileSync(fullpath); // (await new Promise<Buffer>((resolve, reject) => fs.readFile(fullpath, (e, d) => e ? reject(e) : resolve(d)))).buffer;
        const gfx = buffer.toString('utf-8');
        const node = parseHoi4File(gfx);
        const spriteTypes = getSpriteTypes(node);

        spriteTypes.forEach(st => gfxMap[st.name] = st.texturefile);

    } catch (e) {
        console.error(e);
    }
    
    gfxMapLoaded = true;
}
