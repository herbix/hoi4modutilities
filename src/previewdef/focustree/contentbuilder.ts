import * as vscode from 'vscode';
import {FocusTree, Focus} from './schema';
import {getSpriteByGfxName, Image, getImageByPath} from '../../util/image/imagecache';
import {localize, i18nTableAsScript} from '../../util/i18n';
import {forceError, randomString} from '../../util/common';
import {HOIPartial, toNumberLike, toStringAsSymbolIgnoreCase} from '../../hoiformat/schema';
import {html, htmlEscape} from '../../util/html';
import {GridBoxType} from '../../hoiformat/gui';
import {FocusTreeLoader} from './loader';
import {LoaderSession} from '../../util/loader/loader';
import {debug} from '../../util/debug';
import {StyleTable, normalizeForStyle} from '../../util/styletable';
import {localisationIndex, useConditionInFocus} from '../../util/featureflags';
import {flatMap} from 'lodash';
import {getLocalisedTextQuick} from "../../util/localisationIndex";

const defaultFocusIcon = 'gfx/interface/goals/goal_unknown.dds';

export async function renderFocusTreeFile(loader: FocusTreeLoader, uri: vscode.Uri, webview: vscode.Webview): Promise<string> {
    const setPreviewFileUriScript = {content: `window.previewedFileUri = "${uri.toString()}";`};

    try {
        const session = new LoaderSession(false);
        const loadResult = await loader.load(session);
        const loadedLoaders = Array.from((session as any).loadedLoader).map<string>(v => (v as any).toString());
        debug('Loader session focus tree', loadedLoaders);

        const focustrees = loadResult.result.focusTrees;

        if (focustrees.length === 0) {
            const baseContent = localize('focustree.nofocustree', 'No focus tree.');
            return html(webview, baseContent, [setPreviewFileUriScript], []);
        }

        const styleTable = new StyleTable();
        const jsCodes: string[] = [];
        const styleNonce = randomString(32);
        const baseContent = await renderFocusTrees(focustrees, styleTable, loadResult.result.gfxFiles, jsCodes, styleNonce, loader.file);
        jsCodes.push(i18nTableAsScript());

        return html(
            webview,
            baseContent,
            [
                setPreviewFileUriScript,
                ...jsCodes.map(c => ({content: c})),
                'common.js',
                'focustree.js',
            ],
            [
                'codicon.css',
                'common.css',
                styleTable,
                {nonce: styleNonce},
            ],
        );

    } catch (e) {
        const baseContent = `${localize('error', 'Error')}: <br/>  <pre>${htmlEscape(forceError(e).toString())}</pre>`;
        return html(webview, baseContent, [setPreviewFileUriScript], []);
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
        position: {x: toNumberLike(leftPadding), y: toNumberLike(topPadding)},
        format: toStringAsSymbolIgnoreCase('up'),
        size: {width: toNumberLike(xGridSize), height: undefined},
        slotsize: {width: toNumberLike(xGridSize), height: toNumberLike(yGridSize)},
    } as HOIPartial<GridBoxType>;

    const renderedFocus: Record<string, string> = {};
    await Promise.all(flatMap(focusTrees, tree => Object.values(tree.focuses)).map(async (focus) =>
        renderedFocus[focus.id] = (await renderFocus(focus, styleTable, gfxFiles, file)).replace(/\s\s+/g, ' ')));

    jsCodes.push('window.focusTrees = ' + JSON.stringify(focusTrees));
    jsCodes.push('window.renderedFocus = ' + JSON.stringify(renderedFocus));
    jsCodes.push('window.gridBox = ' + JSON.stringify(gridBox));
    jsCodes.push('window.styleNonce = ' + JSON.stringify(styleNonce));
    jsCodes.push('window.useConditionInFocus = ' + useConditionInFocus);
    jsCodes.push('window.xGridSize = ' + xGridSize);

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
        `<div id="dragger" class="${styleTable.oneTimeStyle('dragger', () => `
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
            ${focuses}
            ${searchbox}
            ${useConditionInFocus ? conditions : allowbranch}
            ${warningsButton}
        </div>
    </div>`;
}

async function renderFocus(focus: Focus, styleTable: StyleTable, gfxFiles: string[], file: string): Promise<string> {
    for (const focusIcon of focus.icon) {
        const iconName = focusIcon.icon;
        const iconObject = iconName ? await getFocusIcon(iconName, gfxFiles) : null;
        styleTable.style('focus-icon-' + normalizeForStyle(iconName ?? '-empty'), () =>
            `${iconObject ? `background-image: url(${iconObject.uri});` : 'background: grey;'}
            background-size: ${iconObject ? iconObject.width : 0}px;`
        );
    }

    styleTable.style('focus-icon-' + normalizeForStyle('-empty'), () => 'background: grey;');

    let textContent = focus.id;
    if (localisationIndex){
        let localizedText = await getLocalisedTextQuick(focus.id);
        if (localizedText === focus.id || !localizedText){
            if (focus.text){
                localizedText = await getLocalisedTextQuick(focus.text);
                if (localizedText !== focus.text && localizedText != null){
                    textContent += `<br/>${localizedText}`;
                }
            }
        }else {
            textContent += `<br/>${localizedText}`;
        }
    }

    return `<div
    class="
        navigator
        {{iconClass}}
        ${styleTable.style('focus-common', () => `
            background-position-x: center;
            background-position-y: calc(50% - 18px);
            background-repeat: no-repeat;
            width: 100%;
            height: 100%;
            text-align: center;
            cursor: pointer;
        `)}
    "
    start="${focus.token?.start}"
    end="${focus.token?.end}"
    ${file === focus.file ? '' : `file="${focus.file}"`}
    title="${focus.id}\n({{position}})">
        <div class="focus-checkbox ${styleTable.style('focus-checkbox', () => `position: absolute; top: 1px;`)}">
            <input id="checkbox-${normalizeForStyle(focus.id)}" type="checkbox"/>
        </div>
        <span
        class="${styleTable.style('focus-span', () => `
            margin: 10px -400px;
            margin-top: 85px;
            text-align: center;
            display: inline-block;
        `)}">
        ${textContent}
        </span>
    </div>`;
}

export async function getFocusIcon(name: string, gfxFiles: string[]): Promise<Image | undefined> {
    const sprite = await getSpriteByGfxName(name, gfxFiles);
    if (sprite !== undefined) {
        return sprite.image;
    }

    return await getImageByPath(defaultFocusIcon);
}
