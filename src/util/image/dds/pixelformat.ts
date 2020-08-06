import { DDSPixelFormat, DDSHeaderDXT10, DDPF_FOURCC, FOURCC_DX10, FOURCC_DXT1, FOURCC_DXT2, FOURCC_DXT3, FOURCC_DXT4, FOURCC_DXT5, DDPF_RGB, DDPF_ALPHA_CHANNEL, DDPF_LUMINANCE, DDPF_ALPHA, DDPF_YUV, DxgiFormat } from "./typedef";
import { UserError } from '../../common';

export const PIXEL_VALUE_TYPE_SIGNED = 0x1;
export const PIXEL_VALUE_TYPE_NORM = 0x2;
export const PIXEL_VALUE_TYPE_SRGB = 0x4;

export enum PixelValueType {
    typeless = 0,
    float = 0x10,
    uint = 0x20,
    unorm = 0x22,
    unorm_srgb = 0x26,
    sint = 0x21,
    snorm = 0x23,
    shardedexp = 0x30,
}

export enum CompressFormat {
    bc1 = 1,
    bc2,
    bc3,
    bc4,
    bc5,
    bc6h,
    bc7,
}

export const CHANNEL_FORMAT_ALPHA = 0x1;
export const CHANNEL_FORMAT_TYPE_MASK = 0xFE;

export enum ChannelFormat {
    rgb = 0,
    rgba = 1,
    yuv = 2,
    yuva = 3,
    l = 4,
    la = 5,
    a = 7,
    rg = 8,
    r = 10,
    g = 12,
    d = 14,
    ycbcr = 16,
    ycbcra = 18,
}

export interface PixelFormatBase {
    compressed: boolean;
    valueType: PixelValueType;
}

export interface CompressedPixelFormat extends PixelFormatBase {
    compressed: true;
    compressFormat: CompressFormat;
}

export interface RawPixelFormat extends PixelFormatBase {
    compressed: false;
    bitsPerPixel: number;
    channelCount: number;
    channelOrderInPixel: number[];
    channelStartInPixel: number[];
    channelLengthInPixel: number[];
    channelFormat: ChannelFormat;
}

export type PixelFormat = CompressedPixelFormat | RawPixelFormat;

export function convertPixelFormat(ddsPixelFormat: DDSPixelFormat, dxt10Header?: DDSHeaderDXT10): PixelFormat {
    if (ddsPixelFormat.dwFlags & DDPF_FOURCC) {
        if (ddsPixelFormat.dwFourCC === FOURCC_DX10) {
            if (!dxt10Header) {
                throw new UserError("dxt10Header should be provided when fourCC is DX10");
            }
            return convertDx10PixelFormat(dxt10Header);
        } else {
            return convertFourCCPixelFormat(ddsPixelFormat.dwFourCC);
        }
    }

    return convertNormalPixelFormat(ddsPixelFormat);
}

export function getImageSizeInBytes(pixelFormat: PixelFormat, width: number, height: number): number {
    if (pixelFormat.compressed) {
        return Math.max(1, (width + 3) >> 2) * Math.max(1, (height + 3) >> 2) * getBlockSize(pixelFormat.compressFormat);

    } else {
        const bytesInARow = (pixelFormat.bitsPerPixel * width + 7) >>> 3;
        return bytesInARow * height;
    }
}

export function getBlockSize(compressFormat: CompressFormat): number {
    return compressFormat === CompressFormat.bc1 || compressFormat === CompressFormat.bc4 ? 8 : 16;
}

export function pixelFormatToString(pixelFormat: PixelFormat): string {
    if (pixelFormat.compressed) {
        return `Compressed BC${pixelFormat.compressFormat} ${PixelValueType[pixelFormat.valueType]}`;
    } else {
        const channelNames = ChannelFormat[pixelFormat.channelFormat].toUpperCase();
        let name = '';
        for (let i = pixelFormat.channelCount - 1; i >= 0; i--) {
            const channelIndex = pixelFormat.channelOrderInPixel[i];
            name += channelNames[channelIndex] + pixelFormat.channelLengthInPixel[channelIndex];
        }

        return `Raw ${pixelFormat.bitsPerPixel}bits ${name} ${PixelValueType[pixelFormat.valueType]}`;
    }
}

