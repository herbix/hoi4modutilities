import { PNG } from "pngjs";
import { NumberPosition } from "../common";

export class Image {
    private cachedUri: string | undefined = undefined;
    constructor(
        readonly pngBuffer: Buffer,
        readonly width: number,
        readonly height: number,
        readonly path: string) {
    }

    public get uri(): string {
        if (this.cachedUri) {
            return this.cachedUri;
        }

        return this.cachedUri = toDataUrl(this.pngBuffer);
    }
}

export class Sprite {
    private cachedFrames: Image[] | undefined = undefined;
    constructor(
        readonly image: Image,
        readonly noOfFrames: number) {
    }

    public get frames(): Image[] {
        if (this.cachedFrames) {
            return this.cachedFrames;
        }

        if (this.noOfFrames === 1) {
            return this.cachedFrames = [ this.image ];
        }

        const png = pngRead(this.image.pngBuffer);
        const frameWidth = this.width;
        const framePng = new PNG({ width: frameWidth, height: png.height });
        const result: Image[] = [];
        const path = this.image.path;

        for (var i = 0; i < this.noOfFrames; i++) {
            png.bitblt(framePng, i * frameWidth, 0, frameWidth, png.height, 0, 0);
            result.push(new Image(PNG.sync.write(framePng), frameWidth, png.height, path));
        }

        return this.cachedFrames = result;
    }

    public get width(): number {
        return this.image.width / this.noOfFrames;
    }

    public get height(): number {
        return this.image.height;
    }
}

export class CorneredTileSprite extends Sprite {
    private cachedTiles: Record<number, Image[]> = {};

    constructor(
        image: Image,
        noOfFrames: number,
        readonly size: NumberPosition,
        readonly borderSize: NumberPosition) {
        super(image, noOfFrames);
    }

    public getTiles(frameId: number = 0): Image[] {
        if (frameId > this.noOfFrames) {
            frameId = 0;
        }

        const cached = this.cachedTiles[frameId];
        if (cached) {
            return cached;
        }

        const frame = this.frames[frameId];
        const sizeX = this.size.x;
        const sizeY = this.size.y;
        const backPng = new PNG({ width: sizeX, height: sizeY });
        const framePng = pngRead(frame.pngBuffer);
        framePng.bitblt(backPng, 0, 0, framePng.width, framePng.height, 0, 0);

        let borderX = this.borderSize.x;
        let borderY = this.borderSize.y;
        if (borderX * 2 >= sizeX) {
            borderX = Math.max(0, Math.floor(sizeX / 2 - 1));
        }
        if (borderY * 2 >= sizeY) {
            borderY = Math.max(0, Math.floor(sizeY / 2 - 1));
        }

        const path = this.image.path;
        const xPos = [0, borderX, sizeX - borderX, sizeX];
        const yPos = [0, borderY, sizeY - borderY, sizeY];
        const tiles: Image[] = [];
        for (let y = 0; y < 3; y++) {
            for (let x = 0; x < 3; x++) {
                tiles.push(extractImageFromPng(backPng, xPos[x], yPos[y], xPos[x + 1] - xPos[x], yPos[y + 1] - yPos[y], path));
            }
        }

        this.cachedTiles[frameId] = tiles;
        return tiles;
    }
}

function toDataUrl(buffer: Buffer): string {
    return 'data:image/png;base64,' + buffer.toString('base64');
}

function extractImageFromPng(png: PNG, x: number, y: number, w: number, h: number, path: string): Image {
    const resultPng = new PNG({ width: w, height: h });
    png.bitblt(resultPng, x, y, w, h, 0, 0);
    return new Image(PNG.sync.write(resultPng), w, h, path);
}

function pngRead(buffer: Buffer): PNG {
    const result = PNG.sync.read(buffer);
    Object.setPrototypeOf(result, PNG.prototype);
    return result;
}
