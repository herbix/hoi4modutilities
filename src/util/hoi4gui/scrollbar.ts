import { ButtonType, ExtendedScrollbarType, ScrollbarType } from '../../hoiformat/gui';
import { HOIPartial, toNumberLike, toStringAsSymbolIgnoreCase } from '../../hoiformat/schema';
import { renderButton } from './button';
import { calculateBBox, ParentInfo, removeHtmlOptions } from './common';
import { renderBackground, RenderNodeCommonOptions } from './nodecommon';

export interface RenderScrollbarOptions extends RenderNodeCommonOptions {
}

type Scrollbar = HOIPartial<ScrollbarType> | HOIPartial<ExtendedScrollbarType>;

export async function renderScrollbar(scrollbar: HOIPartial<ScrollbarType>, parentInfo: ParentInfo, options: RenderScrollbarOptions): Promise<string> {
    return await renderScrollbarCommon(scrollbar, parentInfo, options, async myInfo => {
        const buttonsByName = new Map(scrollbar.guibuttontype
            .filter(button => button.name !== undefined)
            .map(button => [button.name as string, button]));
        const buttons = scrollbar.guibuttontype.map(button => normalizeScrollbarButton(button, buttonsByName, myInfo, scrollbar.horizontal));
        return { background: '', buttons: await renderButtons(buttons, myInfo, options) };
    });
}

export async function renderExtendedScrollbar(scrollbar: HOIPartial<ExtendedScrollbarType>, parentInfo: ParentInfo, options: RenderScrollbarOptions): Promise<string> {
    return await renderScrollbarCommon(scrollbar, parentInfo, options, async myInfo => {
        const buttons = [
            ...scrollbar.guibuttontype,
            scrollbar.slider,
            scrollbar.track,
            scrollbar.decreasebutton,
            scrollbar.increasebutton,
        ].filter(hasRenderableButton);
        return {
            background: await renderBackground(scrollbar.background, myInfo, options),
            buttons: await renderButtons(buttons, myInfo, options),
        };
    });
}

async function renderScrollbarCommon(
    scrollbar: Scrollbar,
    parentInfo: ParentInfo,
    options: RenderScrollbarOptions,
    renderContents: (parentInfo: ParentInfo) => Promise<{ background: string; buttons: string }>,
): Promise<string> {
    const [x, y, width, height, orientation] = calculateBBox(scrollbar, parentInfo);
    const contents = await renderContents({ size: { width, height }, orientation });

    return `<div
    start="${scrollbar._token?.start}"
    end="${scrollbar._token?.end}"
    class="
        ${options.styleTable.style('positionAbsolute', () => `position: absolute;`)}
        ${options.styleTable.style('borderBox', () => `box-sizing: border-box;`)}
        ${options.styleTable.oneTimeStyle('scrollbar', () => `
            left: ${x}px;
            top: ${y}px;
            width: ${width}px;
            height: ${height}px;
        `)}
        ${options.enableNavigator ? 'navigator navigator-highlight' : ''}
    ">
        ${contents.background}
        ${contents.buttons}
    </div>`;
}

async function renderButtons(buttons: HOIPartial<ButtonType>[], parentInfo: ParentInfo, options: RenderScrollbarOptions): Promise<string> {
    const sortedButtons = [...buttons].sort(compareSourceOrder);
    return (await Promise.all(sortedButtons.map(button => renderButton(button, parentInfo, removeHtmlOptions(options))))).join('');
}

function normalizeScrollbarButton(
    button: HOIPartial<ButtonType>,
    buttonsByName: Map<string, HOIPartial<ButtonType>>,
    parentInfo: ParentInfo,
    horizontal: number | undefined,
): HOIPartial<ButtonType> {
    const [canonicalX, canonicalY] = calculateScrollbarButtonPosition(button, buttonsByName, parentInfo, new Set(button.name ? [button.name] : []));
    const [x, y] = (horizontal ?? 0) !== 0 ? [canonicalY, canonicalX] : [canonicalX, canonicalY];
    return {
        ...button,
        orientation: toStringAsSymbolIgnoreCase('upper_left'),
        position: { x: toNumberLike(x), y: toNumberLike(y) },
    };
}

function calculateScrollbarButtonPosition(
    button: HOIPartial<ButtonType>,
    buttonsByName: Map<string, HOIPartial<ButtonType>>,
    parentInfo: ParentInfo,
    visited: Set<string>,
): [number, number] {
    const [x, y] = calculateBBox(button, parentInfo);
    const parentName = button.parent;
    if (!parentName || visited.has(parentName)) {
        return [x, y];
    }

    const parent = buttonsByName.get(parentName);
    if (!parent) {
        return [x, y];
    }

    const nextVisited = new Set(visited);
    if (button.name) {
        nextVisited.add(button.name);
    }
    const [parentX, parentY] = calculateScrollbarButtonPosition(parent, buttonsByName, parentInfo, nextVisited);
    return [x + parentX, y + parentY];
}

function compareSourceOrder(a: HOIPartial<ButtonType>, b: HOIPartial<ButtonType>): number {
    return (a._token?.start ?? a._index ?? 0) - (b._token?.start ?? b._index ?? 0);
}

function hasRenderableButton(button: HOIPartial<ButtonType> | undefined): button is HOIPartial<ButtonType> {
    return button !== undefined &&
        (button.name !== undefined || button.spritetype !== undefined || button.quadtexturesprite !== undefined);
}
