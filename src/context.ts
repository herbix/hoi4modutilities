import * as vscode from 'vscode';

interface ContextContainer {
    current: vscode.ExtensionContext | null;
    modName: vscode.StatusBarItem | null;
}

export const contextContainer: ContextContainer = {
    current: null,
    modName: null,
};
