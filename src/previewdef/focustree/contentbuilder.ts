import * as vscode from 'vscode';
import { Focus, FocusInlayWindowWithCondition, FocusStyle, FocusTree, getGfxNameForSearchFilter } from './schema';
import { getImageByPath, getSpriteByGfxName, Image, Sprite } from '../../util/image/imagecache';
import { i18nTableAsScript, localize } from '../../util/i18n';
import { arrayToMap, forceError, randomString } from '../../util/common';
import { HOIPartial, NumberLike, toNumberLike, toStringAsSymbolIgnoreCase } from '../../hoiformat/schema';
import { html, htmlEscape } from '../../util/html';
import { ContainerWindowType, Format, GridBoxType, IconType, InstantTextBoxType, Orientation } from '../../hoiformat/gui';
import { defaultFocusStyle, FocusTreeLoader, FocusTreeLoaderResult } from './loader';
import { LoaderSession } from '../../util/loader/loader';
import { debug } from '../../util/debug';
import { normalizeForStyle, StyleTable } from '../../util/styletable';
import { featureFlagsAsScript, isFeatureEnabled } from '../../util/featureflags';
import { chain, flatMap } from 'lodash';
import { indexManager } from '../../indexing/indexmanager';
import { localisationIndex } from '../../indexing/localisationindex';
import { renderContainerWindow } from '../../util/hoi4gui/containerwindow';
import { renderInstantTextBox } from '../../util/hoi4gui/instanttextbox';
import { RenderNodeCommonOptions } from '../../util/hoi4gui/nodecommon';
import { renderIcon } from '../../util/hoi4gui/icon';
import { calculateBBox, ParentInfo } from '../../util/hoi4gui/common';
import { FocusInlayWindow } from './inlaywindow/schema';

const defaultFocusIcon = 'gfx/interface/goals/goal_unknown.dds';

export async function renderFocusTreeFile(loader: FocusTreeLoader, uri: vscode.Uri, webview: vscode.Webview, lastDocumentChangeTimestamp: number): Promise<string> {
    const setPreviewFileUriScript = { content: `window.previewedFileUri = "${uri.toString()}";` };

    try {
        const session = new LoaderSession(false);
        const loadResult = await loader.load(session);
        const loadedLoaders = Array.from((session as any).loadedLoader).map<string>(v => (v as any).toString());
        debug('Loader session focus tree', loadedLoaders);

        const focustrees = loadResult.result.focusTrees;

        if (focustrees.length === 0) {
            const baseContent = localize('focustree.nofocustree', 'No focus tree.');
            return html(webview, baseContent, [ setPreviewFileUriScript ], []);
        }

        const styleTable = new StyleTable();
        const jsCodes: string[] = [];
        const styleNonce = randomString(32);
        const baseContent = await renderFocusTrees(focustrees, styleTable, loadResult.result, jsCodes, styleNonce, loader.file);
        jsCodes.push(i18nTableAsScript());
        jsCodes.push(featureFlagsAsScript());
        jsCodes.push(`window.lastDocumentChangeTimestamp = ${lastDocumentChangeTimestamp};`);

        return html(
            webview,
            baseContent,
            [
                setPreviewFileUriScript,
                ...jsCodes.map(c => ({ content: c })),
                'common.js',
                'focustree.js',
            ],
            [
                'codicon.css',
                'common.css',
                styleTable,
                { nonce: styleNonce },
            ],
        );

    } catch (e) {
        const baseContent = `${localize('error', 'Error')}: <br/>  <pre>${htmlEscape(forceError(e).toString())}</pre>`;
        return html(webview, baseContent, [ setPreviewFileUriScript ], []);
    }
}

const leftPaddingBase = 50;
const topPaddingBase = 50;
const defaultXGridSize = 96;
const defaultYGridSize = 130;

