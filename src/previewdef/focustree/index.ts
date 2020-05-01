import * as vscode from 'vscode';
import { renderFocusTreeFile } from './contentbuilder';
import { matchPathEnd } from '../../util/common';
import { PreviewBase, PreviewDependency } from '../previewbase';
import { PreviewProviderDef } from '../previewmanager';

function canPreviewFocusTree(document: vscode.TextDocument) {
    const uri = document.uri;
    if (matchPathEnd(uri.fsPath, ['common', 'national_focus', '*'])) {
        return true;
    }

    const text = document.getText();
    return /(focus_tree|shared_focus)\s*=\s*{/.test(text);
}

const focusesGFX = 'interface/goals.gfx';
class FocusTreePreview extends PreviewBase {
    protected getContent(document: vscode.TextDocument, dependencies: PreviewDependency): Promise<string> {
        return renderFocusTreeFile(document.getText(), document.uri, this.panel.webview, dependencies);
    }

    public getInitialDependencies(): PreviewDependency {
        return {
            gfx: [focusesGFX],
            gui: [],
        };
    }

    public async getDependencies(document: vscode.TextDocument): Promise<PreviewDependency> {
        const result = await super.getDependencies(document);
        result.gui.length = 0;
        return result;
    }
}

export const focusTreePreviewDef: PreviewProviderDef = {
    type: 'focustree',
    canPreview: canPreviewFocusTree,
    previewContructor: FocusTreePreview,
};
