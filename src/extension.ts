import * as vscode from 'vscode';
import { previewManager } from './previewdef/previewmanager';
import { registerContextContainer } from './context';
import { DDSViewProvider } from './ddsviewprovider';
import { registerModFile } from './util/modfile';
import { worldMap } from './previewdef/worldmap';
import { ViewType, ContextName } from './constants';

export function activate(context: vscode.ExtensionContext) {
    // Must register this first because other component may use it.
    context.subscriptions.push(registerContextContainer(context));

    context.subscriptions.push(previewManager.register());
    context.subscriptions.push(registerModFile());
    context.subscriptions.push(worldMap.register());

    // Use proposed vscode API
    context.subscriptions.push(vscode.window.registerCustomEditorProvider(ViewType.DDS, new DDSViewProvider() as any));

    if (process.env.NODE_ENV !== 'production') {
        vscode.commands.registerCommand('hoi4modutilities.test', () => {
            const debugModule = require('./util/debug.shouldignore');
            debugModule.testCommand();
        });

        vscode.commands.executeCommand('setContext', ContextName.Hoi4MUInDev, true);
    }
}

export function deactivate() {}
