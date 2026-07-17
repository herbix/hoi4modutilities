import * as vscode from 'vscode';
import { FocusTree, Focus } from './schema';
import { getSpriteByGfxName, Image, getImageByPath } from '../../util/image/imagecache';
import { localize, i18nTableAsScript } from '../../util/i18n';
import { forceError, randomString } from '../../util/common';
import { HOIPartial, toNumberLike, toStringAsSymbolIgnoreCase } from '../../hoiformat/schema';
import { html, htmlEscape } from '../../util/html';
import { GridBoxType } from '../../hoiformat/gui';
import { FocusTreeLoader } from './loader';
import { LoaderSession } from '../../util/loader/loader';
import { debug } from '../../util/debug';
import { StyleTable, normalizeForStyle } from '../../util/styletable';
import { featureFlagsAsScript, isFeatureEnabled } from '../../util/featureflags';
import { flatMap } from 'lodash';
import { getLocalisedTextQuick } from "../../util/localisationIndex";

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
        const baseContent = await renderFocusTrees(focustrees, styleTable, loadResult.result.gfxFiles, jsCodes, styleNonce, loader.file);
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
const xGridSize = 96;
const yGridSize = 130;

async function renderFocusTrees(focusTrees: FocusTree[], styleTable: StyleTable, gfxFiles: string[], jsCodes: string[], styleNonce: string, file: string): Promise<string> {
    const leftPadding = leftPaddingBase;
    const topPadding = topPaddingBase;

    const gridBox: HOIPartial<GridBoxType> = {
        position: { x: toNumberLike(leftPadding), y: toNumberLike(topPadding) },
        format: toStringAsSymbolIgnoreCase('up'),
        size: { width: toNumberLike(xGridSize), height: undefined },
        slotsize: { width: toNumberLike(xGridSize), height: toNumberLike(yGridSize) },
    } as HOIPartial<GridBoxType>;

    const renderedFocus: Record<string, string> = {};
    await Promise.all(flatMap(focusTrees, tree => Object.values(tree.focuses)).map(async (focus) =>
        renderedFocus[focus.id] = (await renderFocus(focus, styleTable, gfxFiles, file)).replace(/\s\s+/g, ' ')));

    jsCodes.push('window.focusTrees = ' + JSON.stringify(focusTrees));
    jsCodes.push('window.renderedFocus = ' + JSON.stringify(renderedFocus));
    jsCodes.push('window.gridBox = ' + JSON.stringify(gridBox));
    jsCodes.push('window.styleNonce = ' + JSON.stringify(styleNonce));
    jsCodes.push('window.xGridSize = ' + xGridSize);
    jsCodes.push('window.yGridSize = ' + yGridSize);

    const continuousFocusContent =
        `<div id="continuousFocuses" class="${styleTable.oneTimeStyle('continuousFocuses', () => `
            position: absolute;
            width: 770px;
            height: 380px;
            margin: 20px;
            background: rgba(128, 128, 128, 0.2);
            text-align: center;
            pointer-events: none;
        `)}">Continuous focuses</div>`;

    return (
        `<div id="dragger" additionalDraggerHostId="focustreecontent" class="${styleTable.oneTimeStyle('dragger', () => `
            width: 100vw;
            height: 100vh;
            position: fixed;
            left:0;
            top:0;
        `)}"></div>` +
        `<div id="focustreecontent" class="${styleTable.oneTimeStyle('focustreecontent', () => `top:40px;left:-20px;position:relative`)}">
            <div id="focustreeplaceholder"></div>
            ${continuousFocusContent}
        </div>` +
        renderWarningContainer(styleTable) +
        renderToolBar(focusTrees, styleTable)
    );
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
        padding-top: 40px;
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

function renderToolBar(focusTrees: FocusTree[], styleTable: StyleTable): string {
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
                <div id="conditions" class="select multiple-select" tabindex="0" role="combobox" class="${styleTable.style('conditionsLabel', () => `max-width:400px`)}">
                    <span class="value"></span>
                </div>
            </div>
        </div>`;
    
    const warningsButton = focusTrees.every(ft => ft.warnings.length === 0) ? '' : `
        <button id="show-warnings" title="${localize('focustree.warnings', 'Toggle warnings')}">
            <i class="codicon codicon-warning"></i>
        </button>`;

    return `<div class="toolbar-outer ${styleTable.style('toolbar-height', () => `box-sizing: border-box; height: 40px;`)}">
        <div class="toolbar">
            ${isFeatureEnabled('localisationIndex') ? renderPreviewLabelModeControl(styleTable) : ''}
            ${focuses}
            ${searchbox}
            ${isFeatureEnabled('useConditionInFocus') ? conditions : allowbranch}
            ${warningsButton}
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

async function renderFocus(focus: Focus, styleTable: StyleTable, gfxFiles: string[], file: string): Promise<string> {
    for (const focusIcon of focus.icon) {
        const iconName = focusIcon.icon;
        const iconSprite = iconName ? await getSpriteByGfxName(iconName, gfxFiles) : undefined;
        const iconObject = iconSprite?.image ?? (iconName ? await getImageByPath(defaultFocusIcon) : null);
        focusIcon.size = iconSprite ? { width: iconSprite.image.width, height: iconSprite.image.height } : undefined;
        styleTable.style('focus-icon-' + normalizeForStyle(iconName ?? '-empty'), () => 
            `${iconObject ? `background-image: url(${iconObject.uri});` : 'background: grey;'}
            background-size: ${iconObject ? iconObject.width: 0}px;`
        );
    }
    
    styleTable.style('focus-icon-' + normalizeForStyle('-empty'), () => 'background: grey;');

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

    const localisedText = await getFocusLocalisedText(focus);
    const textContent = htmlEscape(focus.id);
    const labelAttributes = getPreviewLabelAttributes(focus.id, localisedText);
    const titleAttributes = getPreviewTitleAttributes(focus.id, localisedText, '{{position}}');

    return `<div
    class="
        navigator
        {{iconClass}}
        ${styleTable.style('focus-common', () => `
            background-position-x: center;
            background-position-y: top;
            background-repeat: no-repeat;
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

async function getFocusLocalisedText(focus: Focus): Promise<string | undefined> {
    let localisedText = await getLocalisedTextQuick(focus.id);
    if (localisedText && localisedText !== focus.id) {
        return localisedText;
    }

    if (focus.text) {
        localisedText = await getLocalisedTextQuick(focus.text);
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
