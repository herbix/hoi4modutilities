import * as vscode from 'vscode';
import { renderFocusTreeFile } from './contentbuilder';
import { matchPathEnd } from '../../util/nodecommon';
import { PreviewBase } from '../previewbase';
import { PreviewProviderDef } from '../previewmanager';
import { FocusTreeLoader } from './loader';
import { getDocumentByUri, getRelativePathInWorkspace } from '../../util/vsccommon';
import { getFilePathFromMod, getHoiOpenedFileOriginalUri } from '../../util/fileloader';
import { localize } from '../../util/i18n';
import { UpdateFocusPositionsMessage } from './schema';

interface FocusPositionUpdate {
    document: vscode.TextDocument;
    range: vscode.Range;
    updatedText: string;
}

function canPreviewFocusTree(document: vscode.TextDocument) {
    const uri = document.uri;
    if (matchPathEnd(uri.toString().toLowerCase(), ['common', 'national_focus', '*']) && uri.path.toLowerCase().endsWith('.txt')) {
        return 0;
    }

    const text = document.getText();
    return /(focus_tree|shared_focus|joint_focus)\s*=\s*{/.exec(text)?.index;
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

    protected async handleMessage(msg: UpdateFocusPositionsMessage): Promise<void> {
        if (msg.command === 'updateFocusPositions') {
            await this.updateFocusPositions(Array.isArray(msg.focuses) ? msg.focuses : []);
        }
    }

    private async updateFocusPositions(focuses: UpdateFocusPositionsMessage['focuses']): Promise<void> {
        if (focuses.length === 0) {
            await vscode.window.showErrorMessage(localize('preview.focusposition.invalidmessage', 'Cannot update focus position: invalid focus metadata.'));
            return;
        }

        const updates: FocusPositionUpdate[] = [];
        for (const focus of focuses) {
            const update = await this.getFocusPositionUpdates(focus);
            if (update) {
                updates.push(...update);
            }
        }

        const edit = new vscode.WorkspaceEdit();
        for (const update of updates) {
            edit.replace(update.document.uri, update.range, update.updatedText);
        }

        await vscode.workspace.applyEdit(edit);
        this.reload();
    }

    private async getFocusPositionUpdates(msg: UpdateFocusPositionsMessage['focuses'][number]): Promise<FocusPositionUpdate[] | undefined> {
        const xToken = msg.focus.xToken;
        const yToken = msg.focus.yToken;
        const x = Number.isFinite(msg.x) ? msg.x : undefined;
        const y = Number.isFinite(msg.y) ? msg.y : undefined;

        if (xToken === undefined || yToken === undefined || x === undefined || y === undefined) {
            await vscode.window.showErrorMessage(localize('preview.focusposition.invalidmessage', 'Cannot update focus position: invalid focus metadata.'));
            return undefined;
        }

        const document = await this.getDocumentForPreviewMessage(msg.file);
        if (!document) {
            return undefined;
        }

        if (!xToken.value.match(/^\d+$/) || !yToken.value.match(/^\d+$/)) {
            await vscode.window.showErrorMessage(localize('preview.focusposition.unsupported', 'Cannot update focus position: x/y must be explicit numeric values in the focus block.'));
            return undefined;
        }

        return [
            { document, range: new vscode.Range(document.positionAt(xToken.start), document.positionAt(xToken.end)), updatedText: x.toString() },
            { document, range: new vscode.Range(document.positionAt(yToken.start), document.positionAt(yToken.end)), updatedText: y.toString() },
        ];
    }

    private async getDocumentForPreviewMessage(file: string | undefined): Promise<vscode.TextDocument | undefined> {
        if (!file) {
            return getDocumentByUri(this.uri) ?? await vscode.workspace.openTextDocument(this.uri);
        }

        const filePathInMod = await getFilePathFromMod(file);
        if (filePathInMod === undefined) {
            await vscode.window.showErrorMessage(localize('preview.focusposition.filenotfound', 'Cannot update focus position: file "{0}" is not in the current mod workspace.', file));
            return undefined;
        }

        const uri = getHoiOpenedFileOriginalUri(filePathInMod);
        return getDocumentByUri(uri) ?? await vscode.workspace.openTextDocument(uri);
    }
}

export const focusTreePreviewDef: PreviewProviderDef = {
    type: 'focustree',
    canPreview: canPreviewFocusTree,
    previewContructor: FocusTreePreview,
};
