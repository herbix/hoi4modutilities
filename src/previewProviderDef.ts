import * as vscode from 'vscode';

export interface PreviewProviderDef {
    type: string;
    canPreview(document: vscode.TextDocument): boolean;
    show(document: vscode.TextDocument, panel: vscode.WebviewPanel): Promise<void>;
    update(document: vscode.TextDocument, panel: vscode.WebviewPanel, changedDocument: vscode.TextDocument | undefined): Promise<void>;

    updateWhenChange?: string[][];
    dispose?(document: vscode.TextDocument | undefined, panel: vscode.WebviewPanel): Promise<void>;
}
