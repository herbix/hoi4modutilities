import * as vscode from 'vscode';
import * as path from 'path';
import { getFocusTree, FocusTree, Focus } from '../../hoiformat/focustree';
import { parseHoi4File } from '../../hoiformat/hoiparser';
import { getFocusIcon } from '../../util/imagecache';
import { contextContainer } from '../../context';
import { localize } from '../../util/i18n';
import { arrayToMap } from '../../util/common';
import { GridBoxType, HOIPartial, toNumberLike, toStringAsSymbol } from '../../hoiformat/schema';
import { renderGridBox, GridBoxItem, GridBoxConnection } from '../../util/html/gridbox';

export async function renderFocusTreeFile(fileContent: string, uri: vscode.Uri, webview: vscode.Webview): Promise<string> {
    let baseContent = '';
    try {
        const focustrees = getFocusTree(parseHoi4File(fileContent));
        if (focustrees.length > 0) {
            baseContent = await renderFocusTree(focustrees[0]);
        } else {
            baseContent = localize('focustree.nofocustree', 'No focus tree.');
        }
    } catch (e) {
        baseContent = `${localize('error', 'Error')}: <br/>  <pre>${e.toString()}</pre>`;
    }

    return `<!doctype html>
    <html>
    <body>
    <script>
        window.previewedFileUri = "${uri.toString()}";
    </script>
    ${baseContent}
    <script src="${webview.asWebviewUri(vscode.Uri.file(path.join(contextContainer.current?.extensionPath || '', 'static/common.js')))}">
    </script>
    <script src="${webview.asWebviewUri(vscode.Uri.file(path.join(contextContainer.current?.extensionPath || '', 'static/focustree.js')))}">
    </script>
    </body>
    </html>`;
}


const leftPaddingBase = 30;
const topPaddingBase = 30;
const rightPadding = 30;
const bottomPadding = 30;
const xGridSize = 90;
const yGridSize = 120;
const xItemSize = 100;
const yItemSize = 100;
const optionHeight = 20;

async function renderFocusTree(focustree: FocusTree): Promise<string> {
    const focuses = Object.values(focustree.focuses);
    const minX = focuses.reduce((p, c) => p > c.x ? c.x : p, 1000);
    const leftPadding = leftPaddingBase - minX * xGridSize;
    const topPadding = focustree.allowBranchOptions.length * optionHeight + topPaddingBase;

    const gridBox: HOIPartial<GridBoxType> = {
        position: { x: toNumberLike(leftPadding), y: toNumberLike(topPadding) },
        format: toStringAsSymbol('up'),
        size: { width: toNumberLike(xGridSize), height: undefined },
        slotsize: { width: toNumberLike(xGridSize), height: toNumberLike(yGridSize) },
    } as HOIPartial<GridBoxType>;

    return (
        focustree.allowBranchOptions.map((option, index) => renderAllowBranchOptions(option, index)).join('') +
        await renderGridBox(gridBox, {
            size: { width: 0, height: 0 },
            orientation: 'upper_left'
        }, {
            items: arrayToMap(focuses.map(focus => focusToGridItem(focus, focustree)), 'id'),
            onRenderItem: item => renderFocus(focustree.focuses[item.id]),
            cornerPosition: 0.5,
        })
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
            const classNames2 = fp.inAllowBranch.map(v => 'inbranch_' + v).join(' ');
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
        const classNames2 = fe.inAllowBranch.map(v => 'inbranch_' + v).join(' ');
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


function renderAllowBranchOptions(option: string, index: number): string {
    return `<div style="
        position: fixed;
        left: ${leftPaddingBase}px;
        top: ${10 + index * optionHeight}px;
        z-index: 100;
    ">
        <input type="checkbox" checked="true" id="inbranch_${option}" onchange="hoi4mu.ft.showBranch(this.checked, 'inbranch_${option}')"/>
        <label for="inbranch_${option}">${option}</label>
        <a style="display:inline" onClick="hoi4mu.ft.gotoFocus('focus_${option}')" href="javascript:;">Goto</a>
    </div>`;
}

async function renderFocus(focus: Focus): Promise<string> {
    const icon = focus.icon ? await getFocusIcon(focus.icon) : null;

    return `<div
    title="${focus.id}\n(${focus.x}, ${focus.y})"
    style="
        ${icon ? `background-image: url(${icon?.uri});` : 'background: grey;'}
        background-position: center;
        background-repeat: no-repeat;
        background-size: ${icon ? icon.width: 0}px;
        width: 100%;
        height: 100%;
        text-align: center;
        cursor: pointer;
    "
    onClick="hoi4mu.navigateText(${focus.token?.start}, ${focus.token?.end})">
        <span
        style="
            margin: 10px -400px;
            text-align: center;
            display: inline-block;
            ">${focus.id}
        </span>
    </div>`;
}
