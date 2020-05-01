import * as vscode from 'vscode';

interface ContextContainer {
    current: vscode.ExtensionContext | null;
}

export const contextContainer: ContextContainer = {
    current: null,
};
