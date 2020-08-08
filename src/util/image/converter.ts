import { DDS } from "./dds";
import { PNG } from "pngjs";
import { UserError } from '../common';
const TGA = require('tga') as typeof import('tga');

export function ddsToPng(dds: DDS): PNG {
    const img = dds.images[0];

    const png = new PNG({ width: img.width, height: img.height });
    const imgbuffer = img.getFullRgba();
    png.data = Buffer.from(imgbuffer);

    return png;
}

export function tgaToPng(buffer: Buffer): PNG {
    const tga = new TGA(buffer);
    const png = new PNG({ width: tga.width, height: tga.height });
    if (!tga.pixels) {
        throw new UserError('Unspported tga format');
    }

    png.data = Buffer.from(tga.pixels);

    return png;
}
