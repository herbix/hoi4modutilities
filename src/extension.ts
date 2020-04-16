import * as vscode from 'vscode';
import { previewManager } from './previewmanager';
import { contextContainer } from './context';

export function activate(context: vscode.ExtensionContext) {
	contextContainer.current = context;
	context.subscriptions.push({
		dispose() {
			contextContainer.current = null;
		}
	});

	context.subscriptions.push(vscode.commands.registerCommand('hoi4modutilities.preview', previewManager.showPreview, previewManager));
	context.subscriptions.push(vscode.workspace.onDidCloseTextDocument(previewManager.onCloseTextDocument, previewManager));
	context.subscriptions.push(vscode.workspace.onDidChangeTextDocument(previewManager.onChangeTextDocument, previewManager));
	context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(previewManager.onChangeActiveTextEditor, previewManager));

	previewManager.onChangeActiveTextEditor(vscode.window.activeTextEditor);

	context.subscriptions.push(vscode.commands.registerCommand('hoi4modutilities.test', () => {
	}));
	
	context.subscriptions.push(vscode.window.registerWebviewPanelSerializer('hoi4ftpreview', previewManager));

}

export function deactivate() {}
