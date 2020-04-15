import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { previewManager } from './previewmanager';
import { parseDds } from './ddsparser';
import { PNG } from 'pngjs';

export function activate(context: vscode.ExtensionContext) {
	context.subscriptions.push(vscode.commands.registerCommand('hoi4focustreepreview.previewFocusTree', previewManager.showPreview, previewManager));
	context.subscriptions.push(vscode.workspace.onDidCloseTextDocument(previewManager.onCloseTextDocument, previewManager));
	context.subscriptions.push(vscode.workspace.onDidChangeTextDocument(previewManager.onChangeTextDocument, previewManager));

	context.subscriptions.push(vscode.commands.registerCommand('hoi4focustreepreview.test', () => {
	}));
	// vscode.window.registerWebviewPanelSerializer('hoi4ftpreview', new Hoi4FTSerializer());
}

export function deactivate() {}
