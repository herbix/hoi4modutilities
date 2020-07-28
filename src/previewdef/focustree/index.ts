import * as vscode from 'vscode';
import { renderFocusTreeFile } from './contentbuilder';
import { matchPathEnd } from '../../util/nodecommon';
import { PreviewBase } from '../previewbase';
import { PreviewProviderDef } from '../previewmanager';
import { FocusTreeLoader } from './loader';
import { getRelativePathInWorkspace } from '../../util/vsccommon';

function canPreviewFocusTree(document: vscode.TextDocument) {
    const uri = document.uri;
    if (matchPathEnd(uri.toString().toLowerCase(), ['common', 'national_focus', '*']) && uri.path.toLowerCase().endsWith('.txt')) {
        return 0;
    }

    const text = document.getText();
    return /(focus_tree|shared_focus)\s*=\s*{/.exec(text)?.index;
}

class FocusTreePreview extends PreviewBase {
    private focusTreeLoader: FocusTreeLoader;
    private content: string | undefined;

    constructor(uri: vscode.Uri, panel: vscode.WebviewPanel) {
        super(uri, panel);
        this.focusTreeLoader = new FocusTreeLoader(getRelativePathInWorkspace(this.uri), () => Promise.resolve(this.content ?? ''));
        this.focusTreeLoader.onLoadDone(r => this.updateDependencies(r.dependencies));
    }

    protected async getContent(document: vscode.TextDocument): Promise<string> {
        this.content = document.getText();
        const result = await renderFocusTreeFile(this.focusTreeLoader, document.uri, this.panel.webview);
        this.content = undefined;
        return result;
    }
}

export const focusTreePreviewDef: PreviewProviderDef = {
    type: 'focustree',
    canPreview: canPreviewFocusTree,
    previewContructor: FocusTreePreview,
};
