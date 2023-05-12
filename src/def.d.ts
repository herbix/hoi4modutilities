declare module 'vscode' {
    namespace workspace {
        export function getConfiguration(section: 'hoi4ModUtilities'): WorkspaceConfiguration & {
            readonly installPath: string;
            readonly loadDlcContents: boolean;
            readonly modFile: string;
            readonly featureFlags: string[];
            readonly enableSupplyArea: boolean;
        };
    }
}

declare module '*.html' {
    const _default: string;
    export default _default;
}

declare module '*.css' {
    const _default: string;
    export default _default;
}

declare const VERSION: string;
declare const EXTENSION_ID: string;
declare const IS_WEB_EXT: boolean;

declare module 'tga' {
    class TGA {
        constructor(buffer: Buffer, opt?: unknown);
        static createTgaBuffer(width: number, height: number, pixels: [], dontFlipY: boolean): Buffer;
        static getHeader(buffer: Buffer): unknown;
        parse(): void;
        readHeader(): unknown;
        check(): boolean;
        addPixel(arr: number[], offset: number, idx: number): void;
        readPixels(): void;
        width: number;
        height: number;
        pixels: Uint8Array | undefined;
    }
    export = TGA;
}
