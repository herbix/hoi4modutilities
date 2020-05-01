import * as vscode from 'vscode';
import { renderTechnologyFile } from './contentbuilder';
import { matchPathEnd } from '../../util/common';
import { PreviewProviderDef } from '../previewmanager';
import { PreviewBase, PreviewDependency } from '../previewbase';

function canPreviewTechnology(document: vscode.TextDocument) {
    const uri = document.uri;
    if (matchPathEnd(uri.fsPath, ['common', 'technologies', '*'])) {
        return true;
    }

    const text = document.getText();
    return /(technologies)\s*=\s*{/.test(text);
}

const technologyUIGfxFiles = ['interface/countrytechtreeview.gfx', 'interface/countrytechnologyview.gfx'];
const technologiesGFX = 'interface/technologies.gfx';
const relatedGfxFiles = [...technologyUIGfxFiles, technologiesGFX];
const guiFilePath = 'interface/countrytechtreeview.gui';
class TechnologyTreePreview extends PreviewBase {
    protected getContent(document: vscode.TextDocument, dependencies: PreviewDependency): Promise<string> {
        return renderTechnologyFile(document.getText(), document.uri, this.panel.webview, dependencies);
    }

    public getInitialDependencies(): PreviewDependency {
        return {
            gfx: [...relatedGfxFiles],
            gui: [guiFilePath],
        };
    }
}

export const technologyPreviewDef: PreviewProviderDef = {
    type: 'technology',
    canPreview: canPreviewTechnology,
    previewContructor: TechnologyTreePreview,
};
