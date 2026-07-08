import * as vscode from 'vscode';
import { renderFocusTreeFile } from './contentbuilder';
import { matchPathEnd } from '../../util/nodecommon';
import { PreviewBase } from '../previewbase';
import { PreviewProviderDef } from '../previewmanager';
import { FocusTreeLoader } from './loader';
import { getDocumentByUri, getRelativePathInWorkspace } from '../../util/vsccommon';
import { getFilePathFromMod, getHoiOpenedFileOriginalUri } from '../../util/fileloader';
import { localize } from '../../util/i18n';

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

    protected async handleMessage(msg: any): Promise<void> {
        if (msg.command === 'updateFocusPosition') {
            await this.updateFocusPositions([msg]);
        } else if (msg.command === 'updateFocusPositions') {
            await this.updateFocusPositions(Array.isArray(msg.focuses) ? msg.focuses : []);
        }
    }

    private async updateFocusPositions(focuses: any[]): Promise<void> {
        if (focuses.length === 0) {
            await vscode.window.showErrorMessage(localize('preview.focusposition.invalidmessage', 'Cannot update focus position: invalid focus metadata.'));
            return;
        }

        const updates: FocusPositionUpdate[] = [];
        for (const focus of focuses) {
            const update = await this.getFocusPositionUpdate(focus);
            if (update === undefined) {
                return;
            }

            updates.push(update);
        }

        const edit = new vscode.WorkspaceEdit();
        for (const update of updates) {
            edit.replace(update.document.uri, update.range, update.updatedText);
        }

        await vscode.workspace.applyEdit(edit);
    }

    private async getFocusPositionUpdate(msg: any): Promise<FocusPositionUpdate | undefined> {
        const start = typeof msg.start === 'number' ? msg.start : undefined;
        const end = typeof msg.end === 'number' ? msg.end : undefined;
        const x = typeof msg.x === 'number' && Number.isFinite(msg.x) ? msg.x : undefined;
        const y = typeof msg.y === 'number' && Number.isFinite(msg.y) ? msg.y : undefined;

        if (start === undefined || end === undefined || x === undefined || y === undefined) {
            await vscode.window.showErrorMessage(localize('preview.focusposition.invalidmessage', 'Cannot update focus position: invalid focus metadata.'));
            return undefined;
        }

        const document = await this.getDocumentForPreviewMessage(msg.file);
        if (!document) {
            return undefined;
        }

        const range = this.getFocusBlockRange(document, start, end);
        if (range === undefined) {
            await vscode.window.showErrorMessage(localize('preview.focusposition.invalidmessage', 'Cannot update focus position: invalid focus metadata.'));
            return undefined;
        }

        const originalText = document.getText(range);
        const updatedXText = this.replaceFocusCoordinate(originalText, 'x', x);
        const updatedText = updatedXText ? this.replaceFocusCoordinate(updatedXText, 'y', y) : undefined;

        if (updatedText === undefined || updatedText === originalText) {
            await vscode.window.showErrorMessage(localize('preview.focusposition.unsupported', 'Cannot update focus position: x/y must be explicit numeric values in the focus block.'));
            return undefined;
        }

        return { document, range, updatedText };
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

    private replaceFocusCoordinate(text: string, coordinate: 'x' | 'y', value: number): string | undefined {
        let depth = 0;
        let offset = 0;
        const pattern = new RegExp(`^([ \\t]*${coordinate}[ \\t]*=[ \\t]*)(-?\\d+(?:\\.\\d+)?)`);

        for (const line of text.match(/[^\r\n]*(?:\r\n|\r|\n|$)/g) ?? []) {
            if (line === '') {
                break;
            }

            const match = depth === 1 ? pattern.exec(line) : undefined;
            if (match) {
                const valueStart = offset + match[1].length;
                const valueEnd = valueStart + match[2].length;
                return text.substring(0, valueStart) + value + text.substring(valueEnd);
            }

            depth += this.getBraceDepthChange(line);
            offset += line.length;
        }

        return undefined;
    }

    private getBraceDepthChange(text: string): number {
        let depthChange = 0;
        let inString = false;

        for (let i = 0; i < text.length; i++) {
            const char = text[i];
            const prev = i > 0 ? text[i - 1] : '';

            if (inString) {
                if (char === '"' && prev !== '\\') {
                    inString = false;
                }
                continue;
            }

            if (char === '#') {
                break;
            }

            if (char === '"') {
                inString = true;
            } else if (char === '{') {
                depthChange++;
            } else if (char === '}') {
                depthChange--;
            }
        }

        return depthChange;
    }

    private getFocusBlockRange(document: vscode.TextDocument, start: number, end: number): vscode.Range | undefined {
        const text = document.getText();
        const blockStart = text.indexOf('{', end);
        if (blockStart === -1) {
            return undefined;
        }

        const blockEnd = this.findMatchingBrace(text, blockStart);
        if (blockEnd === undefined) {
            return undefined;
        }

        return new vscode.Range(document.positionAt(start), document.positionAt(blockEnd + 1));
    }

    private findMatchingBrace(text: string, openBraceIndex: number): number | undefined {
        let depth = 0;
        let inString = false;
        let inComment = false;

        for (let i = openBraceIndex; i < text.length; i++) {
            const char = text[i];
            const prev = i > 0 ? text[i - 1] : '';

            if (inComment) {
                if (char === '\n' || char === '\r') {
                    inComment = false;
                }
                continue;
            }

            if (inString) {
                if (char === '"' && prev !== '\\') {
                    inString = false;
                }
                continue;
            }

            if (char === '#') {
                inComment = true;
                continue;
            }

            if (char === '"') {
                inString = true;
                continue;
            }

            if (char === '{') {
                depth++;
            } else if (char === '}') {
                depth--;
                if (depth === 0) {
                    return i;
                }
            }
        }

        return undefined;
    }
}

export const focusTreePreviewDef: PreviewProviderDef = {
    type: 'focustree',
    canPreview: canPreviewFocusTree,
    previewContructor: FocusTreePreview,
};
