import { chain } from 'lodash';
import * as vscode from 'vscode';
import { ContainerWindowType } from '../../hoiformat/gui';
import { HOIPartial, NumberLike, toStringAsSymbolIgnoreCase } from '../../hoiformat/schema';
import { forceError } from '../../util/common';
import { debug } from '../../util/debug';
import { getHeight, getWidth } from '../../util/hoi4gui/common';
import { renderContainerWindow } from '../../util/hoi4gui/containerwindow';
import { RenderNodeCommonOptions } from '../../util/hoi4gui/nodecommon';
import { html, htmlEscape } from '../../util/html';
import { localize } from '../../util/i18n';
import { getSpriteByGfxName } from '../../util/image/imagecache';
import { LoaderSession } from '../../util/loader/loader';
import { StyleTable } from '../../util/styletable';
import { GuiFileLoader, GuiFileLoaderResult } from "./loader";

export async function renderGuiFile(loader: GuiFileLoader, uri: vscode.Uri, webview: vscode.Webview): Promise<string> {
    const setPreviewFileUriScript = { content: `window.previewedFileUri = "${uri.toString()}";` };
    try {
        const session = new LoaderSession(false);
        const loadResult = await loader.load(session);
        const loadedLoaders = Array.from((session as any).loadedLoader).map<string>(v => (v as any).toString());
        debug('Loader session gui', loadedLoaders);

        const guiFiles = loadResult.result.guiFiles;
        const containerWindows = chain(guiFiles).flatMap(g => g.data.guitypes).flatMap(gt => [...gt.containerwindowtype, ...gt.windowtype]).value();
        
        if (containerWindows.length === 0) {
            const baseContent = localize('guipreview.nocontainerwindows', 'No containerwindowtype in gui file.');
            return html(webview, baseContent, [ setPreviewFileUriScript ], []);
        }

        const styleTable = new StyleTable();
        const baseContent = await renderGuiContainerWindows(containerWindows, styleTable, loadResult.result);

        return html(
            webview,
            baseContent,
            [
                setPreviewFileUriScript,
                'common.js',
                'techtree.js',
            ],
            [
                'common.css',
                'codicon.css',
                styleTable,
            ],
        );

    } catch (e) {
        const baseContent = `${localize('error', 'Error')}: <br/>  <pre>${htmlEscape(forceError(e).toString())}</pre>`;
        return html(webview, baseContent, [ setPreviewFileUriScript ], []);
    }
}

async function renderGuiContainerWindows(containerWindows: HOIPartial<ContainerWindowType>[], styleTable: StyleTable, loadResult: GuiFileLoaderResult): Promise<string> {
    const gfxFiles = loadResult.gfxFiles;
    const renderedWindows = (await Promise.all(containerWindows.map(cw => renderSingleContainerWindow(cw, styleTable, gfxFiles)))).join('');

    return `
    ${renderTopBar(containerWindows.map(cw => cw.name).filter((name): name is string => name !== undefined), styleTable)}
    <div
    id="dragger"
    class="${styleTable.oneTimeStyle('dragger', () => `
        width: 100vw;
        height: 100vh;
        position: fixed;
        left:0;
        top:0;
        background:#101010;
    `)}">
    </div>
    <div
    class="${styleTable.oneTimeStyle('mainContent', () => `
        position: absolute;
        left: 0;
        top: 0;
        /*pointer-events: none;*/
        margin-top: 40px;
    `)}">
        ${renderedWindows}
    </div>`;
}

function renderTopBar(folders: string[], styleTable: StyleTable): string {
    return `<div
    class="${styleTable.oneTimeStyle('folderSelectorBar', () => `
        position: fixed;
        padding-top: 10px;
        padding-left: 20px;
        width: 100%;
        height: 30px;
        top: 0;
        left: 0;
        background: var(--vscode-editor-background);
        border-bottom: 1px solid var(--vscode-panel-border);
        z-index: 10;
    `)}">
        <label for="folderSelector" class="${styleTable.oneTimeStyle('folderSelectorLabel', () => `margin-right:5px`)}">
            ${localize('guipreview.containerWindow', 'Container Window: ')}
        </label>
        <div class="select-container">
            <select
                id="folderSelector"
                type="text"
                class="${styleTable.oneTimeStyle('folderSelector', () => `min-width:200px`)}"
            >
                ${folders.map(folder => `<option value="techfolder_${folder}">${folder}</option>`)}
            </select>
        </div>
        <button id="refresh" title="${localize('common.topbar.refresh.title', 'Refresh')}">
            <i class="codicon codicon-refresh"></i>
        </button>
    </div>`;
}

async function renderSingleContainerWindow(
    containerWindow: HOIPartial<ContainerWindowType>,
    styleTable: StyleTable,
    gfxFiles: string[],
): Promise<string> {
    let children: string;
    const commonOptions: RenderNodeCommonOptions = {
        getSprite: defaultGetSprite(gfxFiles),
        styleTable,
    };

    const size = { width: 1920, height: 1080 };
    const width = getWidth(containerWindow.size);
    const height = getHeight(containerWindow.size);
    if (!width?._unit && width?._value !== undefined) {
        size.width = width._value;
    }
    if (!height?._unit && height?._value !== undefined) {
        size.height = height._value;
    }

    const position = containerWindow.position ? { ...containerWindow.position } : { x: undefined, y: undefined };
    if (position.x?._value !== undefined && position.x?._value < 0) {
        position.x = { ...position.x, _value: 0 };
    }
    if (position.y?._value !== undefined && position.y?._value < 0) {
        position.y = { ...position.y, _value: 0 };
    }

    children = await renderContainerWindow(
        {
            ...containerWindow,
            position: position,
            orientation: toStringAsSymbolIgnoreCase('upper_left'),
            origo: toStringAsSymbolIgnoreCase('upper_left'),
        },
        {
            size,
            orientation: 'upper_left',
        },
        {
            ...commonOptions,
            ignorePosition: false,
            enableNavigator: true,
        },
    );

    return `<div
        id="techfolder_${containerWindow.name}"
        class="techfolder ${styleTable.style('displayNone', () => `display:none;`)}"
    >
        ${children}
    </div>`;
}

function defaultGetSprite(gfxFiles: string[]) {
    return (sprite: string) => {
        return getSpriteByGfxName(sprite, gfxFiles);
    };
}
