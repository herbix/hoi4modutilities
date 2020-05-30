import * as vscode from 'vscode';
import * as path from 'path';

export function getConfiguration() {
    return vscode.workspace.getConfiguration('hoi4ModUtilities');
}

export function getDocumentByUri(uri: vscode.Uri): vscode.TextDocument | undefined {
    return vscode.workspace.textDocuments.find(document => document.uri.toString() === uri.toString());
}

export function getRelativePathInWorkspace(uri: vscode.Uri): string {
    const folder = vscode.workspace.getWorkspaceFolder(uri);
    if (folder) {
        return path.relative(folder.uri.fsPath, uri.fsPath).replace(/\\/g, '/');
    } else {
        return uri.fsPath;
    }
}
