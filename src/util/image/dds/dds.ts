import { DDSHeader, HEADER_LENGTH_INT, DDS_MAGIC, DDPF_FOURCC, DDSCAPS2_CUBEMAP, DDSCAPS2_VOLUME, DDSCAPS_MIPMAP, DDSCAPS2_CUBEMAP_POSITIVEX, DDSCAPS2_CUBEMAP_NEGATIVEX, DDSCAPS2_CUBEMAP_POSITIVEY, DDSCAPS2_CUBEMAP_NEGATIVEY, DDSCAPS2_CUBEMAP_POSITIVEZ, DDSCAPS2_CUBEMAP_NEGATIVEZ, DDSHeaderDXT10, FOURCC_DX10, HEADER_DXT10_LENGTH_INT, DDS_RESOURCE_MISC_TEXTURECUBE, ResourceDimension } from './typedef';
import { Surface } from './surface';
import { convertPixelFormat, PixelFormat, getImageSizeInBytes } from './pixelformat';

export class DDS {
    private constructor(
        readonly header: DDSHeader,
        readonly images: Surface[],
        readonly type: 'texture' | 'cubemap' | 'volume',
        readonly arraySize: number,
        readonly mipmapCount: number,
    ) {
    }

    public static parse(buffer: ArrayBuffer): DDS {
        const headerArray = new Int32Array(buffer, 0, HEADER_LENGTH_INT);
        if (headerArray[0] !== DDS_MAGIC) {
            throw new Error('Invalid magic number in DDS header');
        }

        const header = extractHeader(headerArray);
        if (header.ddspf.dwFlags === DDPF_FOURCC && header.ddspf.dwFourCC === FOURCC_DX10) {
            const dxt10HeaderArray = new Int32Array(buffer, HEADER_LENGTH_INT, HEADER_DXT10_LENGTH_INT);
            const dxt10Header = extractDxt10Header(dxt10HeaderArray);
            return DDS.parseDxt10(buffer, header, dxt10Header);
        }

        return DDS.parseStandard(buffer, header);
    }

    private static parseStandard(buffer: ArrayBuffer, header: DDSHeader): DDS {
        const pixelFormat = convertPixelFormat(header.ddspf);

        const cubeMap = !!(header.dwCaps2 & DDSCAPS2_CUBEMAP);
        const volume = !!(header.dwCaps2 & DDSCAPS2_VOLUME);

        if (cubeMap && volume) {
            throw new Error('Cannot set DDSCAPS2_CUBEMAP and DDSCAPS2_VOLUME at same time');
        }
        
        const mipmapCount = (header.dwCaps & DDSCAPS_MIPMAP) ? header.dwMipMapCount - 1 : 0;
        const offset = HEADER_LENGTH_INT << 2;

        let images: Surface[];
        if (cubeMap) {
            const cubeMaps: string[] = [];
            if (header.dwCaps2 & DDSCAPS2_CUBEMAP_POSITIVEX) { cubeMaps.push("X+"); }
            if (header.dwCaps2 & DDSCAPS2_CUBEMAP_NEGATIVEX) { cubeMaps.push("X-"); }
            if (header.dwCaps2 & DDSCAPS2_CUBEMAP_POSITIVEY) { cubeMaps.push("Y+"); }
            if (header.dwCaps2 & DDSCAPS2_CUBEMAP_NEGATIVEY) { cubeMaps.push("Y-"); }
            if (header.dwCaps2 & DDSCAPS2_CUBEMAP_POSITIVEZ) { cubeMaps.push("Z+"); }
            if (header.dwCaps2 & DDSCAPS2_CUBEMAP_NEGATIVEZ) { cubeMaps.push("Z-"); }

            [images] = parseCubeMap(buffer, offset, pixelFormat, header.dwWidth, header.dwHeight, cubeMaps, mipmapCount);
        } else if (volume) {
            [images] = parseVolumeTexture(buffer, offset, pixelFormat, header.dwWidth, header.dwHeight, header.dwDepth, mipmapCount);
        } else {
            [images] = parseTexture(buffer, offset, pixelFormat, header.dwWidth, header.dwHeight, mipmapCount);
        }

        return new DDS(header, images, cubeMap ? 'cubemap' : volume ? 'volume' : 'texture', 1, mipmapCount);
    }