async function renderFocusTrees(focusTrees: FocusTree[], styleTable: StyleTable, loadResult: FocusTreeLoaderResult, jsCodes: string[], styleNonce: string, file: string): Promise<string> {
    const gfxFiles = loadResult.gfxFiles;
    const leftPadding = leftPaddingBase;
    const topPadding = topPaddingBase;

    const containerWindows = chain(loadResult.guiFiles)
        .flatMap(guiFile => guiFile.data.guitypes)
        .flatMap(guiType => guiType.containerwindowtype)
        .value();
    const nationalFocusItem = containerWindows.find(window => window.name === 'national_focus_item');
    const gridSize = chain(loadResult.guiFiles)
        .flatMap(guiFile => guiFile.data.guitypes)
        .flatMap(guiType => guiType.positiontype)
        .find(position => position.name === 'focus_spacing')
        .value()
        ?.position;
    const xGridSize = gridSize?.x ?? defaultXGridSize;
    const yGridSize = gridSize?.y ?? defaultYGridSize;

    const gridBox: HOIPartial<GridBoxType> = {
        position: { x: toNumberLike(leftPadding), y: toNumberLike(topPadding) },
        format: toStringAsSymbolIgnoreCase('up'),
        size: { width: toNumberLike(xGridSize), height: undefined },
        slotsize: { width: toNumberLike(xGridSize), height: toNumberLike(yGridSize) },
    } as HOIPartial<GridBoxType>;

    const renderedFocus: Record<string, string> = {};
    await Promise.all(flatMap(focusTrees, tree => Object.values(tree.focuses)).map(async (focus) =>
        renderedFocus[focus.id] = (await renderFocus(focus, styleTable, gfxFiles, file, nationalFocusItem, loadResult.styles, xGridSize, yGridSize)).replace(/\s\s+/g, ' ')));

    const inlayWindows = arrayToMap(loadResult.inlayWindows, 'id');

    jsCodes.push('window.focusTrees = ' + JSON.stringify(focusTrees));
    jsCodes.push('window.inlayWindows = ' + JSON.stringify(inlayWindows));
    jsCodes.push('window.renderedFocus = ' + JSON.stringify(renderedFocus));
    jsCodes.push('window.gridBox = ' + JSON.stringify(gridBox));
    jsCodes.push('window.styleNonce = ' + JSON.stringify(styleNonce));
    jsCodes.push('window.xGridSize = ' + xGridSize);
    jsCodes.push('window.yGridSize = ' + yGridSize);

    return (
        `<div id="dragger" additionalDraggerHostId="focustreecontent" class="${styleTable.oneTimeStyle('dragger', () => `
            width: 100vw;
            height: 100vh;
            position: fixed;
            left:0;
            top:0;
        `)}"></div>` +
        `<div id="focustreecontent" class="${styleTable.oneTimeStyle('focustreecontent', () => `top:80px;left:-20px;position:relative`)}">
            <div id="focustreeplaceholder"></div>
            ${await renderContinuousFocuses(containerWindows, styleTable, gfxFiles)}
            ${await renderInlayWindows(focusTrees, inlayWindows, containerWindows, styleTable, gfxFiles)}
        </div>` +
        renderWarningContainer(styleTable) +
        await renderToolBar(focusTrees, styleTable, gfxFiles)
    );
}

async function renderContinuousFocuses(containerWindows: HOIPartial<ContainerWindowType>[], styleTable: StyleTable, gfxFiles: string[]): Promise<string> {
    const nationalFocusView = containerWindows.find(w => w.name === 'nationalfocusview');
    const tree = nationalFocusView?.containerwindowtype.find(w => w.name === 'tree');
    const gridWindow = tree?.containerwindowtype.find(w => w.name === 'grid_window');
    const continuousFocusWindow = gridWindow?.containerwindowtype.find(w => w.name === 'continuous_focus_window');

    const continuousFocusContent = continuousFocusWindow ?
        await renderContainerWindow(
            continuousFocusWindow,
            {
                size: { width: 1920, height: 1080 },
                orientation: 'upper_left',
            },
            {
                getSprite: (name) => getSpriteByGfxName(name, gfxFiles),
                styleTable,
                id: 'continuousFocuses',
                classNames: [
                    styleTable.oneTimeStyle('continuousFocuses', () => `cursor: pointer;`),
                    'navigator',
                ].join(' '),
            }) :
        `<div id="continuousFocuses" class="${styleTable.oneTimeStyle('continuousFocuses', () => `
            position: absolute;
            width: 770px;
            height: 380px;
            background: rgba(128, 128, 128, 0.2);
            text-align: center;
            pointer-events: none;
        `)}">Continuous focuses</div>`;

    return continuousFocusContent;
}

