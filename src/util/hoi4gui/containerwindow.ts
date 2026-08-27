import { HOIPartial } from '../../hoiformat/schema';
import { calculateBBox, normalizeMargin, ParentInfo, removeHtmlOptions } from './common';
import { renderIcon } from './icon';
import { renderInstantTextBox } from './instanttextbox';
import { renderGridBox } from './gridbox';
import {
    ButtonType,
    ContainerWindowType,
    DropdownBoxType,
    EditBoxType,
    ExtendedScrollbarType,
    GridBoxType,
    IconType,
    InstantTextBoxType,
    ListBoxType,
    OverlappingElementsBoxType,
    ScrollbarType,
    SmoothListBoxType,
} from '../../hoiformat/gui';
import { renderBackground, RenderNodeCommonOptions } from './nodecommon';
import { renderButton } from './button';
import { renderDropdownBox } from './dropdownbox';
import { renderEditBox } from './editbox';
import { renderListBox, renderOverlappingElementsBox, renderSmoothListBox } from './layoutbox';
import { renderExtendedScrollbar, renderScrollbar } from './scrollbar';

export interface RenderChildTypeMap {
    containerwindow: HOIPartial<ContainerWindowType>;
    gridbox: HOIPartial<GridBoxType>;
    icon: HOIPartial<IconType>;
    instanttextbox: HOIPartial<InstantTextBoxType>;
    button: HOIPartial<ButtonType>;
    editbox: HOIPartial<EditBoxType>;
    dropdownbox: HOIPartial<DropdownBoxType>;
    overlappingelementsbox: HOIPartial<OverlappingElementsBoxType>;
    smoothlistbox: HOIPartial<SmoothListBoxType>;
    listbox: HOIPartial<ListBoxType>;
    scrollbar: HOIPartial<ScrollbarType>;
    extendedscrollbar: HOIPartial<ExtendedScrollbarType>;
}

export interface RenderContainerWindowOptions extends RenderNodeCommonOptions {
    noSize?: boolean;
    ignorePosition?: boolean;
    useShowPosition?: boolean;
    onRenderChild?<T extends keyof RenderChildTypeMap>(type: T, child: RenderChildTypeMap[T], parentInfo: ParentInfo): Promise<string | undefined>;
}

interface CommonChildCollection {
    containerwindowtype: HOIPartial<ContainerWindowType>[];
    icontype: HOIPartial<IconType>[];
    instanttextboxtype: HOIPartial<InstantTextBoxType>[];
    buttontype: HOIPartial<ButtonType>[];
    editboxtype: HOIPartial<EditBoxType>[];
}

export async function renderContainerWindow(containerWindow: HOIPartial<ContainerWindowType>, parentInfo: ParentInfo, options: RenderContainerWindowOptions): Promise<string> {
    const position = options.useShowPosition ? containerWindow.show_position ?? containerWindow.position : containerWindow.position;
    const [x, y, width, height, orientation] = calculateBBox({ ...containerWindow, position }, parentInfo);
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
    const commonChildren = renderCommonChildren({
        containerwindowtype: [...containerWindow.containerwindowtype, ...containerWindow.windowtype],
        icontype: containerWindow.icontype,
        instanttextboxtype: [...containerWindow.instanttextboxtype, ...containerWindow.textboxtype],
        buttontype: [...containerWindow.buttontype, ...containerWindow.checkboxtype, ...containerWindow.guibuttontype],
        editboxtype: containerWindow.editboxtype,
    }, myInfo, options);
    const gridboxChildren = containerWindow.gridboxtype
        .map(c => onRenderChildOrDefault(options.onRenderChild, 'gridbox', c, myInfo, c1 => renderGridBox(c1, myInfo, removeHtmlOptions({ ...options, items: {} }))));
    const dropdownBoxChildren = containerWindow.dropdownboxtype
        .map(c => onRenderChildOrDefault(options.onRenderChild, 'dropdownbox', c, myInfo, c1 => renderDropdownBox(c1, myInfo, {
            ...removeHtmlOptions(options),
            renderChildren: (dropdownBox, parentInfo) => renderDropdownBoxChildren(dropdownBox, parentInfo, options),
        })));
    const overlappingElementsBoxChildren = containerWindow.overlappingelementsboxtype
        .map(c => onRenderChildOrDefault(options.onRenderChild, 'overlappingelementsbox', c, myInfo, c1 => renderOverlappingElementsBox(c1, myInfo, removeHtmlOptions(options))));
    const smoothListBoxChildren = containerWindow.smoothlistboxtype
        .map(c => onRenderChildOrDefault(options.onRenderChild, 'smoothlistbox', c, myInfo, c1 => renderSmoothListBox(c1, myInfo, removeHtmlOptions(options))));
    const listBoxChildren = containerWindow.listboxtype
        .map(c => onRenderChildOrDefault(options.onRenderChild, 'listbox', c, myInfo, c1 => renderListBox(c1, myInfo, removeHtmlOptions(options))));
    const scrollbarChildren = containerWindow.scrollbartype
        .map(c => onRenderChildOrDefault(options.onRenderChild, 'scrollbar', c, myInfo, c1 => renderScrollbar(c1, myInfo, removeHtmlOptions(options))));
    const extendedScrollbarChildren = containerWindow.extendedscrollbartype
        .map(c => onRenderChildOrDefault(options.onRenderChild, 'extendedscrollbar', c, myInfo, c1 => renderExtendedScrollbar(c1, myInfo, removeHtmlOptions(options))));

    return await joinChildrenInOrder([
        ...commonChildren,
        ...gridboxChildren,
        ...dropdownBoxChildren,
        ...overlappingElementsBoxChildren,
        ...smoothListBoxChildren,
        ...listBoxChildren,
        ...scrollbarChildren,
        ...extendedScrollbarChildren,
    ]);
}