function convertFourCCPixelFormat(fourCC: number): PixelFormat {
    let compressFormat: CompressFormat;
    switch (fourCC) {
        case FOURCC_DXT1: compressFormat = CompressFormat.bc1; break;
        case FOURCC_DXT2:
        case FOURCC_DXT3: compressFormat = CompressFormat.bc2; break;
        case FOURCC_DXT4:
        case FOURCC_DXT5: compressFormat = CompressFormat.bc3; break;
        default: throw new UserError("fourCC value not supported: " + fourCC);
    }

    return {
        compressed: true,
        valueType: PixelValueType.uint,
        compressFormat,
    };
}

function convertDx10PixelFormat(dxt10Header: DDSHeaderDXT10): PixelFormat {
    const format = getDxgiFormatMap()[dxt10Header.dxgiFormat];
    if (format) {
        return format;
    }

    throw new UserError(`Not supported DXGI format ${DxgiFormat[dxt10Header.dxgiFormat]} (${dxt10Header.dxgiFormat})`);
}

function convertNormalPixelFormat(ddsPixelFormat: DDSPixelFormat) : PixelFormat {
    const pfflags = ddsPixelFormat.dwFlags;
    let channelFormat: ChannelFormat;
    const channelIdStartLength: [number, number, number][] = [];

    if (pfflags & DDPF_ALPHA_CHANNEL) {
        channelFormat = ChannelFormat.a;
        channelIdStartLength.push(getStartLengthByMask(0, ddsPixelFormat.dwABitMask));

    } else if (pfflags & DDPF_LUMINANCE) {
        channelFormat = ChannelFormat.l;
        channelIdStartLength.push(getStartLengthByMask(0, ddsPixelFormat.dwRBitMask));

        if (pfflags & DDPF_ALPHA) {
            channelIdStartLength.push(getStartLengthByMask(1, ddsPixelFormat.dwABitMask));
            channelFormat = ChannelFormat.la;
        }

    } else if (pfflags & DDPF_YUV) {
        channelFormat = ChannelFormat.yuv;
        channelIdStartLength.push(getStartLengthByMask(0, ddsPixelFormat.dwRBitMask));
        channelIdStartLength.push(getStartLengthByMask(1, ddsPixelFormat.dwGBitMask));
        channelIdStartLength.push(getStartLengthByMask(2, ddsPixelFormat.dwBBitMask));

        if (pfflags & DDPF_ALPHA) {
            channelIdStartLength.push(getStartLengthByMask(3, ddsPixelFormat.dwABitMask));
            channelFormat = ChannelFormat.yuva;
        }

    } else if (pfflags & DDPF_RGB) {
        channelFormat = ChannelFormat.rgb;
        channelIdStartLength.push(getStartLengthByMask(0, ddsPixelFormat.dwRBitMask));
        channelIdStartLength.push(getStartLengthByMask(1, ddsPixelFormat.dwGBitMask));
        channelIdStartLength.push(getStartLengthByMask(2, ddsPixelFormat.dwBBitMask));

        if (pfflags & DDPF_ALPHA) {
            channelIdStartLength.push(getStartLengthByMask(3, ddsPixelFormat.dwABitMask));
            channelFormat = ChannelFormat.rgba;
        }

    } else {
        throw new UserError("Unknown pixel format flags " + pfflags);
    }

    const bitsPerPixel = ddsPixelFormat.dwRGBBitCount;

    return rawPixelFormat(channelFormat, PixelValueType.uint, bitsPerPixel, channelIdStartLength.map(v => v[1]), channelIdStartLength.map(v => v[2]));
}

function getStartLengthByMask(id: number, mask: number): [number, number, number] {
    const start = tail0count(mask);
    if (all1Count((mask >>> start) + 1) > 1) {
        throw new UserError("Not valid mask: " + mask);
    }
    return [ id, start, all1Count(mask) ];
}

