import * as vscode from 'vscode';
import * as path from 'path';
import { debounce } from 'lodash';
import { parseHoi4File } from './hoiparser';
import { getFocusTree, FocusTree, Focus } from './focustree';
import { getFocusIcon } from './imagecache';

interface PreviewMeta {
    uri: vscode.Uri;
    panel: vscode.WebviewPanel;
}

class PreviewManager {
    private _previews: Record<string, PreviewMeta> = {};

    public showPreview(uri: vscode.Uri): void {
        const document = vscode.workspace.textDocuments.find(document => document.uri.toString() === uri.toString());
        if (document === undefined) {
            vscode.window.showErrorMessage(`Can't find opened document ${uri.fsPath}`);
            return;
        }

        const key = uri.toString();
        if (key in this._previews) {
            this._previews[key].panel.reveal();
            return;
        }

		const filename = path.basename(uri.path);
		const panel = vscode.window.createWebviewPanel(
			'hoi4ftpreview',
			'Preview: ' + filename,
			vscode.ViewColumn.Two,
			{
                enableScripts: true
            }
		);

        panel.webview.html = getHtmlFromFocusFile(document.getText());
        panel.onDidDispose(() => {
            delete this._previews[key];
        });
        panel.webview.onDidReceiveMessage((msg) => {
            if (msg.command === 'navigate' && msg.start !== undefined) {
                vscode.window.showTextDocument(document, {
                    selection: new vscode.Range(document.positionAt(msg.start), document.positionAt(msg.end)),
                    viewColumn: vscode.ViewColumn.One
                });
            }
        });

        this._previews[key] = { panel, uri };
    }

	public onCloseTextDocument(document: vscode.TextDocument): void {
        const key = document.uri.toString();
        this._previews[key]?.panel.dispose();
    }
    
	public onChangeTextDocument(e: vscode.TextDocumentChangeEvent): void {
        const document = e.document;
        const key = document.uri.toString();
        const panel = this._previews[key]?.panel;
        if (panel === undefined) {
            return;
        }

        debuncedGetHtmlFromFocusFile(() => document.getText(), html => {
            const panel = this._previews[key]?.panel;
            if (panel !== undefined) {
                panel.webview.html = html;
            }
        });
	}
}

export const previewManager = new PreviewManager();

function getHtmlFromFocusFile(fileContent: string): string {
    try {
        const focustrees = getFocusTree(parseHoi4File(fileContent));
        if (focustrees.length > 0) {
            return focusTreeToHtml(focustrees[0]);
        } else {
            return 'No focus tree.';
        }
    } catch (e) {
        return "Error: <br/>  <pre>" + e.toString() + "</pre>";
    }
}

const debuncedGetHtmlFromFocusFile = debounce(
    (getter: () => string, callback: (string: string) => void) =>
        callback(getHtmlFromFocusFile(getter())),
    1000,
    { trailing: true });

const leftPaddingBase = 30;
let leftPadding = 30;
const topPadding = 30;
const rightPadding = 30;
const bottomPadding = 30;
const xGrid = 90;
const yGrid = 120;
const xSize = 50;
const ySize = 50;

function focusTreeToHtml(focustree: FocusTree): string {
    const divs: string[] = [];

    let right = 0;
    let bottom = 0;

    let minX = 0;
    
    for (const focus of Object.values(focustree.focuses)) {
        if (focus.x < minX) {
            minX = focus.x;
        }
    }

    leftPadding = leftPaddingBase - minX * xGrid;

    for (const focus of Object.values(focustree.focuses)) {
        const width = focus.icon ? xSize * 2 : xSize;
        const height = focus.icon ? ySize * 2 : ySize;
        const x = focus.x * xGrid + leftPadding + (xGrid - width) / 2;
        const y = focus.y * yGrid + topPadding + (yGrid - height) / 2;
        if ((focus.x + 1) * xGrid > right) {
            right = (focus.x + 1) * xGrid;
        }
        if ((focus.y + 1) * yGrid > bottom) {
            bottom = (focus.y + 1) * yGrid;
        }
        const icon = focus.icon ? getFocusIcon(focus.icon) : null;

        divs.push(`<div
            title="${focus.id}"
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
                z-index: 100;
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
            if (prerequisites.length > 1) {
                prerequisites.forEach(p => {
                    divs.push(htmlLineBetweenFocus(focus, focustree.focuses[p], "1px dashed #88aaff"));
                });
            } else {
                prerequisites.forEach(p => {
                    divs.push(htmlLineBetweenFocus(focus, focustree.focuses[p], "1px solid #88aaff"));
                });
            }
        }

        focus.exclusive.forEach(e => {
            divs.push(htmlLineBetweenFocus(focus, focustree.focuses[e], "1px solid red"));
        });
    }

    return `<div style="
            width:${right + leftPadding + rightPadding};
            height:${bottom + topPadding + bottomPadding};
        ">${divs.join('')}</div>
        <script>
            const vscode = acquireVsCodeApi();
            function navigateText(start, end) {
                vscode.postMessage({
                    command: 'navigate',
                    start: start,
                    end: end
                });
            }
        </script>`;
}

function htmlLineBetweenFocus(a: Focus, b: Focus, style: string): string {
    if (a.y === b.y) {
        return `<div
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