async function renderDropdownBoxChildren(dropdownBox: HOIPartial<DropdownBoxType>, myInfo: ParentInfo, options: RenderContainerWindowOptions): Promise<string> {
    const children = renderCommonChildren(dropdownBox, myInfo, options);
    const expandButton = dropdownBox.expandbutton ? onRenderChildOrDefault(
        options.onRenderChild,
        'button',
        dropdownBox.expandbutton,
        myInfo,
        button => renderButton(button, myInfo, {
            ...removeHtmlOptions(options),
            classNames: 'gui-dropdown-button',
            enableNavigator: undefined,
        }),
    ) : undefined;
    const expandedWindow = dropdownBox.expandedwindow ?
        renderDropdownExpandedWindow(dropdownBox.expandedwindow, myInfo, options) :
        undefined;

    return await joinChildrenInOrder([
        ...children,
        ...(expandButton ? [expandButton] : []),
        ...(expandedWindow ? [expandedWindow] : []),
    ]);
}

function renderCommonChildren(
    children: CommonChildCollection,
    myInfo: ParentInfo,
    options: RenderContainerWindowOptions,
): Promise<[number, string]>[] {
    const containerWindowChildren = children.containerwindowtype
        .map(c => onRenderChildOrDefault(options.onRenderChild, 'containerwindow', c, myInfo, c1 => renderContainerWindow(c1, myInfo, removeHtmlOptions(options))));
    const iconChildren = children.icontype
        .map(c => onRenderChildOrDefault(options.onRenderChild, 'icon', c, myInfo, c1 => renderIcon(c1, myInfo, removeHtmlOptions(options))));
    const instantTextBoxChildren = children.instanttextboxtype
        .map(c => onRenderChildOrDefault(options.onRenderChild, 'instanttextbox', c, myInfo, c1 => renderInstantTextBox(c1, myInfo, removeHtmlOptions(options))));
    const buttonChildren = children.buttontype
        .map(c => onRenderChildOrDefault(options.onRenderChild, 'button', c, myInfo, c1 => renderButton(c1, myInfo, removeHtmlOptions(options))));
    const editBoxChildren = children.editboxtype
        .map(c => onRenderChildOrDefault(options.onRenderChild, 'editbox', c, myInfo, c1 => renderEditBox(c1, myInfo, removeHtmlOptions(options))));

    return [
        ...containerWindowChildren,
        ...iconChildren,
        ...instantTextBoxChildren,
        ...buttonChildren,
        ...editBoxChildren,
    ];
}

async function renderDropdownExpandedWindow(
    expandedWindow: HOIPartial<ContainerWindowType>,
    myInfo: ParentInfo,
    options: RenderContainerWindowOptions,
): Promise<[number, string]> {
    const [sourceOrder, content] = await onRenderChildOrDefault(
        options.onRenderChild,
        'containerwindow',
        expandedWindow,
        myInfo,
        child => renderContainerWindow(child, myInfo, { ...removeHtmlOptions(options), useShowPosition: true }),
    );
    return [sourceOrder, `<div class="gui-dropdown-expanded" hidden>${content}</div>`];
}

async function joinChildrenInOrder(children: Promise<[number, string]>[]): Promise<string> {
    const result = await Promise.all(children);
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
        child._token?.start ?? 0,
        result !== undefined ? result : await defaultRenderer(child),
    ];
}
