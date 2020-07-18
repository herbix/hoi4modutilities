import * as vscode from 'vscode';
import * as fs from 'fs';
import { ddsToPng } from './util/image/converter';
import { PNG } from 'pngjs';
import { localize } from './util/i18n';
import { DDS } from './util/image/dds';
import { html, htmlEscape } from './util/html';
import { StyleTable } from './util/styletable';
import { sendEvent } from './util/telemetry';
import { ensureFileScheme } from './util/vsccommon';

export class DDSViewProvider /* implements vscode.CustomEditorProvider */ {
    public async openCustomDocument(uri: vscode.Uri) {
        // Don't try opening it as text
        return { uri, dispose: () => { } };
    }

    public async resolveCustomEditor(document: { uri: vscode.Uri }, webviewPanel: vscode.WebviewPanel, token: vscode.CancellationToken): Promise<void> {
        try {
            sendEvent('preview.dds');
            ensureFileScheme(document.uri);

            const buffer = await Promise.race([
                fs.promises.readFile(document.uri.fsPath),
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
