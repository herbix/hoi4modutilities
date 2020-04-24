import * as vscode from 'vscode';
import { renderFocusTreeFile } from './contentbuilder';
import { PreviewProviderDef } from '../../previewProviderDef';
import { matchPathEnd } from '../../util/common';

async function showFocusTreePreview(document: vscode.TextDocument, panel: vscode.WebviewPanel) {
    panel.webview.html = await renderFocusTreeFile(document.getText(), document.uri, panel.webview);
}

async function updateFocusTreePreview(document: vscode.TextDocument, panel: vscode.WebviewPanel) {
    panel.webview.html = await renderFocusTreeFile(document.getText(), document.uri, panel.webview);
}

function canPreviewFocusTree(document: vscode.TextDocument) {
    const uri = document.uri;
    if (matchPathEnd(uri.fsPath, ['common', 'national_focus', '*'])) {
        return true;
    }

    const text = document.getText();
    return /(focus_tree|shared_focus)\s*=\s*{/.test(text);
}

export const focusTreePreviewDef: PreviewProviderDef = {
    type: 'focustree',
    show: showFocusTreePreview,
    update: updateFocusTreePreview,
    canPreview: canPreviewFocusTree,
};
