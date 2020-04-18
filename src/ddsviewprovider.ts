import * as vscode from 'vscode';
import * as fs from 'fs';
import { parseDds } from './util/image/ddsparser';
import { ddsToPng } from './util/image/converter';
import { PNG } from 'pngjs';
import { localize } from './util/i18n';

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

            const dds = parseDds(buffer.buffer);
            const png = ddsToPng(dds);
            const pngBuffer = PNG.sync.write(png);
            webviewPanel.webview.html = `<img src="data:image/png;base64,${pngBuffer.toString('base64')}"/>`;
        } catch (e) {
            webviewPanel.webview.html = `${localize('error', 'Error')}: <br/>  <pre>${e.toString()}</pre>`;
        }
    }
}
