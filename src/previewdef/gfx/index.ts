import * as vscode from 'vscode';
import { getHtmlFromGfxFile } from './contentbuilder';
import { PreviewProviderDef } from '../../previewProviderDef';

async function showGfxPreview(document: vscode.TextDocument, panel: vscode.WebviewPanel) {
    panel.webview.html = 'Loading...';
    panel.webview.html = await getHtmlFromGfxFile(document.getText(), document.uri, panel.webview);
}

async function updateGfxPreview(document: vscode.TextDocument, panel: vscode.WebviewPanel) {
    panel.webview.html = await getHtmlFromGfxFile(document.getText(), document.uri, panel.webview);
}

function canPreviewGfx(document: vscode.TextDocument) {
    const uri = document.uri;
    return uri.path.endsWith('.gfx');
}

export const gfxPreviewDef: PreviewProviderDef = {
    type: 'gfx',
    show: showGfxPreview,
    update: updateGfxPreview,
    condition: canPreviewGfx,
};
