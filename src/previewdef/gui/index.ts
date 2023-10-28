import * as vscode from 'vscode';
import { PreviewProviderDef } from '../previewmanager';
import { PreviewBase } from '../previewbase';
import { GuiFileLoader } from './loader';
import { getRelativePathInWorkspace } from '../../util/vsccommon';
import { renderGuiFile } from './contentbuilder';

function canPreviewGui(document: vscode.TextDocument) {
    const uri = document.uri;
    return uri.path.toLowerCase().endsWith('.gui') ? 0 : undefined;
}

class GuiPreview extends PreviewBase {
    private guiFileLoader: GuiFileLoader;
    private content: string | undefined;

    constructor(uri: vscode.Uri, panel: vscode.WebviewPanel) {
        super(uri, panel);
        this.guiFileLoader = new GuiFileLoader(getRelativePathInWorkspace(this.uri), () => Promise.resolve(this.content ?? ''));
        this.guiFileLoader.onLoadDone(r => this.updateDependencies(r.dependencies));
    }

    protected async getContent(document: vscode.TextDocument): Promise<string> {
        this.content = document.getText();
        const result = await renderGuiFile(this.guiFileLoader, document.uri, this.panel.webview);
        this.content = undefined;
        return result;
    }
}

export const guiPreviewDef: PreviewProviderDef = {
    type: 'gui',
    canPreview: canPreviewGui,
    previewContructor: GuiPreview,
};
