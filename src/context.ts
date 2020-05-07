import * as vscode from 'vscode';

interface ContextContainer {
    current: vscode.ExtensionContext | null;
}

export function registerContextContainer(context: vscode.ExtensionContext): vscode.Disposable {
    contextContainer.current = context;
    return new vscode.Disposable(() => contextContainer.current = null);
}

export const contextContainer: ContextContainer = {
    current: null,
};
