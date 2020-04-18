import { DDS } from "./ddsparser";
import { PNG } from "pngjs";

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

export function ddsToPng(dds: DDS): PNG {
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
