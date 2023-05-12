import { UserError } from '../../common';

export interface BMP {
    width: number;
    height: number;
    bitsPerPixel: number;
    bytesPerRow: number;
    data: Uint8Array;
}

export function parseBmp(buffer: ArrayBuffer, byteOffset: number): BMP {
    const uint8Buffer = new Uint8Array(buffer, byteOffset);
    if (uint8Buffer[0] !== 0x42 || uint8Buffer[1] !== 0x4D) {
        throw new UserError("Bmp not starts with 'BM'");
    }

    const bmpHeader = new DataView(buffer, 2 + byteOffset, 4 << 2);
    const dataOffset = byteOffset + bmpHeader.getUint32(2 << 2, true);

    const dibHeaderLength = bmpHeader.getUint32(3 << 2, true);
    const dibHeader = new DataView(buffer, 0xE + byteOffset, dibHeaderLength << 2);

    const width = dibHeader.getUint32(1 << 2, true);
    const height = dibHeader.getUint32(2 << 2, true);
    const bitsPerPixel = dibHeader.getUint16(7 << 1, true);

    const bytesPerRow = ((width * bitsPerPixel + 7 >> 3) + 3) & 0xFFFFFFFC;

    return {
        width,
        height,
        bitsPerPixel,
        bytesPerRow,
        data: new Uint8Array(buffer, dataOffset, bytesPerRow * height),
    };
}
