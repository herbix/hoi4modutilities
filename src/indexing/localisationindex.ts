import * as vscode from 'vscode';
import * as path from 'path';
import { chain } from 'lodash';
import { getLanguageIdInYml } from '../util/vsccommon';
import { IndexBase } from './indexbase';
import { indexManager, IndexType } from './indexmanager';
import { listFilesFromModOrHOI4, readFileFromModOrHOI4 } from '../util/fileloader';
import { localize } from '../util/i18n';
import { ConfigurationKey } from '../constants';
import { parseLocalisationYaml } from '../util/yaml';
import { Logger } from '../util/logger';
import { error } from '../util/debug';

interface LocalisationEntry {
    file: string;
    value: string;
}

// localisation key -> {yml file path, value}
class LocalisationIndex extends IndexBase<LocalisationEntry> {
    public type: IndexType = 'localisation';

    private indexUpdatedEventEmitter: vscode.EventEmitter<void> | undefined;

    public override register(indexUpdatedEventEmitter: vscode.EventEmitter<void>): vscode.Disposable {
        const disposables: vscode.Disposable[] = [];
        disposables.push(vscode.workspace.onDidChangeConfiguration(this.onChangeConfiguration, this));
        this.indexUpdatedEventEmitter = indexUpdatedEventEmitter;
        return vscode.Disposable.from(...disposables);
    }

    public includesFile(file: vscode.Uri): boolean {
        return file.path.endsWith('.yml') && file.path.includes('localisation/');
    }

    public addWorkspaceIndex(file: vscode.Uri): void {
        const wsFolder = vscode.workspace.getWorkspaceFolder(file);
        if (wsFolder) {
            const relative = path.relative(wsFolder.uri.path, file.path).replace(/\\+/g, '/');
                if (relative && relative.startsWith('localisation/')) {
                this.fillLocalisationItems(relative, this._workspaceIndex, { hoi4: false, dlc: false, resolveReplacements: true });
                this.indexUpdatedEventEmitter?.fire();
            }
        }
    }

    public removeWorkspaceIndex(file: vscode.Uri): void {
        const wsFolder = vscode.workspace.getWorkspaceFolder(file);
        if (wsFolder) {
            const relative = path.relative(wsFolder.uri.path, file.path).replace(/\\+/g, '/');
            if (relative && relative.startsWith('localisation/')) {
                for (const [key, value] of this._workspaceIndex) {
                    if (value.file === relative) {
                        this._workspaceIndex.delete(key);
                    }
                }
            }
        }
    }

    public async buildIndex(index: Map<string, LocalisationEntry>, estimatedSize: [number], options: { mod?: boolean; hoi4?: boolean; dlc?: boolean }): Promise<void> {
        const localisationFiles = (await listFilesFromModOrHOI4('localisation', { ...options, recursively: true })).filter(f => f.toLocaleLowerCase().endsWith('.yml'));
        await Promise.all(localisationFiles.map(f => this.fillLocalisationItems('localisation/' + f, index, options, estimatedSize)));
        this.resolveReplacements(index);
    }

    public getLocalisationContainerFile(key: string | undefined): string | undefined {
        if (!key) {
            return undefined;
        }
        const entry = this.get(key);
        return entry?.file;
    }

    public getLocalisationContainerFiles(keys: (string | undefined)[]): string[] {
        return chain(keys)
            .map(name => this.getLocalisationContainerFile(name))
            .filter((v): v is string => v !== undefined)
            .uniq()
            .value();
    }

    public getLocalisedText(key: string | undefined): string | undefined {
        if (!key) {
            return undefined;
        }

        const entry = this.get(key);
        return entry?.value ?? key;
    }

    private onChangeConfiguration(e: vscode.ConfigurationChangeEvent): void {
        if (e.affectsConfiguration(`${ConfigurationKey}.previewLocalisation`)) {
            indexManager.rebuildIndex(this);
        }
    }

    private async fillLocalisationItems(
        localisationFile: string,
        localisationIndex: Map<string, LocalisationEntry>,
        options: { mod?: boolean, hoi4?: boolean, dlc?: boolean, resolveReplacements?: boolean } = {},
        estimatedSize?: [number]): Promise<void> {
        try {
            if (estimatedSize) {
                estimatedSize[0] += localisationFile.length;
            }
            const [fileBuffer, _] = await readFileFromModOrHOI4(localisationFile, options);
            const content = fileBuffer.toString('utf-8').replace(/^\uFEFF/, '');
            if (estimatedSize) {
                estimatedSize[0] += content.length;
            }
            const languageId = getLanguageIdInYml();
            const yamlObj = parseLocalisationYaml(content, localisationFile);
            if (yamlObj && typeof yamlObj === 'object') {
                const dict = yamlObj[languageId];
                if (dict && typeof dict === 'object' && !Array.isArray(dict)) {
                    const keys = Object.keys(dict);
                    for (const k of keys) {
                        const v = dict[k];
                        if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
                            localisationIndex.set(k, { file: localisationFile, value: v.toString() });
                        } else {
                            localisationIndex.set(k, { file: localisationFile, value: '' });
                        }
                    }
                    if (options.resolveReplacements) {
                        this.resolveReplacements(localisationIndex, keys);
                    }
                }
            }
        } catch(e) {
            const baseMessage = options.hoi4
                ? localize('prefix.vanilla', '[Vanilla]')
                : localize('prefix.mod', '[Mod]');

            const failureMessage = localize('index.error.parsingfailed', 'Parsing failed. Please check if the file has issues.');
            if (e instanceof Error) {
                Logger.error(`${baseMessage} ${localisationFile} ${failureMessage} ${e.message}\n${e.stack}`);
            }
        }
    }

    private resolveReplacements(localisationIndex: Map<string, LocalisationEntry>, keys?: string[] | undefined): void {
        try {
            const regex = /\$([^$]+)\$/g;
            const resolvingKeys = new Set<string>();
            function resolveValue(value: string): string {
                // Avoid circular references
                if (resolvingKeys.has(value)) {
                    return value;
                }
                resolvingKeys.add(value);
                try {
                    return value.replace(regex, (match, p1) => {
                        const entry = localisationIndex.get(p1);
                        if (entry) {
                            return resolveValue(entry.value);
                        } else {
                            return match;
                        }
                    });
                } finally {
                    resolvingKeys.delete(value);
                }
            }

            if (keys) {
                for (const key of keys) {
                    const entry = localisationIndex.get(key);
                    if (entry) {
                        entry.value = resolveValue(entry.value);
                    }
                }
            } else {
                for (const [_, entry] of localisationIndex) {
                    entry.value = resolveValue(entry.value);
                }
            }
        } catch (e) {
            error(e);
        }
    }
}

export const localisationIndex = new LocalisationIndex();
