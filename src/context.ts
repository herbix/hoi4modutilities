import * as vscode from 'vscode';

export const contextContainer: { current: vscode.ExtensionContext | null;  } = {
    current: null
};