async function renderInlayWindows(
    focusTrees: FocusTree[],
    inlayWindows: Record<string, FocusInlayWindow>,
    containerWindows: HOIPartial<ContainerWindowType>[],
    styleTable: StyleTable,
    gfxFiles: string[]
): Promise<string> {
    return (await Promise.all(focusTrees
            .flatMap(ft => ft.inlayWindows.map(iw => [ft, iw] as [FocusTree, FocusInlayWindowWithCondition]))
            .map(async ([ft, iw]) => {
        const inlayWindow = inlayWindows[iw.id];
        if (!inlayWindow) {
            return '';
        }

        const containerWindow = containerWindows.find(w => w.name === inlayWindow.windowName);
        if (!containerWindow) {
            return '';
        }

        return await renderContainerWindow(
            containerWindow,
            {
                size: { width: 1920, height: 1080 },
                orientation: 'upper_left',
            },
            {
                getSprite: (name) => getSpriteByGfxName(name, gfxFiles),
                styleTable,
                id: 'inlayWindow-' + normalizeForStyle(ft.id) + '-' + normalizeForStyle(inlayWindow.id),
                classNames: [
                    styleTable.oneTimeStyle('inlayWindow', () => `cursor: pointer; z-index: 20;`),
                    styleTable.style('displayNone', () => `display: none;`),
                    'inlayWindow',
                    iw.token ? 'navigator' : '',
                ].join(' '),
                navigatorToken: iw.token,
            });

    }))).join('');
}

function renderWarningContainer(styleTable: StyleTable) {
    styleTable.style('warnings', () => 'outline: none;', ':focus');
    return `
    <div id="warnings-container" class="${styleTable.style('warnings-container', () => `
        height: 100vh;
        width: 100vw;
        position: fixed;
        top: 0;
        left: 0;
        padding-top: 70px;
        background: var(--vscode-editor-background);
        box-sizing: border-box;
        display: none;
    `)}">
        <textarea id="warnings" readonly wrap="off" class="${styleTable.style('warnings', () => `
            height: 100%;
            width: 100%;
            font-family: 'Consolas', monospace;
            resize: none;
            background: var(--vscode-editor-background);
            padding: 10px;
            border-top: none;
            border-left: none;
            border-bottom: none;
            box-sizing: border-box;
        `)}"></textarea>
    </div>`;
}

async function renderToolBar(focusTrees: FocusTree[], styleTable: StyleTable, gfxFiles: string[]): Promise<string> {
    const focuses = focusTrees.length <= 1 ? '' : `
        <label for="focuses" class="${styleTable.style('focusesLabel', () => `margin-right:5px`)}">${localize('focustree.focustree', 'Focus tree: ')}</label>
        <div class="select-container ${styleTable.style('marginRight10', () => `margin-right:10px`)}">
            <select id="focuses" class="select multiple-select" tabindex="0" role="combobox">
                ${focusTrees.map((focus, i) => `<option value="${i}">${focus.id}</option>`).join('')}
            </select>
        </div>`;

    const searchbox = `    
        <label for="searchbox" class="${styleTable.style('searchboxLabel', () => `margin-right:5px`)}">${localize('focustree.search', 'Search: ')}</label>
        <input
            class="${styleTable.style('searchbox', () => `margin-right:10px`)}"
            id="searchbox"
            type="text"
        />`;

    const allowbranch = `
        <div id="allowbranch-container">
            <label for="allowbranch" class="${styleTable.style('allowbranchLabel', () => `margin-right:5px`)}">${localize('focustree.allowbranch', 'Allow branch: ')}</label>
            <div class="select-container ${styleTable.style('marginRight10', () => `margin-right:10px`)}">
                <div id="allowbranch" class="select multiple-select" tabindex="0" role="combobox">
                    <span class="value"></span>
                </div>
            </div>
        </div>`;

    const conditions = `
        <div id="condition-container">
            <label for="conditions" class="${styleTable.style('conditionsLabel', () => `margin-right:5px`)}">${localize('focustree.conditions', 'Conditions: ')}</label>
            <div class="select-container ${styleTable.style('marginRight10', () => `margin-right:10px`)}">
                <div id="conditions" class="select multiple-select ${styleTable.style('conditions', () => `max-width:400px`)}" tabindex="0" role="combobox">
                    <span class="value"></span>
                </div>
            </div>
        </div>`;
    
    const warningsButton = focusTrees.every(ft => ft.warnings.length === 0) ? '' : `
        <button id="show-warnings" title="${localize('focustree.warnings', 'Toggle warnings')}">
            <i class="codicon codicon-warning"></i>
        </button>`;
    
    const searchFilterNames = chain(focusTrees).flatMap(ft => ft.searchFilters).uniq().value();
    const searchFilterSprites: Record<string, Sprite | undefined> = {};
    await Promise.all(searchFilterNames.map(async searchFilter => {
        searchFilterSprites[searchFilter] = await getSpriteByGfxName(getGfxNameForSearchFilter(searchFilter), gfxFiles);
    }));

    const searchFilters = searchFilterNames.length === 0 ? '' : `
        <div id="search-filters-container">
            <label for="search-filters" class="${styleTable.style('searchFiltersLabel', () => `margin-right:5px`)}">${localize('focustree.searchfilters', 'Filters: ')}</label>
            <div class="select-container ${styleTable.style('marginRight10', () => `margin-right:10px`)}">
                <div id="search-filters" class="select multiple-select" tabindex="0" role="combobox">
                    <span class="value"></span>
                    ${
                        searchFilterNames.map(filter =>
                            `<div class="option" value="${htmlEscape(filter)}">
                                <span class="${styleTable.oneTimeStyle('searchFilterIcon', () =>
                                    `background-image: url(${searchFilterSprites[filter]?.image.uri});`
                                )}
                                ${styleTable.style('searchFilterIcon', () =>
                                    `display: inline-block; width: 16px; height: 16px; background-size: 16px 16px;`
                                )}"></span>
                                ${htmlEscape(localisationIndex.getLocalisedText(filter) ?? '')}
                            </div>`)
                        .join('')
                    }
                </div>
            </div>
        </div>
    `;

    return `<div class="toolbar-outer ${styleTable.style('toolbar-padding', () => `padding-top:5px; padding-bottom:5px;`)}">
        <div class="toolbar ${styleTable.style('toolbar', () => `flex-direction:column; top:0; transform:none;`)}">
            <div id="toolbar-row-1" class="toolbar-row">
                ${focuses}
                ${isFeatureEnabled('useConditionInFocus') ? conditions : allowbranch}
                ${warningsButton}
            </div>
            <div class="toolbar-row">
                ${indexManager.isIndexEnabled('localisation') ? renderPreviewLabelModeControl(styleTable) : ''}
                ${searchbox}
                ${searchFilters}
                <button id="refresh" title="${localize('common.topbar.refresh.title', 'Refresh')}">
                    <i class="codicon codicon-refresh"></i>
                </button>
            </div>
        </div>
    </div>`;
}

