import { Background } from '../../hoiformat/gui';
import { HOIPartial, parseNumberLike } from '../../hoiformat/schema';
import { NumberPosition, NumberSize } from '../common';
import { CorneredTileSprite, Sprite } from '../image/sprite';
import { calculateBBox, ParentInfo, RenderCommonOptions } from './common';

export interface RenderNodeCommonOptions extends RenderCommonOptions {
    getSprite?(sprite: string, callerType: 'bg' | 'icon', callerName: string | undefined): Promise<Sprite | undefined>;
}

export function renderSprite(position: NumberPosition, size: NumberSize, sprite: Sprite, frame: number, scale: number, options: RenderCommonOptions): string {
    if (sprite instanceof CorneredTileSprite) {
        return renderCorneredTileSprite(position, size, sprite, frame, options);
    }

    return `<div
    ${options?.id ? `id="${options.id}"` : ''}
    class="
        ${options?.classNames ? options.classNames : ''}
        ${options.styleTable.style('positionAbsolute', () => `position: absolute;`)}
        ${options.styleTable.oneTimeStyle('sprite', () => `
            left: ${position.x}px;
            top: ${position.y}px;
            width: ${sprite.width * scale}px;
            height: ${sprite.height * scale}px;
        `)}
        ${options.styleTable.style(`sprite-img-${sprite.id}-${frame}`, () => `
            background-image: url(${sprite.frames[frame]?.uri});
            background-size: ${sprite.width * scale}px ${sprite.height * scale}px;
        `)}
    "></div>`;
}

export function renderCorneredTileSprite(position: NumberPosition, size: NumberSize, sprite: CorneredTileSprite, frame: number, options: RenderCommonOptions): string {
    const sizeX = size.width;
    const sizeY = size.height;
    let borderX = sprite.borderSize.x;
    let borderY = sprite.borderSize.y;
    const xPos = borderX * 2 > sizeX ? [0, sizeX / 2, sizeX / 2, sizeX] : [0, borderX, sizeX - borderX, sizeX];
    const yPos = borderY * 2 > sizeY ? [0, sizeY / 2, sizeY / 2, sizeY] : [0, borderY, sizeY - borderY, sizeY];
    const divs: string[] = [];
    const tiles = sprite.getTiles(frame);

    for (let y = 0; y < 3; y++) {
        const height = yPos[y + 1] - yPos[y];
        if (height <= 0) {
            continue;
        }
        const top = yPos[y];
        for (let x = 0; x < 3; x++) {
            const width = xPos[x + 1] - xPos[x];
            if (width <= 0 || height <= 0) {
                continue;
            }
            const left = xPos[x];
            const tileIndex = y * 3 + x;
            const tile = tiles[tileIndex];
            divs.push(`<div
            class="
                ${options.styleTable.style('positionAbsolute', () => `position: absolute;`)}
                ${options.styleTable.oneTimeStyle('corneredtilesprite-tile', () => `
                    left: ${left}px;
                    top: ${top}px;
                    width: ${width}px;
                    height: ${height}px;
                `)}
                ${options.styleTable.style(`corneredtilesprite-img-${sprite.id}-${frame}-${x}-${y}`, () => `
                    background: url(${tile.uri});
                    background-size: ${tile.width}px ${tile.height}px;
                    background-repeat: repeat;
                    background-position: ${x === 2 ? 'right' : 'left'} ${y === 2 ? 'bottom' : 'top'};
                `)}
            "></div>
            `);
        }
    }

    return `<div
    ${options?.id ? `id="${options.id}"` : ''}
    class="
        ${options?.classNames ? options.classNames : ''}
        ${options.styleTable.style('positionAbsolute', () => `position: absolute;`)}
        ${options.styleTable.oneTimeStyle('corneredtilesprite', () => `
            left: ${position.x}px;
            top: ${position.y}px;
            width: ${size.width}px;
            height: ${size.height}px;
        `)}
    ">
        ${divs.join('')}
    </div>`;
}

export async function renderBackground(background: HOIPartial<Background> | undefined, parentInfo: ParentInfo, commonOptions: RenderNodeCommonOptions): Promise<string> {
    if (background === undefined) {
        return '';
    }

    const backgroundSpriteName = background?.spritetype ?? background?.quadtexturesprite;
    const backgroundSprite = backgroundSpriteName && commonOptions.getSprite ? await commonOptions.getSprite(backgroundSpriteName, 'bg', background?.name) : undefined;

    if (backgroundSprite === undefined) {
        return '';
    }

    const [x, y, width, height] = calculateBBox({
        position: background.position,
        size: { width: parseNumberLike('100%%'), height: parseNumberLike('100%%') }
    }, parentInfo);
    
    return renderSprite({ x, y }, { width, height }, backgroundSprite, 0, 1, commonOptions);
}
