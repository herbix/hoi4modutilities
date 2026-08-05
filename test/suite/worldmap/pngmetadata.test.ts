import * as assert from 'assert';
import { PNG } from 'pngjs';
import { setPngDpi } from '../../../src/util/image/pngmetadata';

suite('PNG metadata', () => {
    test('adds 300 DPI without changing the image pixels', () => {
        const png = new PNG({ width: 1, height: 1 });
        png.data.set([0x31, 0x5D, 0x9B, 0xFF]);
        const source = PNG.sync.write(png);

        const result = setPngDpi(source, 300);
        const physicalPixelDimensions = findChunk(result, 'pHYs');

        assert.ok(physicalPixelDimensions);
        assert.strictEqual(physicalPixelDimensions.readUInt32BE(0), 11811);
        assert.strictEqual(physicalPixelDimensions.readUInt32BE(4), 11811);
        assert.strictEqual(physicalPixelDimensions.readUInt8(8), 1);
        assert.deepStrictEqual(PNG.sync.read(result, { checkCRC: true }).data, png.data);
    });

    test('replaces an existing physical pixel dimensions chunk in place', () => {
        const png = PNG.sync.write(new PNG({ width: 1, height: 1 }));
        const with96Dpi = setPngDpi(png, 96);
        const result = setPngDpi(with96Dpi, 300);
        const physicalPixelDimensions = findChunk(result, 'pHYs');

        assert.strictEqual(result, with96Dpi);
        assert.strictEqual(countChunks(result, 'pHYs'), 1);
        assert.strictEqual(physicalPixelDimensions?.readUInt32BE(0), 11811);
        PNG.sync.read(result, { checkCRC: true });
    });

    test('rejects invalid PNG data and DPI values', () => {
        assert.throws(() => setPngDpi(Buffer.from('not a png'), 300), /Invalid PNG signature/);

        const png = PNG.sync.write(new PNG({ width: 1, height: 1 }));
        assert.throws(() => setPngDpi(png, 0), /DPI must be a positive finite number/);
    });
});

function findChunk(buffer: Buffer, expectedType: string): Buffer | undefined {
    let offset = 8;
    while (offset + 12 <= buffer.length) {
        const length = buffer.readUInt32BE(offset);
        const type = buffer.toString('ascii', offset + 4, offset + 8);
        if (type === expectedType) {
            return buffer.subarray(offset + 8, offset + 8 + length);
        }
        offset += length + 12;
    }
    return undefined;
}

function countChunks(buffer: Buffer, expectedType: string): number {
    let result = 0;
    let offset = 8;
    while (offset + 12 <= buffer.length) {
        const length = buffer.readUInt32BE(offset);
        if (buffer.toString('ascii', offset + 4, offset + 8) === expectedType) {
            result++;
        }
        offset += length + 12;
    }
    return result;
}
