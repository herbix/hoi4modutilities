import * as vscode from 'vscode';
import { previewManager } from './previewdef/previewmanager';
import { registerContextContainer, setVscodeContext } from './context';
import { DDSViewProvider, TGAViewProvider } from './ddsviewprovider';
import { registerModFile } from './util/modfile';
import { worldMap } from './previewdef/worldmap';
import { ViewType, ContextName } from './constants';
import { registerTelemetryReporter, sendEvent } from './util/telemetry';
import { registerScanReferencesCommand } from './util/dependency';
import { registerHoiFs } from './util/hoifs';
import { loadI18n } from './util/i18n';
import { registerGfxIndex } from './util/gfxindex';
import { Logger } from "./util/logger";
import { registerLocalisationIndex } from "./util/localisationIndex";

export function activate(context: vscode.ExtensionContext) {
    let locale = (context as any).extension?.packageJSON.locale;
    if (locale === "%hoi4modutilities.locale%") {
        locale = 'en';
    }

    Logger.initialize();
    Logger.show();

    loadI18n(locale);

    // Must register this first because other component may use it.
    context.subscriptions.push(registerContextContainer(context));
    context.subscriptions.push(registerTelemetryReporter());

    sendEvent('extension.activate', { locale, isWeb: IS_WEB_EXT.toString() });

    context.subscriptions.push(previewManager.register());
    context.subscriptions.push(registerModFile());
    context.subscriptions.push(worldMap.register());
    context.subscriptions.push(registerScanReferencesCommand());
    context.subscriptions.push(registerHoiFs());
    context.subscriptions.push(vscode.window.registerCustomEditorProvider(ViewType.DDS, new DDSViewProvider()));
    context.subscriptions.push(vscode.window.registerCustomEditorProvider(ViewType.TGA, new TGAViewProvider()));
    context.subscriptions.push(registerGfxIndex());
    context.subscriptions.push(registerLocalisationIndex());

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