    private static parseDxt10(buffer: ArrayBuffer, header: DDSHeader, dxt10Header: DDSHeaderDXT10): DDS {
        const pixelFormat = convertPixelFormat(header.ddspf);

        const cubeMap = !!(dxt10Header.miscFlag & DDS_RESOURCE_MISC_TEXTURECUBE);
        const volume = dxt10Header.resourceDimension === ResourceDimension.DDS_DIMENSION_TEXTURE3D;

        if (cubeMap && volume) {
            throw new Error('Cannot set DDS_RESOURCE_MISC_TEXTURECUBE and use DDS_DIMENSION_TEXTURE3D at same time');
        }

        const mipmapCount = (header.dwCaps & DDSCAPS_MIPMAP) ? header.dwMipMapCount - 1 : 0;
        let offset = (HEADER_LENGTH_INT + HEADER_DXT10_LENGTH_INT) << 2;

        const allImages: Surface[] = [];
        const cubeMaps: string[] = ["X+", "X-", "Y+", "Y-", "Z+", "Z-"];
        const arraySize = dxt10Header.arraySize;
        const height = dxt10Header.resourceDimension === ResourceDimension.DDS_DIMENSION_TEXTURE1D ? 1 : header.dwHeight;

        for (let i = 0; i < arraySize; i++) {
            let images: Surface[];
            if (cubeMap) {
                [images, offset] = parseCubeMap(buffer, offset, pixelFormat, header.dwWidth, height, cubeMaps, mipmapCount);
            } else if (volume) {
                [images, offset] = parseVolumeTexture(buffer, offset, pixelFormat, header.dwWidth, height, header.dwDepth, mipmapCount);
            } else {
                [images, offset] = parseTexture(buffer, offset, pixelFormat, header.dwWidth, height, mipmapCount);
            }

            allImages.push(...images);
        }

        return new DDS(header, allImages, cubeMap ? 'cubemap' : volume ? 'volume' : 'texture', arraySize, mipmapCount);
    }
}

function extractHeader(headerArray: Int32Array): DDSHeader {
    return {
        dwFlags: headerArray[2],
        dwHeight: headerArray[3],
        dwWidth: headerArray[4],
        dwPitchOrLinearSize: headerArray[5],
        dwDepth: headerArray[6],
        dwMipMapCount: headerArray[7],
        ddspf: {
            dwFlags: headerArray[20],
            dwFourCC: headerArray[21],
            dwRGBBitCount: headerArray[22],
            dwRBitMask: headerArray[23],
            dwGBitMask: headerArray[24],
            dwBBitMask: headerArray[25],
            dwABitMask: headerArray[26],
        },
        dwCaps: headerArray[27],
        dwCaps2: headerArray[28],
    };
}

function extractDxt10Header(dxt10HeaderArray: Int32Array): DDSHeaderDXT10 {
    return {
        dxgiFormat: dxt10HeaderArray[0],
        resourceDimension: dxt10HeaderArray[1],
        miscFlag: dxt10HeaderArray[2],
        arraySize: dxt10HeaderArray[3],
        miscFlags2: dxt10HeaderArray[4],
    };
}

function parseTexture(buffer: ArrayBuffer, offset: number, pixelFormat: PixelFormat, width: number, height: number, mipmapCount: number): [Surface[], number] {
    const result: Surface[] = [];

    offset = pushSurface(result, buffer, offset, width, height, pixelFormat, "Main image");
    for (let i = 0; i < mipmapCount; i++) {
        width = Math.max(1, Math.floor(width / 2));
        height = Math.max(1, Math.floor(height / 2));
        offset = pushSurface(result, buffer, offset, width, height, pixelFormat,`Mipmap #${i + 1}`);
    }

    return [result, offset];
}

function parseCubeMap(buffer: ArrayBuffer, offset: number, pixelFormat: PixelFormat, width: number, height: number, cubeMaps: string[], mipmapCount: number): [Surface[], number] {
    const result: Surface[] = [];

    for (const cubeMap of cubeMaps) {
        offset = pushSurface(result, buffer, offset, width, height, pixelFormat, cubeMap);
        for (let i = 0; i < mipmapCount; i++) {
            width = Math.max(1, Math.floor(width / 2));
            height = Math.max(1, Math.floor(height / 2));
            offset = pushSurface(result, buffer, offset, width, height, pixelFormat, `Mipmap of ${cubeMap} #${i + 1}`);
        }
    }

    return [result, offset];
}

function parseVolumeTexture(buffer: ArrayBuffer, offset: number, pixelFormat: PixelFormat, width: number, height: number, depth: number, mipmapCount: number): [Surface[], number] {
    const result: Surface[] = [];

    for (let i = 0; i < depth; i++) {
        offset = pushSurface(result, buffer, offset, width, height, pixelFormat, `Main image depth #${i + 1}`);
    }

    for (let i = 0; i < mipmapCount; i++) {
        width = Math.max(1, Math.floor(width / 2));
        height = Math.max(1, Math.floor(height / 2));
        depth = Math.max(1, Math.floor(depth / 2));
        for (let j = 0; j < depth; j++) {
            offset = pushSurface(result, buffer, offset, width, height, pixelFormat, `Mipmap of #${i + 1} depth #${i + 1}`);
        }
    }

    return [result, offset];
}

function pushSurface(surfaces: Surface[], buffer: ArrayBuffer, offset: number, width: number, height: number, pixelFormat: PixelFormat, name: string): number {
    const length = getImageSizeInBytes(pixelFormat, width, height);
    const end = offset + length;
    if (end > buffer.byteLength) {
        throw new Error(`Image ${name} (start ${offset}, end ${end}) exceeds buffer size ${buffer.byteLength}`);
    }

    surfaces.push(new Surface(buffer, offset, length, name, width, height, pixelFormat));
    return end;
}
