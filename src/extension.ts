import * as vscode from 'vscode';
import { previewManager } from './previewdef/previewmanager';
import { contextContainer } from './context';
import { PreviewWebviewType, ViewTypeDDS, Commands } from './constants';
import { DDSViewProvider } from './ddsviewprovider';
import { selectModFile, onChangeWorkspaceConfiguration, modFileStatusContainer, checkAndUpdateModFileStatus } from './util/modfile';
import { getConfiguration } from './util/vsccommon';

export function activate(context: vscode.ExtensionContext) {
    contextContainer.current = context;
    context.subscriptions.push({
        dispose() {
            contextContainer.current = null;
            modFileStatusContainer.current = null;
        }
    });

    context.subscriptions.push(vscode.commands.registerCommand(Commands.Preview, previewManager.showPreview, previewManager));
    context.subscriptions.push(vscode.commands.registerCommand(Commands.SelectModFile, selectModFile));
    context.subscriptions.push(vscode.workspace.onDidCloseTextDocument(previewManager.onCloseTextDocument, previewManager));
    context.subscriptions.push(vscode.workspace.onDidChangeTextDocument(previewManager.onChangeTextDocument, previewManager));
    context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(previewManager.onChangeActiveTextEditor, previewManager));
    context.subscriptions.push(vscode.window.registerWebviewPanelSerializer(PreviewWebviewType, previewManager));
    context.subscriptions.push(vscode.window.registerCustomEditorProvider(ViewTypeDDS, new DDSViewProvider() as any));
    context.subscriptions.push(modFileStatusContainer.current = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 50));
    context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(onChangeWorkspaceConfiguration));

    checkAndUpdateModFileStatus(getConfiguration().modFile);
	
	// Trigger context value setting
	previewManager.onChangeActiveTextEditor(vscode.window.activeTextEditor);

    if (process.env.NODE_ENV !== 'production') {
        vscode.commands.registerCommand('hoi4modutilities.test', () => {
            const debugModule = require('./util/debug.shouldignore');
            debugModule.testCommand();
        });

        vscode.commands.executeCommand('setContext', 'Hoi4MUInDev', true);
    }
}

export function deactivate() {}
