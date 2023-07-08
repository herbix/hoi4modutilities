import { trimStart } from 'lodash';
import * as vscode from 'vscode';
import { Commands, ConfigurationKey, Hoi4FsSchema } from '../constants';
import { UserError } from './common';
import { clearDlcZipCache } from './fileloader';
import { sendEvent } from './telemetry';
import { getConfiguration, isFileScheme } from './vsccommon';

const installPathContainer: { current: vscode.Uri | null } = {
    current: null,
};

export function registerHoiFs(): vscode.Disposable {
    const disposables: vscode.Disposable[] = [];
    disposables.push(vscode.commands.registerCommand(Commands.SelectHoiFolder, selectHoiFolder));
    disposables.push(vscode.workspace.registerFileSystemProvider(Hoi4FsSchema, new Hoi4UtilsFsProvider(), { isReadonly: true }));

    if (!IS_WEB_EXT) {
        disposables.push(vscode.workspace.onDidChangeConfiguration(onChangeWorkspaceConfiguration));
    }

    return vscode.Disposable.from(...disposables);
}

async function selectHoiFolder(): Promise<void> {
    sendEvent('selectHoiFolder');

    const dialogOptions: vscode.OpenDialogOptions = { canSelectFolders: true, canSelectFiles: false, canSelectMany: false };
    // TODO proposed API
    // dialogOptions.allowUIResources = true;
    const result = await vscode.window.showOpenDialog(dialogOptions);
    if (!result) {
        return;
    }

    const uri = result[0];
    installPathContainer.current = uri;
    clearDlcZipCache();

    if (!IS_WEB_EXT && isFileScheme(uri)) {
        const conf = getConfiguration();
        conf.update('installPath', uri.fsPath, vscode.ConfigurationTarget.Global);
    }
}

function onChangeWorkspaceConfiguration(e: vscode.ConfigurationChangeEvent): void {
    if (e.affectsConfiguration(`${ConfigurationKey}.installPath`)) {
        installPathContainer.current = null;
        clearDlcZipCache();
    }
}

class Hoi4UtilsFsProvider implements vscode.FileSystemProvider {
    private onDidChangeFileEventEmitter = new vscode.EventEmitter<vscode.FileChangeEvent[]>();

    onDidChangeFile: vscode.Event<vscode.FileChangeEvent[]> = this.onDidChangeFileEventEmitter.event;

    watch(uri: vscode.Uri, options: { recursive: boolean; excludes: string[]; }): vscode.Disposable {
        // TODO empty implementation
        return { dispose: () => {} };
    }

    stat(uri: vscode.Uri): vscode.FileStat | Thenable<vscode.FileStat> {
        return vscode.workspace.fs.stat(vscode.Uri.joinPath(this.getInstallPath(), trimStart(uri.path, '/')));
    }

    readDirectory(uri: vscode.Uri): [string, vscode.FileType][] | Thenable<[string, vscode.FileType][]> {
        return vscode.workspace.fs.readDirectory(vscode.Uri.joinPath(this.getInstallPath(), trimStart(uri.path, '/')));
    }

    createDirectory(uri: vscode.Uri): void | Thenable<void> {
        return vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(this.getInstallPath(), trimStart(uri.path, '/')));
    }

    readFile(uri: vscode.Uri): Uint8Array | Thenable<Uint8Array> {
        return vscode.workspace.fs.readFile(vscode.Uri.joinPath(this.getInstallPath(), trimStart(uri.path, '/')));
    }
    
    writeFile(uri: vscode.Uri, content: Uint8Array, options: { create: boolean; overwrite: boolean; }): void | Thenable<void> {
        return vscode.workspace.fs.writeFile(vscode.Uri.joinPath(this.getInstallPath(), trimStart(uri.path, '/')), content);
    }

    delete(uri: vscode.Uri, options: { recursive: boolean; }): void | Thenable<void> {
        return vscode.workspace.fs.delete(vscode.Uri.joinPath(this.getInstallPath(), trimStart(uri.path, '/')), options);
    }

    rename(oldUri: vscode.Uri, newUri: vscode.Uri, options: { overwrite: boolean; }): void | Thenable<void> {
        return vscode.workspace.fs.rename(
            vscode.Uri.joinPath(this.getInstallPath(), trimStart(oldUri.path, '/')),
            vscode.Uri.joinPath(this.getInstallPath(), trimStart(newUri.path, '/')),
            options);
    }

    copy(source: vscode.Uri, destination: vscode.Uri, options: { overwrite: boolean; }): void | Thenable<void> {
        return vscode.workspace.fs.copy(
            vscode.Uri.joinPath(this.getInstallPath(), trimStart(source.path, '/')),
            vscode.Uri.joinPath(this.getInstallPath(), trimStart(destination.path, '/')),
            options);
    }

    private getInstallPath(): vscode.Uri {
        if (installPathContainer.current !== null) {
            return installPathContainer.current;
        }

        const installPath = getConfiguration().installPath;
        if (installPath === '') {
            throw new UserError("Install path of Heart of Iron IV is not set.");
        }

        return installPathContainer.current = vscode.Uri.file(installPath);
    }
}
