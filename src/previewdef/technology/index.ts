import * as vscode from 'vscode';
import { renderTechnologyFile, guiFilePath, relatedGfxFiles } from './contentbuilder';
import { PreviewProviderDef } from '../../previewProviderDef';
import { matchPathEnd } from '../../util/common';

async function showTechnologyPreview(document: vscode.TextDocument, panel: vscode.WebviewPanel) {
    panel.webview.html = 'Loading...';
    panel.webview.html = await renderTechnologyFile(document.getText(), document.uri, panel.webview);
}

async function updateTechnologyPreview(document: vscode.TextDocument, panel: vscode.WebviewPanel) {
    panel.webview.html = await renderTechnologyFile(document.getText(), document.uri, panel.webview);
}

function canPreviewTechnology(document: vscode.TextDocument) {
    const uri = document.uri;
    if (matchPathEnd(uri.fsPath, ['common', 'technologies', '*'])) {
        return true;
    }

    const text = document.getText();
    return /(technologies)\s*=\s*{/.test(text);
}

export const technologyPreviewDef: PreviewProviderDef = {
    type: 'technology',
    show: showTechnologyPreview,
    update: updateTechnologyPreview,
    canPreview: canPreviewTechnology,
    updateWhenChange: [ guiFilePath.split('/'), ...relatedGfxFiles.map(f => f.split('/')) ],
};