import * as vscode from 'vscode';
import * as path from 'path';
import { getFocusTree, FocusTree, Focus } from '../hoiformat/focustree';
import { parseHoi4File } from '../hoiformat/hoiparser';
import { getFocusIcon } from '../util/imagecache';
import { contextContainer } from '../context';

export async function getHtmlFromFocusFile(fileContent: string, uri: vscode.Uri, webview: vscode.Webview): Promise<string> {
    let baseContent = '';
    try {
        const focustrees = getFocusTree(parseHoi4File(fileContent));
        if (focustrees.length > 0) {
            baseContent = focusTreeToHtml(focustrees[0], webview);
        } else {
            baseContent = 'No focus tree.';
        }
    } catch (e) {
        baseContent = "Error: <br/>  <pre>" + e.toString() + "</pre>";
    }

    return `<!doctype html>
    <html>
    <body>
    <script>
        window.previewedFileUri = "${uri.toString()}";
    </script>
    ${baseContent}
    </body>
    </html>`;
}

const leftPaddingBase = 30;
const topPaddingBase = 30;
let leftPadding = 30;
let topPadding = 30;
const rightPadding = 30;
const bottomPadding = 30;
const xGrid = 90;
const yGrid = 120;
const xSize = 50;
const ySize = 50;
const optionHeight = 20;

function focusTreeToHtml(focustree: FocusTree, webview: vscode.Webview): string {
    const focuses = Object.values(focustree.focuses);

    const minX = focuses.reduce((p, c) => p > c.x ? c.x : p, 1000);
    leftPadding = leftPaddingBase - minX * xGrid;
    topPadding = focustree.allowBranchOptions.length * optionHeight + topPaddingBase;
    
    const right = focuses.map(f => (f.x + 1) * xGrid).reduce((p, c) => p < c ? c : p, 0);
    const bottom = focuses.map(f => (f.y + 1) * yGrid).reduce((p, c) => p < c ? c : p, 0);

    return (
        `<div style="
            width:${right + leftPadding + rightPadding}px;
            height:${bottom + topPadding + bottomPadding}px;
        ">
            ${focustree.allowBranchOptions.map((option, index) => allowBranchOptionToHtml(option, index)).join('')}
            ${focuses.map(focus => focusToHtml(focus, focustree)).join('')}
        </div>
        <script src="${webview.asWebviewUri(vscode.Uri.file(path.join(contextContainer.current?.extensionPath || '', 'static/focustree.js')))}" />`
    );
}

function allowBranchOptionToHtml(option: string, index: number): string {
    return `<div style="
        position: fixed;
        left: ${leftPaddingBase}px;
        top: ${10 + index * optionHeight}px;
        z-index: 100;
    ">
        <input type="checkbox" checked="true" id="checkbox_${option}" onchange="showBranch(this.checked, 'inbranch_${option}')"/>
        <label for="checkbox_${option}">${option}</label>
        <a style="display:inline" onClick="gotoFocus('focus_${option}')" href="javascript:;">Goto</a>
    </div>`;
}

function focusToHtml(focus: Focus, focustree: FocusTree): string {
    const divs = [];

    const width = focus.icon ? xSize * 2 : xSize;
    const height = focus.icon ? ySize * 2 : ySize;
    const x = focus.x * xGrid + leftPadding + (xGrid - width) / 2;
    const y = focus.y * yGrid + topPadding + (yGrid - height) / 2;
    const icon = focus.icon ? getFocusIcon(focus.icon) : null;
    const classNames = focus.inAllowBranch.map(v => 'inbranch_' + v).join(' ');

    divs.push(`<div
        id="focus_${focus.id}"
        class="${classNames}"
        title="${focus.id}\n(${focus.x}, ${focus.y})"
        style="
            ${focus.icon ? `background-image: url(${icon?.uri});` : 'background: grey;'}
            background-position: center;
            background-repeat: no-repeat;
            background-size: ${icon ? icon.width: 0}px;
            position:absolute;
            left: ${x}px;
            top: ${y}px;
            width: ${width}px;
            height: ${height}px;
            z-index: 50;
            text-align: center;
            vertical-align: bottom;
            cursor: pointer;
        "
        onClick="navigateText(${focus.token?.start}, ${focus.token ? focus.token.start + focus.token.length : undefined})">
            <span
            style="
                margin: 0 -400px;
                height: ${height}px;
                text-align: center;
                ">${focus.id}
            </span>
        </div>`);
    
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
            divs.push(htmlLineBetweenFocus(focus, fp, style, classNames + ' ' + classNames2));
        });
    }

    focus.exclusive.forEach(e => {
        const fe = focustree.focuses[e];
        const classNames2 = fe.inAllowBranch.map(v => 'inbranch_' + v).join(' ');
        divs.push(htmlLineBetweenFocus(focus, fe, "1px solid red", classNames + ' ' + classNames2));
    });

    return divs.join('');
}

function htmlLineBetweenFocus(a: Focus, b: Focus, style: string, classNames: string = ''): string {
    if (a.y === b.y) {
        return `<div
            class="${classNames}"
            style="
                position:absolute;
                left: ${(0.5 + Math.min(a.x, b.x)) * xGrid + leftPadding}px;
                top: ${(0.5 + a.y) * yGrid + topPadding}px;
                width: ${Math.abs(a.x - b.x) * xGrid}px;
                height: ${1}px;
                z-index: 10;
                border-top: ${style};
            "></div>`;
    }
    if (a.x === b.x) {
        return `<div
            class="${classNames}"
            style="
                position:absolute;
                left: ${(0.5 + a.x) * xGrid + leftPadding}px;
                top: ${(0.5 + Math.min(a.y, b.y)) * yGrid + topPadding}px;
                width: ${1}px;
                height: ${Math.abs(a.y - b.y) * yGrid}px;
                z-index: 10;
                border-left: ${style};
            "></div>`;
    }

    if (a.x > b.x) {
        const c = a;
        a = b;
        b = c;
    }

    return `<div
        class="${classNames}"
        style="
            position:absolute;
            left: ${(0.5 + a.x) * xGrid + leftPadding}px;
            top: ${(0.5 + Math.min(a.y, b.y)) * yGrid + topPadding}px;
            width: ${Math.abs(a.x - b.x) * xGrid}px;
            height: ${0.5 * yGrid}px;
            z-index: 10;
            border-bottom: ${style};
            ${a.y < b.y ? 'border-left' : 'border-right'}: ${style};
        "></div>
        <div
        class="${classNames}"
        style="
            position:absolute;
            left: ${(0.5 + a.x) * xGrid + leftPadding}px;
            top: ${(1 + Math.min(a.y, b.y)) * yGrid + topPadding}px;
            width: ${Math.abs(a.x - b.x) * xGrid}px;
            height: ${(Math.abs(a.y - b.y) - 0.5) * yGrid}px;
            z-index: 10;
            ${a.y > b.y ? 'border-left' : 'border-right'}: ${style};
        "></div>`;
}
