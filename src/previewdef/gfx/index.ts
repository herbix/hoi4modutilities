import * as vscode from 'vscode';
import { renderGfxFile } from './contentbuilder';
import { PreviewProviderDef } from '../previewmanager';
import { PreviewBase, emptyPreviewDependency, PreviewDependency } from '../previewbase';

function canPreviewGfx(document: vscode.TextDocument) {
    const uri = document.uri;
    return uri.path.endsWith('.gfx');
}

class GfxPreview extends PreviewBase {
    protected getContent(document: vscode.TextDocument): Promise<string> {
        return renderGfxFile(document.getText(), document.uri, this.panel.webview);
    }

    public getDependencies(document: vscode.TextDocument): Promise<PreviewDependency> {
        return Promise.resolve(emptyPreviewDependency);
    }
}

export const gfxPreviewDef: PreviewProviderDef = {
    type: 'gfx',
    canPreview: canPreviewGfx,
    previewContructor: GfxPreview,
};