function tail0count(v: number): number {
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

const formatToChannelCount: Record<ChannelFormat, number> = {
    [ChannelFormat.rgb]: 3,
    [ChannelFormat.rgba]: 4,
    [ChannelFormat.yuv]: 3,
    [ChannelFormat.yuva]: 4,
    [ChannelFormat.l]: 1,
    [ChannelFormat.la]: 2,
    [ChannelFormat.a]: 1,
    [ChannelFormat.rg]: 2,
    [ChannelFormat.r]: 1,
    [ChannelFormat.g]: 1,
    [ChannelFormat.d]: 1,
    [ChannelFormat.ycbcr]: 3,
    [ChannelFormat.ycbcra]: 4,
};

function rawPixelFormat(format: ChannelFormat, valueType: PixelValueType, bitsPerPixel: number, channelStartInPixel: number[], channelLengthInPixel: number[]): RawPixelFormat {
    const channelIdStartLength: [number, number, number][] = channelStartInPixel.map((v, i) => [i, v, channelLengthInPixel[i]]);
    channelIdStartLength.sort((a, b) => a[1] - b[1]);
    
    if (!channelIdStartLength.every((v, i, a) => i === a.length - 1 ? v[1] + v[2] <= bitsPerPixel : v[1] + v[2] === a[i + 1][1])) {
        throw new UserError("Masks not compact: " + channelIdStartLength.map(v => ((1 << v[1]) - 1) << v[0]));
    }

    return {
        compressed: false,
        channelFormat: format,
        channelCount: formatToChannelCount[format],
        bitsPerPixel,
        channelOrderInPixel: channelIdStartLength.map(v => v[0]),
        channelStartInPixel,
        channelLengthInPixel,
        valueType,
    };
}

function compressedPixelFormat(format: CompressFormat, valueType: PixelValueType): CompressedPixelFormat {
    return {
        compressed: true,
        compressFormat: format,
        valueType,
    };
}

let dxgiFormatMap: Partial<Record<DxgiFormat, PixelFormat>> | undefined = undefined;
function getDxgiFormatMap(): Partial<Record<DxgiFormat, PixelFormat>> {
    if (dxgiFormatMap) {
        return dxgiFormatMap;
    }

    dxgiFormatMap = {
        [DxgiFormat.DXGI_FORMAT_R32G32B32A32_TYPELESS]: rawPixelFormat(ChannelFormat.rgba, PixelValueType.typeless, 128, [0, 32, 64, 96], [32, 32, 32, 32]),
        [DxgiFormat.DXGI_FORMAT_R32G32B32A32_FLOAT]: rawPixelFormat(ChannelFormat.rgba, PixelValueType.float, 128, [0, 32, 64, 96], [32, 32, 32, 32]),
        [DxgiFormat.DXGI_FORMAT_R32G32B32A32_UINT]: rawPixelFormat(ChannelFormat.rgba, PixelValueType.uint, 128, [0, 32, 64, 96], [32, 32, 32, 32]),
        [DxgiFormat.DXGI_FORMAT_R32G32B32A32_SINT]: rawPixelFormat(ChannelFormat.rgba, PixelValueType.sint, 128, [0, 32, 64, 96], [32, 32, 32, 32]),
        [DxgiFormat.DXGI_FORMAT_R32G32B32_TYPELESS]: rawPixelFormat(ChannelFormat.rgb, PixelValueType.typeless, 96, [0, 32, 64], [32, 32, 32]),
        [DxgiFormat.DXGI_FORMAT_R32G32B32_FLOAT]: rawPixelFormat(ChannelFormat.rgb, PixelValueType.float, 96, [0, 32, 64], [32, 32, 32]),
        [DxgiFormat.DXGI_FORMAT_R32G32B32_UINT]: rawPixelFormat(ChannelFormat.rgb, PixelValueType.uint, 96, [0, 32, 64], [32, 32, 32]),
        [DxgiFormat.DXGI_FORMAT_R32G32B32_SINT]: rawPixelFormat(ChannelFormat.rgb, PixelValueType.sint, 96, [0, 32, 64], [32, 32, 32]),
        [DxgiFormat.DXGI_FORMAT_R16G16B16A16_TYPELESS]: rawPixelFormat(ChannelFormat.rgba, PixelValueType.typeless, 64, [0, 16, 32, 48], [16, 16, 16, 16]),
        [DxgiFormat.DXGI_FORMAT_R16G16B16A16_FLOAT]: rawPixelFormat(ChannelFormat.rgba, PixelValueType.float, 64, [0, 16, 32, 48], [16, 16, 16, 16]),
        [DxgiFormat.DXGI_FORMAT_R16G16B16A16_UNORM]: rawPixelFormat(ChannelFormat.rgba, PixelValueType.unorm, 64, [0, 16, 32, 48], [16, 16, 16, 16]),
        [DxgiFormat.DXGI_FORMAT_R16G16B16A16_UINT]: rawPixelFormat(ChannelFormat.rgba, PixelValueType.uint, 64, [0, 16, 32, 48], [16, 16, 16, 16]),
        [DxgiFormat.DXGI_FORMAT_R16G16B16A16_SNORM]: rawPixelFormat(ChannelFormat.rgba, PixelValueType.snorm, 64, [0, 16, 32, 48], [16, 16, 16, 16]),
        [DxgiFormat.DXGI_FORMAT_R16G16B16A16_SINT]: rawPixelFormat(ChannelFormat.rgba, PixelValueType.sint, 64, [0, 16, 32, 48], [16, 16, 16, 16]),
        [DxgiFormat.DXGI_FORMAT_R32G32_TYPELESS]: rawPixelFormat(ChannelFormat.rg, PixelValueType.typeless, 64, [0, 32], [32, 32]),
        [DxgiFormat.DXGI_FORMAT_R32G32_FLOAT]: rawPixelFormat(ChannelFormat.rg, PixelValueType.float, 64, [0, 32], [32, 32]),
        [DxgiFormat.DXGI_FORMAT_R32G32_UINT]: rawPixelFormat(ChannelFormat.rg, PixelValueType.uint, 64, [0, 32], [32, 32]),
        [DxgiFormat.DXGI_FORMAT_R32G32_SINT]: rawPixelFormat(ChannelFormat.rg, PixelValueType.sint, 64, [0, 32], [32, 32]),
        [DxgiFormat.DXGI_FORMAT_R32G8X24_TYPELESS]: rawPixelFormat(ChannelFormat.rg, PixelValueType.typeless, 64, [0, 32], [32, 8]),
    //    [DxgiFormat.DXGI_FORMAT_D32_FLOAT_S8X24_UINT]: rawPixelFormat(), // not supported because we can't mix two types yet
        [DxgiFormat.DXGI_FORMAT_R32_FLOAT_X8X24_TYPELESS]: rawPixelFormat(ChannelFormat.r, PixelValueType.float, 64, [0], [32]),
    //    [DxgiFormat.DXGI_FORMAT_X32_TYPELESS_G8X24_UINT]: rawPixelFormat(), // not supported because first component doesn't start at 0
        [DxgiFormat.DXGI_FORMAT_R10G10B10A2_TYPELESS]: rawPixelFormat(ChannelFormat.rgba, PixelValueType.typeless, 32, [0, 10, 20, 30], [10, 10, 10, 2]),
        [DxgiFormat.DXGI_FORMAT_R10G10B10A2_UNORM]: rawPixelFormat(ChannelFormat.rgba, PixelValueType.unorm, 32, [0, 10, 20, 30], [10, 10, 10, 2]),
        [DxgiFormat.DXGI_FORMAT_R10G10B10A2_UINT]: rawPixelFormat(ChannelFormat.rgba, PixelValueType.uint, 32, [0, 10, 20, 30], [10, 10, 10, 2]),
    //    [DxgiFormat.DXGI_FORMAT_R11G11B10_FLOAT]: rawPixelFormat(), // not supported because js can't read 10 or 11bits float
        [DxgiFormat.DXGI_FORMAT_R8G8B8A8_TYPELESS]: rawPixelFormat(ChannelFormat.rgba, PixelValueType.typeless, 32, [0, 8, 16, 24], [8, 8, 8, 8]),
        [DxgiFormat.DXGI_FORMAT_R8G8B8A8_UNORM]: rawPixelFormat(ChannelFormat.rgba, PixelValueType.unorm, 32, [0, 8, 16, 24], [8, 8, 8, 8]),
        [DxgiFormat.DXGI_FORMAT_R8G8B8A8_UNORM_SRGB]: rawPixelFormat(ChannelFormat.rgba, PixelValueType.unorm_srgb, 32, [0, 8, 16, 24], [8, 8, 8, 8]),
        [DxgiFormat.DXGI_FORMAT_R8G8B8A8_UINT]: rawPixelFormat(ChannelFormat.rgba, PixelValueType.uint, 32, [0, 8, 16, 24], [8, 8, 8, 8]),
        [DxgiFormat.DXGI_FORMAT_R8G8B8A8_SNORM]: rawPixelFormat(ChannelFormat.rgba, PixelValueType.snorm, 32, [0, 8, 16, 24], [8, 8, 8, 8]),
        [DxgiFormat.DXGI_FORMAT_R8G8B8A8_SINT]: rawPixelFormat(ChannelFormat.rgba, PixelValueType.sint, 32, [0, 8, 16, 24], [8, 8, 8, 8]),
        [DxgiFormat.DXGI_FORMAT_R16G16_TYPELESS]: rawPixelFormat(ChannelFormat.rg, PixelValueType.typeless, 32, [0, 16], [16, 16]),
        [DxgiFormat.DXGI_FORMAT_R16G16_FLOAT]: rawPixelFormat(ChannelFormat.rg, PixelValueType.float, 32, [0, 16], [16, 16]),
        [DxgiFormat.DXGI_FORMAT_R16G16_UNORM]: rawPixelFormat(ChannelFormat.rg, PixelValueType.unorm, 32, [0, 16], [16, 16]),
        [DxgiFormat.DXGI_FORMAT_R16G16_UINT]: rawPixelFormat(ChannelFormat.rg, PixelValueType.uint, 32, [0, 16], [16, 16]),
        [DxgiFormat.DXGI_FORMAT_R16G16_SNORM]: rawPixelFormat(ChannelFormat.rg, PixelValueType.snorm, 32, [0, 16], [16, 16]),
        [DxgiFormat.DXGI_FORMAT_R16G16_SINT]: rawPixelFormat(ChannelFormat.rg, PixelValueType.sint, 32, [0, 16], [16, 16]),
        [DxgiFormat.DXGI_FORMAT_R32_TYPELESS]: rawPixelFormat(ChannelFormat.r, PixelValueType.typeless, 32, [0], [32]),
        [DxgiFormat.DXGI_FORMAT_D32_FLOAT]: rawPixelFormat(ChannelFormat.d, PixelValueType.float, 32, [0], [32]),
        [DxgiFormat.DXGI_FORMAT_R32_FLOAT]: rawPixelFormat(ChannelFormat.r, PixelValueType.float, 32, [0], [32]),
        [DxgiFormat.DXGI_FORMAT_R32_UINT]: rawPixelFormat(ChannelFormat.r, PixelValueType.uint, 32, [0], [32]),
        [DxgiFormat.DXGI_FORMAT_R32_SINT]: rawPixelFormat(ChannelFormat.r, PixelValueType.sint, 32, [0], [32]),
        [DxgiFormat.DXGI_FORMAT_R24G8_TYPELESS]: rawPixelFormat(ChannelFormat.rg, PixelValueType.typeless, 32, [0, 24], [24, 8]),
    //    [DxgiFormat.DXGI_FORMAT_D24_UNORM_S8_UINT]: rawPixelFormat(), // not supported because we can't mix two types yet
        [DxgiFormat.DXGI_FORMAT_R24_UNORM_X8_TYPELESS]: rawPixelFormat(ChannelFormat.r, PixelValueType.unorm, 32, [0], [24]),
    //    [DxgiFormat.DXGI_FORMAT_X24_TYPELESS_G8_UINT]: rawPixelFormat(), // not supported because first component doesn't start at 0
        [DxgiFormat.DXGI_FORMAT_R8G8_TYPELESS]: rawPixelFormat(ChannelFormat.rg, PixelValueType.typeless, 16, [0, 8], [8, 8]),
        [DxgiFormat.DXGI_FORMAT_R8G8_UNORM]: rawPixelFormat(ChannelFormat.rg, PixelValueType.unorm, 16, [0, 8], [8, 8]),
        [DxgiFormat.DXGI_FORMAT_R8G8_UINT]: rawPixelFormat(ChannelFormat.rg, PixelValueType.uint, 16, [0, 8], [8, 8]),
        [DxgiFormat.DXGI_FORMAT_R8G8_SNORM]: rawPixelFormat(ChannelFormat.rg, PixelValueType.snorm, 16, [0, 8], [8, 8]),
        [DxgiFormat.DXGI_FORMAT_R8G8_SINT]: rawPixelFormat(ChannelFormat.rg, PixelValueType.sint, 16, [0, 8], [8, 8]),
        [DxgiFormat.DXGI_FORMAT_R16_TYPELESS]: rawPixelFormat(ChannelFormat.r, PixelValueType.typeless, 16, [0], [16]),
        [DxgiFormat.DXGI_FORMAT_R16_FLOAT]: rawPixelFormat(ChannelFormat.r, PixelValueType.float, 16, [0], [16]),
        [DxgiFormat.DXGI_FORMAT_D16_UNORM]: rawPixelFormat(ChannelFormat.d, PixelValueType.unorm, 16, [0], [16]),
        [DxgiFormat.DXGI_FORMAT_R16_UNORM]: rawPixelFormat(ChannelFormat.r, PixelValueType.unorm, 16, [0], [16]),
        [DxgiFormat.DXGI_FORMAT_R16_UINT]: rawPixelFormat(ChannelFormat.r, PixelValueType.uint, 16, [0], [16]),
        [DxgiFormat.DXGI_FORMAT_R16_SNORM]: rawPixelFormat(ChannelFormat.r, PixelValueType.snorm, 16, [0], [16]),
        [DxgiFormat.DXGI_FORMAT_R16_SINT]: rawPixelFormat(ChannelFormat.r, PixelValueType.sint, 16, [0], [16]),
        [DxgiFormat.DXGI_FORMAT_R8_TYPELESS]: rawPixelFormat(ChannelFormat.r, PixelValueType.typeless, 8, [0], [8]),
        [DxgiFormat.DXGI_FORMAT_R8_UNORM]: rawPixelFormat(ChannelFormat.r, PixelValueType.unorm, 8, [0], [8]),
        [DxgiFormat.DXGI_FORMAT_R8_UINT]: rawPixelFormat(ChannelFormat.r, PixelValueType.uint, 8, [0], [8]),
        [DxgiFormat.DXGI_FORMAT_R8_SNORM]: rawPixelFormat(ChannelFormat.r, PixelValueType.snorm, 8, [0], [8]),
        [DxgiFormat.DXGI_FORMAT_R8_SINT]: rawPixelFormat(ChannelFormat.r, PixelValueType.sint, 8, [0], [8]),
        [DxgiFormat.DXGI_FORMAT_A8_UNORM]: rawPixelFormat(ChannelFormat.a, PixelValueType.unorm, 8, [0], [8]),
        [DxgiFormat.DXGI_FORMAT_R1_UNORM]: rawPixelFormat(ChannelFormat.r, PixelValueType.typeless, 1, [0], [1]),
    //    [DxgiFormat.DXGI_FORMAT_R9G9B9E5_SHAREDEXP]: rawPixelFormat(),  // not supported because we don't have rgbe
    //    [DxgiFormat.DXGI_FORMAT_R8G8_B8G8_UNORM]: rawPixelFormat(),   // not support packed pixels
    //    [DxgiFormat.DXGI_FORMAT_G8R8_G8B8_UNORM]: rawPixelFormat(),   // not support packed pixels
        [DxgiFormat.DXGI_FORMAT_BC1_TYPELESS]: compressedPixelFormat(CompressFormat.bc1, PixelValueType.typeless),
        [DxgiFormat.DXGI_FORMAT_BC1_UNORM]: compressedPixelFormat(CompressFormat.bc1, PixelValueType.unorm),
        [DxgiFormat.DXGI_FORMAT_BC1_UNORM_SRGB]: compressedPixelFormat(CompressFormat.bc1, PixelValueType.unorm_srgb),
        [DxgiFormat.DXGI_FORMAT_BC2_TYPELESS]: compressedPixelFormat(CompressFormat.bc2, PixelValueType.typeless),
        [DxgiFormat.DXGI_FORMAT_BC2_UNORM]: compressedPixelFormat(CompressFormat.bc2, PixelValueType.unorm),
        [DxgiFormat.DXGI_FORMAT_BC2_UNORM_SRGB]: compressedPixelFormat(CompressFormat.bc2, PixelValueType.unorm_srgb),
        [DxgiFormat.DXGI_FORMAT_BC3_TYPELESS]: compressedPixelFormat(CompressFormat.bc3, PixelValueType.typeless),
        [DxgiFormat.DXGI_FORMAT_BC3_UNORM]: compressedPixelFormat(CompressFormat.bc3, PixelValueType.unorm),
        [DxgiFormat.DXGI_FORMAT_BC3_UNORM_SRGB]: compressedPixelFormat(CompressFormat.bc3, PixelValueType.unorm_srgb),
        [DxgiFormat.DXGI_FORMAT_BC4_TYPELESS]: compressedPixelFormat(CompressFormat.bc4, PixelValueType.typeless),
        [DxgiFormat.DXGI_FORMAT_BC4_UNORM]: compressedPixelFormat(CompressFormat.bc4, PixelValueType.unorm),
        [DxgiFormat.DXGI_FORMAT_BC4_SNORM]: compressedPixelFormat(CompressFormat.bc4, PixelValueType.snorm),
        [DxgiFormat.DXGI_FORMAT_BC5_TYPELESS]: compressedPixelFormat(CompressFormat.bc5, PixelValueType.typeless),
        [DxgiFormat.DXGI_FORMAT_BC5_UNORM]: compressedPixelFormat(CompressFormat.bc5, PixelValueType.unorm),
        [DxgiFormat.DXGI_FORMAT_BC5_SNORM]: compressedPixelFormat(CompressFormat.bc5, PixelValueType.snorm),
        [DxgiFormat.DXGI_FORMAT_B5G6R5_UNORM]: rawPixelFormat(ChannelFormat.rgb, PixelValueType.unorm, 16, [11, 5, 0], [5, 6, 5]),
        [DxgiFormat.DXGI_FORMAT_B5G5R5A1_UNORM]: rawPixelFormat(ChannelFormat.rgba, PixelValueType.unorm, 16, [10, 5, 0, 15], [5, 5, 5, 1]),
        [DxgiFormat.DXGI_FORMAT_B8G8R8A8_UNORM]: rawPixelFormat(ChannelFormat.rgba, PixelValueType.unorm, 32, [16, 8, 0, 24], [8, 8, 8, 8]),
        [DxgiFormat.DXGI_FORMAT_B8G8R8X8_UNORM]: rawPixelFormat(ChannelFormat.rgb, PixelValueType.unorm, 32, [16, 8, 0], [8, 8, 8]),
    //    [DxgiFormat.DXGI_FORMAT_R10G10B10_XR_BIAS_A2_UNORM]: rawPixelFormat(), // not supported because we can't mix two types yet
        [DxgiFormat.DXGI_FORMAT_B8G8R8A8_TYPELESS]: rawPixelFormat(ChannelFormat.rgba, PixelValueType.typeless, 32, [16, 8, 0, 24], [8, 8, 8, 8]),
        [DxgiFormat.DXGI_FORMAT_B8G8R8A8_UNORM_SRGB]: rawPixelFormat(ChannelFormat.rgba, PixelValueType.unorm, 32, [16, 8, 0, 24], [8, 8, 8, 8]),
        [DxgiFormat.DXGI_FORMAT_B8G8R8X8_TYPELESS]: rawPixelFormat(ChannelFormat.rgb, PixelValueType.typeless, 32, [16, 8, 0], [8, 8, 8]),
        [DxgiFormat.DXGI_FORMAT_B8G8R8X8_UNORM_SRGB]: rawPixelFormat(ChannelFormat.rgb, PixelValueType.unorm, 32, [16, 8, 0], [8, 8, 8]),
        [DxgiFormat.DXGI_FORMAT_BC6H_TYPELESS]: compressedPixelFormat(CompressFormat.bc6h, PixelValueType.typeless),
    //    [DxgiFormat.DXGI_FORMAT_BC6H_UF16]: compressedPixelFormat(),
    //    [DxgiFormat.DXGI_FORMAT_BC6H_SF16]: compressedPixelFormat(), 
        [DxgiFormat.DXGI_FORMAT_BC7_TYPELESS]: compressedPixelFormat(CompressFormat.bc7, PixelValueType.typeless),
        [DxgiFormat.DXGI_FORMAT_BC7_UNORM]: compressedPixelFormat(CompressFormat.bc6h, PixelValueType.unorm),
        [DxgiFormat.DXGI_FORMAT_BC7_UNORM_SRGB]: compressedPixelFormat(CompressFormat.bc6h, PixelValueType.unorm_srgb),
        [DxgiFormat.DXGI_FORMAT_AYUV]: rawPixelFormat(ChannelFormat.yuva, PixelValueType.typeless, 32, [16, 8, 0, 24], [8, 8, 8, 8]),
    //    [DxgiFormat.DXGI_FORMAT_Y410]: rawPixelFormat(),
    //    [DxgiFormat.DXGI_FORMAT_Y416]: rawPixelFormat(),
    //    [DxgiFormat.DXGI_FORMAT_NV12]: rawPixelFormat(),
    //    [DxgiFormat.DXGI_FORMAT_P010]: rawPixelFormat(),
    //    [DxgiFormat.DXGI_FORMAT_P016]: rawPixelFormat(),
    //    [DxgiFormat.DXGI_FORMAT_420_OPAQUE]: rawPixelFormat(),
    //    [DxgiFormat.DXGI_FORMAT_YUY2]: rawPixelFormat(),
    //    [DxgiFormat.DXGI_FORMAT_Y210]: rawPixelFormat(),
    //    [DxgiFormat.DXGI_FORMAT_Y216]: rawPixelFormat(),
    //    [DxgiFormat.DXGI_FORMAT_NV11]: rawPixelFormat(),
    //    [DxgiFormat.DXGI_FORMAT_AI44]: rawPixelFormat(),
    //    [DxgiFormat.DXGI_FORMAT_IA44]: rawPixelFormat(),
    //    [DxgiFormat.DXGI_FORMAT_P8]: rawPixelFormat(),
    //    [DxgiFormat.DXGI_FORMAT_A8P8]: rawPixelFormat(),
        [DxgiFormat.DXGI_FORMAT_B4G4R4A4_UNORM]: rawPixelFormat(ChannelFormat.rgba, PixelValueType.typeless, 16, [8, 4, 0, 12], [4, 4, 4, 4]),

    //    [DxgiFormat.DXGI_FORMAT_P208]: rawPixelFormat(),
    //    [DxgiFormat.DXGI_FORMAT_V208]: rawPixelFormat(),
    //    [DxgiFormat.DXGI_FORMAT_V408]: rawPixelFormat(),
    };

    return dxgiFormatMap;
}