import * as vscode from 'vscode';

export function getConfiguration() {
    return vscode.workspace.getConfiguration('hoi4ModUtilities');
}

export function getDocumentByUri(uri: vscode.Uri): vscode.TextDocument | undefined {
    return vscode.workspace.textDocuments.find(document => document.uri.toString() === uri.toString());
}
