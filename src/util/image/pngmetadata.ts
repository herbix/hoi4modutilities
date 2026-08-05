const pngSignature = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
const physicalPixelDimensionsChunkType = Buffer.from('pHYs', 'ascii');

export function setPngDpi(buffer: Buffer, dpi: number): Buffer {
    if (!Number.isFinite(dpi) || dpi <= 0) {
        throw new Error('DPI must be a positive finite number.');
    }
    if (!buffer.subarray(0, pngSignature.length).equals(pngSignature)) {
        throw new Error('Invalid PNG signature.');
    }

    const pixelsPerMeter = Math.round(dpi / 0.0254);
    const data = Buffer.alloc(9);
    data.writeUInt32BE(pixelsPerMeter, 0);
    data.writeUInt32BE(pixelsPerMeter, 4);
    data.writeUInt8(1, 8);
    const physicalPixelDimensionsChunk = createPngChunk(physicalPixelDimensionsChunkType, data);

    let offset = pngSignature.length;
    let insertOffset: number | undefined;
    while (offset + 12 <= buffer.length) {
        const length = buffer.readUInt32BE(offset);
        const end = offset + length + 12;
        if (end > buffer.length) {
            throw new Error('Invalid PNG chunk length.');
        }

        const type = buffer.toString('ascii', offset + 4, offset + 8);
        if (type === 'IHDR') {
            insertOffset = end;
        } else if (type === 'pHYs') {
            if (length === data.length) {
                physicalPixelDimensionsChunk.copy(buffer, offset);
                return buffer;
            }
            return Buffer.concat([buffer.subarray(0, offset), physicalPixelDimensionsChunk, buffer.subarray(end)]);
        } else if (type === 'IDAT' || type === 'IEND') {
            break;
        }
        offset = end;
    }

    if (insertOffset === undefined) {
        throw new Error('Invalid PNG: IHDR chunk not found.');
    }

    return Buffer.concat([buffer.subarray(0, insertOffset), physicalPixelDimensionsChunk, buffer.subarray(insertOffset)]);
}

function createPngChunk(type: Buffer, data: Buffer): Buffer {
    const result = Buffer.alloc(data.length + 12);
    result.writeUInt32BE(data.length, 0);
    type.copy(result, 4);
    data.copy(result, 8);
    result.writeUInt32BE(crc32(result.subarray(4, 8 + data.length)), 8 + data.length);
    return result;
}

function crc32(buffer: Buffer): number {
    let crc = 0xFFFFFFFF;
    for (const value of buffer) {
        crc ^= value;
        for (let bit = 0; bit < 8; bit++) {
            crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
        }
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
}
