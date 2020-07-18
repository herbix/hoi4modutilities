import * as vscode from 'vscode';
import * as path from 'path';
import { localize } from './i18n';
import { UserError } from './common';

export function getConfiguration() {
    return vscode.workspace.getConfiguration('hoi4ModUtilities');
}

export function getDocumentByUri(uri: vscode.Uri): vscode.TextDocument | undefined {
    return vscode.workspace.textDocuments.find(document => document.uri.toString() === uri.toString());
}

export function getRelativePathInWorkspace(uri: vscode.Uri): string {
    ensureFileScheme(uri);
    const folder = vscode.workspace.getWorkspaceFolder(uri);
    if (folder) {
        ensureFileScheme(folder.uri);
        return path.relative(folder.uri.fsPath, uri.fsPath).replace(/\\/g, '/');
    } else {
        return uri.fsPath;
    }
}

export function isFileScheme(uri: vscode.Uri) {
    return uri.scheme === 'file';
}

export function ensureFileScheme(uri: vscode.Uri) {
    if (!isFileScheme(uri)) {
        throw new UserError(localize('filenotondisk', 'File is not on disk: {0}.', uri.toString()));
    }
}
