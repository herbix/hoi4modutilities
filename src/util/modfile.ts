import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { ConfigurationKey, Commands } from '../constants';
import { readdir } from './nodecommon';
import { PromiseCache } from './cache';
import { localize } from './i18n';
import { getConfiguration } from './vsccommon';

export const modFileStatusContainer: { current: vscode.StatusBarItem | null } = {
    current: null,
};

export const workspaceModFilesCache = new PromiseCache({
    factory: getWorkspaceModFiles,
    life: 10 * 1000,
});

export function registerModFile(): vscode.Disposable {
    const disposables: vscode.Disposable[] = [];
    disposables.push(vscode.commands.registerCommand(Commands.SelectModFile, selectModFile));
    disposables.push(modFileStatusContainer.current = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 50));
    disposables.push(vscode.workspace.onDidChangeConfiguration(onChangeWorkspaceConfiguration));
    disposables.push(new vscode.Disposable(() => { modFileStatusContainer.current = null; }));

    // Initial status bar
    checkAndUpdateModFileStatus(getConfiguration().modFile);
    return vscode.Disposable.from(...disposables);
}

export function updateSelectedModFileStatus(modFile: string | undefined, error: boolean = false): void {
    if (modFileStatusContainer.current) {
        const modName = modFileStatusContainer.current;
        if (modFile) {
            const modFileName = path.basename(modFile, ".mod");
            modName.command = Commands.SelectModFile;
            modName.text = (error ? "$(error) " : "$(file-code) ") + modFileName;
            modName.tooltip = (error ? localize('modfile.errorreading', "Error reading this file: ") : '') + modFile;
            modName.show();
        } else {
            modName.command = Commands.SelectModFile;
            modName.text = "$(file-code) " + localize('modfile.nomodfile', '(No mod descriptor)');
            modName.tooltip = localize('modfile.clicktoselect', 'Click to select a mod file...');
            modName.show();
        }
    }
}

function onChangeWorkspaceConfiguration(e: vscode.ConfigurationChangeEvent): void {
    if (e.affectsConfiguration(`${ConfigurationKey}.modFile`)) {
        checkAndUpdateModFileStatus(getConfiguration().modFile);
    }
}

function checkAndUpdateModFileStatus(modFile: string | undefined): void {
    if (modFile === undefined || modFile.trim() === '') {
        updateSelectedModFileStatus(undefined);
        return;
    }

    const error = !fs.existsSync(modFile);
    updateSelectedModFileStatus(modFile, error);
    if (error) {
        vscode.window.showErrorMessage(localize('modfile.filenotexist', 'Mod file not exist: {0}', modFile));
    }
}

async function selectModFile(): Promise<void> {
    const conf = getConfiguration();
    const modFileInspect = conf.inspect<string>('modFile');
    const modsList: (vscode.QuickPickItem & { selectModFile?: true })[] = !modFileInspect?.globalValue ? [] : [{
        label: path.basename(modFileInspect.globalValue, '.mod'),
        description: localize('modfile.globalsetting', 'Global setting'),
        detail: modFileInspect.globalValue
    }];

    let selected = conf.modFile.trim();

    workspaceModFilesCache.clear();
    if (vscode.workspace.workspaceFolders) {
        for (const workspaceFolder of vscode.workspace.workspaceFolders) {
            const workspaceFolderPath = workspaceFolder.uri.fsPath;
            const mods = await workspaceModFilesCache.get(workspaceFolderPath);
            if (selected === '' && mods.length > 0) {
                selected = mods[0];
            }
            modsList.push(...mods.map(mod => ({
                label: path.basename(mod, '.mod'),
                description: localize('modfile.infolder', 'In folder {0}', path.basename(workspaceFolderPath)),
                detail: mod,
            })));
        }
    }

    modsList.forEach(r => r.detail === selected ? r.picked = true : undefined);
    if (modsList.every(r => !r.picked) && selected !== '') {
        modsList.push({
            label: path.basename(selected, '.mod'),
            description: localize('modfile.workspacesetting', 'Workspace setting'),
            detail: selected,
            picked: true,
        });
    }

    modsList.sort((a, b) => a.picked ? -1 : b.picked ? 1 : 0);

    modsList.push({
        label: localize('modfile.select', 'Browse a .mod file...'),
        selectModFile: true,
    });

    const selectResult = await vscode.window.showQuickPick(modsList, { placeHolder: localize('modfile.selectworkingmod', 'Select working mod') });

    if (selectResult) {
        let modPath = selectResult.detail;
        if (selectResult.selectModFile) {
            const result = await vscode.window.showOpenDialog({ filters: { [localize('modfile.type', 'Mod file')]: ['mod'] } });
            if (result) {
                modPath = result[0].fsPath;
            } else {
                return;
            }
        }
        
        if (modPath === modFileInspect?.globalValue) {
            conf.update('modFile', undefined, vscode.ConfigurationTarget.Workspace);
        } else {
            conf.update('modFile', modPath, vscode.ConfigurationTarget.Workspace);
        }

        checkAndUpdateModFileStatus(modPath);
    }
}

async function getWorkspaceModFiles(absolutePath: string): Promise<string[]> {
    const items = await readdir(absolutePath);
    return items.filter(i => i.endsWith('.mod')).map(i => path.join(absolutePath, i));
}
