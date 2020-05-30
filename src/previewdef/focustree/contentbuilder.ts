import * as vscode from 'vscode';
import { FocusTree, Focus } from './schema';
import { getSpriteByGfxName, Image, getImageByPath } from '../../util/image/imagecache';
import { localize } from '../../util/i18n';
import { arrayToMap } from '../../util/common';
import { HOIPartial, toNumberLike, toStringAsSymbolIgnoreCase } from '../../hoiformat/schema';
import { renderGridBox, GridBoxItem, GridBoxConnection } from '../../util/hoi4gui/gridbox';
import { html, StyleTable, htmlEscape } from '../../util/html';
import { GridBoxType } from '../../hoiformat/gui';
import { FocusTreeLoader } from './loader';
import { LoaderSession } from '../../util/loader';
import { debug } from '../../util/debug';

const defaultFocusIcon = 'gfx/interface/goals/goal_unknown.dds';

export async function renderFocusTreeFile(loader: FocusTreeLoader, uri: vscode.Uri, webview: vscode.Webview): Promise<string> {
    const styleTable = new StyleTable();
    let baseContent = '';
    try {
        const session = new LoaderSession(false);
        const loadResult = await loader.load(session);
        const loadedLoaders = Array.from((session as any).loadedLoader).map<string>(v => (v as any).toString());
        debug('Loader session focus tree', loadedLoaders);

        const focustrees = loadResult.result.focusTrees;
        if (focustrees.length > 0) {
            baseContent = await renderFocusTree(focustrees[0], styleTable, loadResult.result.gfxFiles);
        } else {
            baseContent = localize('focustree.nofocustree', 'No focus tree.');
        }
    } catch (e) {
        baseContent = `${localize('error', 'Error')}: <br/>  <pre>${htmlEscape(e.toString())}</pre>`;
    }

    return html(
        webview,
        baseContent,
        [
            { content: `window.previewedFileUri = "${uri.toString()}";` },
            'focustree.js',
        ],
        [
            'common.css',
            styleTable,
        ],
    );
}


const leftPaddingBase = 50;
const topPaddingBase = 50;
const xGridSize = 96;
const yGridSize = 130;
const optionHeight = 20;

async function renderFocusTree(focustree: FocusTree, styleTable: StyleTable, gfxFiles: string[]): Promise<string> {
    const focuses = Object.values(focustree.focuses);
    const minX = focuses.reduce((p, c) => p > c.x ? c.x : p, 0);
    const leftPadding = leftPaddingBase - minX * xGridSize;
    const topPadding = focustree.allowBranchOptions.length * optionHeight + topPaddingBase;

    const gridBox: HOIPartial<GridBoxType> = {
        position: { x: toNumberLike(leftPadding), y: toNumberLike(topPadding) },
        format: toStringAsSymbolIgnoreCase('up'),
        size: { width: toNumberLike(xGridSize), height: undefined },
        slotsize: { width: toNumberLike(xGridSize), height: toNumberLike(yGridSize) },
    } as HOIPartial<GridBoxType>;

    return (
        `<div id="dragger" class="${styleTable.oneTimeStyle('dragger', () => `
            width: 100vw;
            height: 100vh;
            position: fixed;
            left:0;
            top:0;
        `)}"></div>` +
        focustree.allowBranchOptions.map((option, index) => renderAllowBranchOptions(option, index, styleTable)).join('') +
        await renderGridBox(gridBox, {
            size: { width: 0, height: 0 },
            orientation: 'upper_left'
        }, {
            styleTable,
            items: arrayToMap(focuses.map(focus => focusToGridItem(focus, focustree)), 'id'),
            onRenderItem: item => renderFocus(focustree.focuses[item.id], styleTable, gfxFiles),
            cornerPosition: 0.5,
        }) +
        (focustree.continuousFocusPositionX !== undefined && focustree.continuousFocusPositionY !== undefined ?
        `<div class="${styleTable.oneTimeStyle('continuousFocuses', () => `
            position: absolute;
            width: 770px;
            height: 380px;
            left: ${focustree.continuousFocusPositionX}px;
            top: ${focustree.continuousFocusPositionY}px;
            margin: 20px;
            background: rgba(128, 128, 128, 0.2);
            text-align: center;
            pointer-events: none;
        `)}">Continuous focuses</div>` : '')
    );
}

function focusToGridItem(focus: Focus, focustree: FocusTree): GridBoxItem {
    const classNames = focus.inAllowBranch.map(v => 'inbranch_' + v).join(' ');
    const connections: GridBoxConnection[] = [];
    
    for (const prerequisites of focus.prerequisite) {
        let style: string;
        if (prerequisites.length > 1) {
            style = "1px dashed #88aaff";
        } else {
            style = "1px solid #88aaff";
        }

        prerequisites.forEach(p => {
            const fp = focustree.focuses[p];
            const classNames2 = fp?.inAllowBranch.map(v => 'inbranch_' + v).join(' ') ?? '';
            connections.push({
                target: p,
                targetType: 'parent',
                style: style,
                classNames: classNames + ' ' + classNames2,
            });
        });
    }

    focus.exclusive.forEach(e => {
        const fe = focustree.focuses[e];
        const classNames2 = fe?.inAllowBranch.map(v => 'inbranch_' + v).join(' ') ?? '';
        connections.push({
            target: e,
            targetType: 'related',
            style: "1px solid red",
            classNames: classNames + ' ' + classNames2,
        });
    });

    return {
        id: focus.id,
        htmlId: 'focus_' + focus.id,
        classNames,
        gridX: focus.x,
        gridY: focus.y,
        connections,
    };
}


function renderAllowBranchOptions(option: string, index: number, styleTable: StyleTable): string {
    return `<div class="${styleTable.oneTimeStyle('allowBranchOptions', () => `
        position: fixed;
        left: ${leftPaddingBase}px;
        top: ${10 + index * optionHeight}px;
        z-index: 100;
    `)}">
        <input type="checkbox" checked="true" id="inbranch_${option}" class="inbranch-checkbox"/>
        <label for="inbranch_${option}">${option}</label>
        <a class="gotofocus-button ${styleTable.style('displayInline', () => `display:inline;`)}" focus="focus_${option}" href="javascript:;">Goto</a>
    </div>`;
}

async function renderFocus(focus: Focus, styleTable: StyleTable, gfxFiles: string[]): Promise<string> {
    const icon = focus.icon ? await getFocusIcon(focus.icon, gfxFiles) : null;

    return `<div
    class="
        navigator
        ${styleTable.oneTimeStyle('focus', () => `
            ${icon ? `background-image: url(${icon?.uri});` : 'background: grey;'}
            background-size: ${icon ? icon.width: 0}px;
        `)}
        ${styleTable.style('focus-common', () => `
            background-position: center;
            background-repeat: no-repeat;
            width: 100%;
            height: 100%;
            text-align: center;
            cursor: pointer;
        `)}
    "
    start="${focus.token?.start}"
    end="${focus.token?.end}"
    title="${focus.id}\n(${focus.x}, ${focus.y})">
        <span
        class="${styleTable.style('focus-span', () => `
            margin: 10px -400px;
            text-align: center;
            display: inline-block;
        `)}">${focus.id}
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
