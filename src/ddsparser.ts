
const DDS_MAGIC = 0x20534444;

// The header length in 32 bit ints
const headerLengthInt = 31;

const DDS_RGBA = 0x41;
const DDS_RGB = 0x40;

export interface DDSFile {
    header: DDSHeader;
    mainSurface: DDSImage;
}

export interface DDSImage {
    offset: number;
    length: number;
    width: number;
    height: number;
    pixelSizeInByte: number;
}

export interface DDSHeader {
    dwFlags: number;
    dwHeight: number;
    dwWidth: number;
    dwPitchOrLinearSize: number;
    dwDepth: number;
    dwMipMapCount: number;
    ddspf: DDSPixelFormat;
    dwCaps: number;
    dwCaps2: number;
}

export interface DDSPixelFormat {
    dwFlags: number;
    dwFourCC: number;
    dwRGBBitCount: number;
    dwRBitMask: number;
    dwGBitMask: number;
    dwBBitMask: number;
    dwABitMask: number;
}

export function parseDds(arrayBuffer: ArrayBuffer): DDSFile {
    const headerArray = new Int32Array(arrayBuffer, 0, headerLengthInt);

    if (headerArray[0] !== DDS_MAGIC) {
        throw new Error('Invalid magic number in DDS header');
    }

    const header = extractHeader(headerArray);

    const pixelFormat = header.ddspf.dwFlags;
    if (pixelFormat !== DDS_RGB && pixelFormat !== DDS_RGBA) {
        throw new Error('Unsupported format');
    }

    const mainSurface: DDSImage = {
        offset: headerLengthInt * 4,
        length: header.dwWidth * header.dwHeight * header.ddspf.dwRGBBitCount / 8,
        width: header.dwWidth,
        height: header.dwHeight,
        pixelSizeInByte: header.ddspf.dwRGBBitCount / 8,
    };

    return {
        header,
        mainSurface,
    };
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


