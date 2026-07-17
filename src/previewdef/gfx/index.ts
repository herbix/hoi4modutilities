import * as vscode from 'vscode';
import { renderGfxFile } from './contentbuilder';
import { PreviewProviderDef } from '../previewmanager';
import { PreviewBase } from '../previewbase';
import { matchPathEnd } from '../../util/nodecommon';

function canPreviewGfx(document: vscode.TextDocument) {
    const uri = document.uri;
    if (matchPathEnd(uri.toString().toLowerCase(), ['interface', '*']) && uri.path.toLowerCase().endsWith('.gfx')) {
        return 0;
    }

    const text = document.getText();
    return /(spriteTypes)\s*=\s*{/.exec(text)?.index;
}

class GfxPreview extends PreviewBase {
    protected getContent(document: vscode.TextDocument): Promise<string> {
        return renderGfxFile(document.getText(), document.uri, this.panel.webview);
    }
}

export const gfxPreviewDef: PreviewProviderDef = {
    type: 'gfx',
    canPreview: canPreviewGfx,
    previewContructor: GfxPreview,
};
