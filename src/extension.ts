import * as vscode from 'vscode';
import { previewManager } from './previewdef/previewmanager';
import { registerContextContainer, setVscodeContext } from './context';
import { DDSViewProvider } from './ddsviewprovider';
import { registerModFile } from './util/modfile';
import { worldMap } from './previewdef/worldmap';
import { ViewType, ContextName } from './constants';
import { registerTelemetryReporter, sendEvent } from './util/telemetry';
import { registerScanReferencesCommand } from './util/dependency';
import { locale } from './util/i18n';

export function activate(context: vscode.ExtensionContext) {
    // Must register this first because other component may use it.
    context.subscriptions.push(registerContextContainer(context));
    context.subscriptions.push(registerTelemetryReporter());

    sendEvent('extension.activate', { locale });

    context.subscriptions.push(previewManager.register());
    context.subscriptions.push(registerModFile());
    context.subscriptions.push(worldMap.register());
    context.subscriptions.push(registerScanReferencesCommand());

    // Use proposed vscode API
    context.subscriptions.push(vscode.window.registerCustomEditorProvider(ViewType.DDS, new DDSViewProvider() as any));

    if (process.env.NODE_ENV !== 'production') {
        vscode.commands.registerCommand('hoi4modutilities.test', () => {
            const debugModule = require('./util/debug.shouldignore');
            debugModule.testCommand();
        });

        setVscodeContext(ContextName.Hoi4MUInDev, true);
    }
    
    setVscodeContext(ContextName.Hoi4MULoaded, true);
}

export function deactivate() {}