function renderPreviewLabelModeControl(styleTable: StyleTable): string {
    return `<div class="preview-label-mode ${styleTable.style('marginRight10', () => `margin-right:10px`)}">
        <span class="${styleTable.style('previewLabelModeLabel', () => `margin-right:5px`)}">${localize('preview.labelmode', 'Label: ')}</span>
        <button type="button" data-preview-label-mode-value="id" aria-pressed="true">${localize('preview.labelmode.id', 'ID')}</button>
        <button type="button" data-preview-label-mode-value="name" aria-pressed="false">${localize('preview.labelmode.name', 'Name')}</button>
    </div>`;
}

async function renderFocus(
    focus: Focus,
    styleTable: StyleTable,
    gfxFiles: string[],
    file: string,
    nationalFocusItem: HOIPartial<ContainerWindowType> | undefined,
    focusStyles: FocusStyle[],
    xGridSize: number,
    yGridSize: number,
): Promise<string> {
    if (nationalFocusItem) {
        return await renderFocusWithGui(focus, styleTable, gfxFiles, file, nationalFocusItem, focusStyles, xGridSize, yGridSize);
    }

    // Following are old way to generate icon, only used when nationalFocusItem is not available
    for (const focusIcon of focus.icon) {
        const iconName = focusIcon.icon;
        const iconSprite = iconName ? await getSpriteByGfxName(iconName, gfxFiles) : undefined;
        const iconObject = iconSprite?.image ?? (iconName ? await getImageByPath(defaultFocusIcon) : null);
        const iconWidth = iconSprite?.image.width ?? xGridSize;
        const iconHeight = iconSprite?.image.height ?? yGridSize;
        styleTable.style('focus-icon-' + normalizeForStyle(iconName ?? '-empty'), () => `
            width: ${iconWidth}px;
            height: ${iconHeight}px;
            ${iconObject ? `background-image: url(${iconObject.uri});` : 'background: grey;'}
            background-size: ${iconObject ? `${iconObject.width}px ${iconObject.height}px` : '0 0'};
            ${iconSprite ? `
                left: 50%;
                top: calc(50% - 18px);
                transform: translate(-50%, -50%);
                background-position: center;
            ` : `
                left: 0;
                top: 0;
                background-position-x: center;
                background-position-y: calc(50% - 18px);
            `}
        `);
    }

    styleTable.style('focus-icon-' + normalizeForStyle('-empty'), () => `
        left: 0;
        top: 0;
        width: ${xGridSize}px;
        height: ${yGridSize}px;
        background: grey;
    `);

    let overlay = '';
    if (focus.overlay) {
        const overlaySprite = await getSpriteByGfxName(focus.overlay, gfxFiles);
        if (overlaySprite !== undefined) {
            overlay = `<div class="
            ${styleTable.style('focus-overlay-common', () => `
                position: absolute;
                left: 50%;
                top: 50%;
                width: ${overlaySprite.image.width}px;
                height: ${overlaySprite.image.height}px;
                pointer-events: none;
                transform: translate(-50%, -50%);
                z-index: 0;
            `)}
            ${styleTable.style('focus-overlay-' + normalizeForStyle(focus.overlay), () =>
                `background-image: url(${overlaySprite.image.uri});
                background-size: ${overlaySprite.image.width}px ${overlaySprite.image.height}px;
                background-position: center;
                background-repeat: no-repeat;`
            )}"></div>`;
        }
    }

    const localisedText = getFocusLocalisedText(focus);
    const textContent = htmlEscape(focus.id);
    const labelAttributes = getPreviewLabelAttributes(focus.id, localisedText);
    const titleAttributes = getPreviewTitleAttributes(focus.id, localisedText, '{{position}}');

    return `<div
    class="
        navigator
        ${styleTable.style('focus-common', () => `
            position: relative;
            width: 100%;
            height: 100%;
            text-align: center;
            cursor: pointer;
        `)}
    "
    start="${focus.token?.start}"
    end="${focus.token?.end}"
    ${file === focus.file ? '' : `file="${focus.file}"`}
    ${titleAttributes}>
        <div class="focus-checkbox ${styleTable.style('focus-checkbox', () => `position: absolute; top: 1px; z-index: 1;`)}">
            <input id="checkbox-${normalizeForStyle(focus.id)}" type="checkbox"/>
        </div>
        <div class="
            {{iconClass}}
            ${styleTable.style('focus-icon-common', () => `
                position: absolute;
                pointer-events: none;
                z-index: 0;
                background-repeat: no-repeat;
            `)}
        "></div>
        ${overlay}
        <span
        ${labelAttributes}
        class="${styleTable.style('focus-span', () => `
            margin: 10px -400px;
            margin-top: 85px;
            text-align: center;
            display: inline-block;
            position: relative;
            z-index: 1;
        `)}">
        ${textContent}
        </span>
    </div>`;
}

