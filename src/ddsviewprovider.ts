import * as vscode from 'vscode';
import { ddsToPng, tgaToPng } from './util/image/converter';
import { PNG } from 'pngjs';
import { localize } from './util/i18n';
import { DDS } from './util/image/dds';
import { html, htmlEscape } from './util/html';
import { StyleTable } from './util/styletable';
import { sendEvent } from './util/telemetry';
import { forceError } from './util/common';
import { readFile } from './util/vsccommon';

abstract class CommonViewProvider implements vscode.CustomReadonlyEditorProvider {
    public async openCustomDocument(uri: vscode.Uri) {
        // Don't try opening it as text
        return { uri, dispose: () => { } };
    }

    public async resolveCustomEditor(document: vscode.CustomDocument, webviewPanel: vscode.WebviewPanel, token: vscode.CancellationToken): Promise<void> {
        try {
            this.onOpen();

            const buffer = await Promise.race([
                readFile(document.uri),
                new Promise<null>(resolve => token.onCancellationRequested(_ => resolve(null))),
            ]);

            if (buffer === null) {
                return;
            }

            const png = this.getPng(Buffer.from(buffer));
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
            webviewPanel.webview.html = `${localize('error', 'Error')}: <br/>  <pre>${htmlEscape(forceError(e).toString())}</pre>`;
        }
    }

    protected abstract onOpen(): void;
    protected abstract getPng(buffer: Buffer): PNG;
}

export class DDSViewProvider extends CommonViewProvider {
    protected onOpen(): void {
        sendEvent('preview.dds');
    }

    protected getPng(buffer: Buffer): PNG {
        const dds = DDS.parse(buffer.buffer, buffer.byteOffset);
        return ddsToPng(dds);
    }
}

export class TGAViewProvider extends CommonViewProvider {
    protected onOpen(): void {
        sendEvent('preview.tga');
    }

    protected getPng(buffer: Buffer): PNG {
        return tgaToPng(buffer);
    }
}
