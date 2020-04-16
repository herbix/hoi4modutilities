import * as vscode from 'vscode';

export interface PreviewProviderDef {
    type: string;
    condition(document: vscode.TextDocument): boolean;
    show(document: vscode.TextDocument, panel: vscode.WebviewPanel): Promise<void>;
    update(document: vscode.TextDocument, panel: vscode.WebviewPanel): Promise<void>;
    dispose?(document: vscode.TextDocument, panel: vscode.WebviewPanel): Promise<void>;
}
