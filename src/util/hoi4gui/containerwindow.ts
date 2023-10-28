import { HOIPartial } from "../../hoiformat/schema";
import { calculateBBox, normalizeMargin, ParentInfo, removeHtmlOptions } from "./common";
import { renderIcon } from "./icon";
import { renderInstantTextBox } from "./instanttextbox";
import { renderGridBox } from "./gridbox";
import { ButtonType, ContainerWindowType, GridBoxType, IconType, InstantTextBoxType } from "../../hoiformat/gui";
import { renderBackground, RenderNodeCommonOptions } from './nodecommon';
import { renderButton } from "./button";

export interface RenderChildTypeMap {
    containerwindow: HOIPartial<ContainerWindowType>;
    gridbox: HOIPartial<GridBoxType>;
    icon: HOIPartial<IconType>;
    instanttextbox: HOIPartial<InstantTextBoxType>;
    button: HOIPartial<ButtonType>;
}

export interface RenderContainerWindowOptions extends RenderNodeCommonOptions {
    noSize?: boolean;
    ignorePosition?: boolean;
    onRenderChild?<T extends keyof RenderChildTypeMap>(type: T, child: RenderChildTypeMap[T], parentInfo: ParentInfo): Promise<string | undefined>;
}

export async function renderContainerWindow(containerWindow: HOIPartial<ContainerWindowType>, parentInfo: ParentInfo, options: RenderContainerWindowOptions): Promise<string> {
    const [x, y, width, height, orientation] = calculateBBox(containerWindow, parentInfo);
    const size = { width, height };
    const margin = normalizeMargin(containerWindow.margin, size);
    const myInfo: ParentInfo = {
        size: {
            width: size.width - margin[1] - margin[3],
            height: size.height - margin[0] - margin[2],
        },
        orientation,
    };

    const background = await renderBackground(containerWindow.background, {size, orientation}, options);
    const children = await renderContainerWindowChildren(containerWindow, myInfo, { ...options, ignorePosition: undefined });

    return `<div
    ${options.id ? `id="${options.id}"` : ''}
    start="${containerWindow._token?.start}"
    end="${containerWindow._token?.end}"
    class="
        ${options?.classNames ? options.classNames : ''}
        ${options.styleTable.style('positionAbsolute', () => `position: absolute;`)}
        ${options.styleTable.style('borderBox', () => `box-sizing: border-box;`)}
        ${options.styleTable.oneTimeStyle('containerwindow', () => `
            left: ${options.ignorePosition ? 0 : x}px;
            top: ${options.ignorePosition ? 0 : y}px;
            width: ${options.noSize ? 0 : width}px;
            height: ${options.noSize ? 0 : height}px;
        `)}
        ${options.enableNavigator ? 'navigator navigator-highlight' : ''}
    ">
        ${background}
        <div class="
            ${options.styleTable.style('positionAbsolute', () => `position: absolute;`)}
            ${options.styleTable.oneTimeStyle('containerwindowChildren', () => `
                left: ${margin[3]}px;
                top: ${margin[0]}px;
            `)}
        ">
            ${children}
        </div>
    </div>`;
}

export async function renderContainerWindowChildren(containerWindow: HOIPartial<ContainerWindowType>, myInfo: ParentInfo, options: RenderContainerWindowOptions): Promise<string> {
    const containerWindowChildren = [...containerWindow.containerwindowtype, ...containerWindow.windowtype]
        .map(c => onRenderChildOrDefault(options.onRenderChild, 'containerwindow', c, myInfo, c1 => renderContainerWindow(c1, myInfo, removeHtmlOptions(options))));
    const gridboxChildren = containerWindow.gridboxtype
        .map(c => onRenderChildOrDefault(options.onRenderChild, 'gridbox', c, myInfo, c1 => renderGridBox(c1, myInfo, removeHtmlOptions({ ...options, items: {} }))));
    const iconChildren = containerWindow.icontype
        .map(c => onRenderChildOrDefault(options.onRenderChild, 'icon', c, myInfo, c1 => renderIcon(c1, myInfo, removeHtmlOptions(options))));
    const instantTextBoxChildren = [...containerWindow.instanttextboxtype, ...containerWindow.textboxtype]
        .map(c => onRenderChildOrDefault(options.onRenderChild, 'instanttextbox', c, myInfo, c1 => renderInstantTextBox(c1, myInfo, removeHtmlOptions(options))));
    const buttonChildren = [...containerWindow.buttontype, ...containerWindow.checkboxtype, ...containerWindow.guibuttontype]
        .map(c => onRenderChildOrDefault(options.onRenderChild, 'button', c, myInfo, c1 => renderButton(c1, myInfo, removeHtmlOptions(options))));

    const result = (await Promise.all([
        ...containerWindowChildren,
        ...gridboxChildren,
        ...iconChildren,
        ...instantTextBoxChildren,
        ...buttonChildren,
    ]));
    result.sort((a, b) => a[0] - b[0]);
    return result.map(v => v[1]).join('');
}

export async function onRenderChildOrDefault<T extends keyof RenderChildTypeMap>(
    onRenderChild: RenderContainerWindowOptions['onRenderChild'],
    type: T,
    child: RenderChildTypeMap[T],
    parentInfo: ParentInfo,
    defaultRenderer: (c: RenderChildTypeMap[T]) => Promise<string>): Promise<[number, string]>
{
    let result: string | undefined = undefined;
    if (onRenderChild) {
        result = await onRenderChild(type, child, parentInfo);
    }

    return [
        child._index || 0,
        result !== undefined ? result : await defaultRenderer(child),
    ];
}
