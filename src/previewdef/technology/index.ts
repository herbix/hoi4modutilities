import * as vscode from 'vscode';
import { renderTechnologyFile } from './contentbuilder';
import { matchPathEnd } from '../../util/nodecommon';
import { PreviewProviderDef } from '../previewmanager';
import { PreviewBase } from '../previewbase';
import { TechnologyTreeLoader } from './loader';
import { getRelativePathInWorkspace } from '../../util/vsccommon';

function canPreviewTechnology(document: vscode.TextDocument) {
    const uri = document.uri;
    if (matchPathEnd(uri.toString(), ['common', 'technologies', '*'])) {
        return 0;
    }

    const text = document.getText();
    return /(technologies)\s*=\s*{/.exec(text)?.index;
}

class TechnologyTreePreview extends PreviewBase {
    private technologyTreeLoader: TechnologyTreeLoader;
    private content: string | undefined;

    constructor(uri: vscode.Uri, panel: vscode.WebviewPanel) {
        super(uri, panel);
        this.technologyTreeLoader = new TechnologyTreeLoader(getRelativePathInWorkspace(this.uri), () => Promise.resolve(this.content ?? ''));
        this.technologyTreeLoader.onLoadDone(r => this.updateDependencies(r.dependencies));
    }

    protected async getContent(document: vscode.TextDocument): Promise<string> {
        this.content = document.getText();
        const result = await renderTechnologyFile(this.technologyTreeLoader, document.uri, this.panel.webview);
        this.content = undefined;
        return result;
    }
}

export const technologyPreviewDef: PreviewProviderDef = {
    type: 'technology',
    canPreview: canPreviewTechnology,
    previewContructor: TechnologyTreePreview,
};
