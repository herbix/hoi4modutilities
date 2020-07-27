import * as vscode from 'vscode';

interface ContextContainer {
    current: vscode.ExtensionContext | null;
    contextValue: Record<string, unknown>;
}

export function registerContextContainer(context: vscode.ExtensionContext): vscode.Disposable {
    contextContainer.current = context;
    return new vscode.Disposable(() => contextContainer.current = null);
}

export const contextContainer: ContextContainer = {
    current: null,
    contextValue: {},
};

export function setVscodeContext(key: string, value: unknown): void {
    contextContainer.contextValue[key] = value;
    vscode.commands.executeCommand('setContext', key, value);
}