async function renderFocusWithGui(
    focus: Focus,
    styleTable: StyleTable,
    gfxFiles: string[],
    file: string,
    nationalFocusItem: HOIPartial<ContainerWindowType>,
    focusStyles: FocusStyle[],
    xGridSize: number,
    yGridSize: number
): Promise<string> {
    for (const focusIcon of focus.icon) {
        const iconName = focusIcon.icon;
        const iconSprite = iconName ? await getSpriteByGfxName(iconName, gfxFiles) : undefined;
        const iconObject = iconSprite?.image ?? (iconName ? await getImageByPath(defaultFocusIcon) : null);
        const iconWidth = iconSprite?.image.width ?? xGridSize;
        const iconHeight = iconSprite?.image.height ?? xGridSize;
        styleTable.style('focus-icon-' + normalizeForStyle(iconName ?? '-empty'), () => `
            width: ${iconWidth}px;
            height: ${iconHeight}px;
            ${iconObject ? `background-image: url(${iconObject.uri});` : 'background: grey;'}
            background-size: ${iconObject ? `${iconObject.width}px ${iconObject.height}px` : '0 0'};
            transform: translate(-50%, -50%);
            background-position: center;
        `);
    }

    styleTable.style('focus-icon-' + normalizeForStyle('-empty'), () => `
        width: ${xGridSize}px;
        height: ${xGridSize}px;
        background: grey;
        transform: translate(-50%, -50%);
    `);

    const localisedText = getFocusLocalisedText(focus);
    const commonOptions: RenderNodeCommonOptions = {
        getSprite: (name) => getSpriteByGfxName(name, gfxFiles),
        styleTable,
    };

    const focusStyle = focusStyles.find(style => focus.textIcon === undefined ? style.default : focus.textIcon === style.name) ?? defaultFocusStyle;
    const bgIcon = focusStyle.unavailable;

    const parentInfo: ParentInfo = {
        size: { width: 1920, height: 1080 },
        orientation: 'upper_left',
    };
    const [_, __, width, height] = calculateBBox(nationalFocusItem, parentInfo);

    const renderedContainerWindow = await renderContainerWindow(
        nationalFocusItem,
        parentInfo,
        {
            ...commonOptions,
            classNames: [
                styleTable.style('national-focus-position-important', () =>
                    `left: ${(xGridSize - width) / 2 - 4}px !important;` +
                    `top: ${(yGridSize - height) / 2 + 26}px !important;`
                ),
            ].join(' '),
            onRenderChild: async (type, child, parentInfo) => {
                if (child.name === 'bg') {
                    const icon = child as HOIPartial<IconType>;
                    return await renderIcon({...icon, quadtexturesprite: bgIcon}, parentInfo, commonOptions);
                }
                
                if (child.name === 'symbol') {
                    const icon = child as HOIPartial<IconType>;
                    let [x, y] = calculateBBox(icon, parentInfo);
                    return `<div class="
                        {{iconClass}}
                        ${styleTable.style('focus-icon-common', () => `
                            position: absolute;
                            pointer-events: none;
                            z-index: 0;
                            background-repeat: no-repeat;
                        `)}
                        ${styleTable.oneTimeStyle('icon', () => `
                            left: ${x}px;
                            top: ${y}px;
                        `)}
                    "></div>`;
                }

                if (child.name === 'overlay') {
                    const icon = child as HOIPartial<IconType>;
                    return await renderIcon({...icon, quadtexturesprite: focus.overlay}, parentInfo, commonOptions);
                }

                if (child.name === 'name') {
                    const text = child as HOIPartial<InstantTextBoxType>;
                    return await renderInstantTextBox(
                        { ...text, text: `<span ${getPreviewLabelAttributes(focus.id, localisedText)}>${htmlEscape(focus.id)}</span>` },
                        parentInfo,
                        { ...commonOptions, localise: false, rawText: true }
                    );
                }

                return '';
            },
        });

    const titleAttributes = getPreviewTitleAttributes(focus.id, localisedText, '{{position}}');
    return `<div
    class="
        navigator
        ${styleTable.style('focus-common', () => `
            position: relative;
            width: 100%;
            height: 100%;
            text-align: center;
            cursor: pointer;
            display: grid;
            place-items: center;
        `)}
    "
    start="${focus.token?.start}"
    end="${focus.token?.end}"
    ${file === focus.file ? '' : `file="${focus.file}"`}
    ${titleAttributes}>
        <div class="focus-checkbox ${styleTable.style('focus-checkbox', () => `position: absolute; top: 1px; left: 0; z-index: 1;`)}">
            <input id="checkbox-${normalizeForStyle(focus.id)}" type="checkbox"/>
        </div>
        ${renderedContainerWindow}
    </div>`;
}

