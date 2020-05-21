import * as vscode from 'vscode';
import * as fs from 'fs';
import { ddsToPng } from './util/image/converter';
import { PNG } from 'pngjs';
import { localize } from './util/i18n';
import { DDS } from './util/image/dds';
import { html, StyleTable, htmlEscape } from './util/html';

export class DDSViewProvider /* implements vscode.CustomEditorProvider */ {
	public async openCustomDocument(uri: vscode.Uri) {
        // Don't try opening it as text
		return { uri, dispose: () => { } };
    }

    public async resolveCustomEditor(document: { uri: vscode.Uri }, webviewPanel: vscode.WebviewPanel, token: vscode.CancellationToken): Promise<void> {
        try {
            const buffer = await Promise.race([
                new Promise<Buffer>((resolve, reject) => fs.readFile(document.uri.fsPath, (error, data) => error ? reject(error) : resolve(data))),
                new Promise<null>(resolve => token.onCancellationRequested(resolve)),
            ]);

            if (buffer === null) {
                return;
            }

            const dds = DDS.parse(buffer.buffer);
            const png = ddsToPng(dds);
            const pngBuffer = PNG.sync.write(png);
            const styleTable = new StyleTable();

            webviewPanel.webview.html = html(
                webviewPanel.webview,
                `<div class="${styleTable.oneTimeStyle('imagePreview', () => `width:${png.width}px;height:${png.height}px;`)}">
                    <img src="data:image/png;base64,${pngBuffer.toString('base64')}"/>
                </div>`,
                [],
                [styleTable]
            );
        } catch (e) {
            webviewPanel.webview.html = `${localize('error', 'Error')}: <br/>  <pre>${htmlEscape(e.toString())}</pre>`;
        }
    }
}