function getFocusLocalisedText(focus: Focus): string | undefined {
    let localisedText = localisationIndex.getLocalisedText(focus.id);
    if (localisedText && localisedText !== focus.id) {
        return localisedText;
    }

    if (focus.text) {
        localisedText = localisationIndex.getLocalisedText(focus.text);
        if (localisedText && localisedText !== focus.text) {
            return localisedText;
        }
    }

    return undefined;
}

function getPreviewLabelAttributes(id: string, name: string | undefined): string {
    return `data-preview-label-id="${htmlEscape(id)}" data-preview-label-name="${htmlEscape(name ?? id)}"`;
}

function getPreviewTitleAttributes(id: string, name: string | undefined, position: string): string {
    const idTitle = `${id}\n(${position})`;
    const nameTitle = `${name ?? id}\n(${position})`;
    return `title="${htmlEscape(idTitle)}" data-preview-title-id="${htmlEscape(idTitle)}" data-preview-title-name="${htmlEscape(nameTitle)}"`;
}

export async function getFocusIcon(name: string, gfxFiles: string[]): Promise<Image | undefined> {
    const sprite = await getSpriteByGfxName(name, gfxFiles);
    if (sprite !== undefined) {
        return sprite.image;
    }

    return await getImageByPath(defaultFocusIcon);
}

