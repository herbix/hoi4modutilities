import * as path from 'path';
import * as vscode from 'vscode';
import { GuiFile, guiFileSchema } from '../hoiformat/gui';
import { parseHoi4File } from '../hoiformat/hoiparser';
import { convertNodeToJson } from '../hoiformat/schema';
import { listFilesFromModOrHOI4, readFileFromModOrHOI4 } from '../util/fileloader';
import { localize } from '../util/i18n';
import { Logger } from '../util/logger';
import { IndexBase } from './indexbase';
import type { IndexType } from './indexmanager';

export type GuiIndexItemType = 'containerwindow' | 'window' | 'scrollbar' | 'extendedscrollbar';

export interface GuiIndexItem {
    type: GuiIndexItemType;
    file: string;
}

class GuiIndex extends IndexBase<GuiIndexItem> {
    public type: IndexType = 'gui';

    public includesFile(file: vscode.Uri): boolean {
        return file.path.endsWith('.gui') && file.path.includes('interface/');
    }

    public addWorkspaceIndex(file: vscode.Uri): void {
        const wsFolder = vscode.workspace.getWorkspaceFolder(file);
        if (wsFolder) {
            const relative = path.relative(wsFolder.uri.path, file.path).replace(/\\+/g, '/');
            if (relative && relative.startsWith('interface/')) {
                this.fillGuiItems(relative, this.workspaceIndex, { hoi4: false, dlc: false });
            }
        }
    }

    public removeWorkspaceIndex(file: vscode.Uri): void {
        const wsFolder = vscode.workspace.getWorkspaceFolder(file);
        if (wsFolder) {
            const relative = path.relative(wsFolder.uri.path, file.path).replace(/\\+/g, '/');
            if (relative && relative.startsWith('interface/')) {
                for (const [key, value] of this.workspaceIndex) {
                    if (value.file === relative) {
                        this.workspaceIndex.delete(key);
                    }
                }
            }
        }
    }

    protected async buildIndex(index: Map<string, GuiIndexItem>, estimatedSize: [number], options: { mod?: boolean; hoi4?: boolean; dlc?: boolean }): Promise<void> {
        const guiFiles = await this.getFiles(options);
        await Promise.all(guiFiles.map(file => this.fillGuiItems(file, index, options, estimatedSize)));
    }

    protected async getFiles(options: { mod?: boolean; hoi4?: boolean; dlc?: boolean }): Promise<string[]> {
        return (await listFilesFromModOrHOI4('interface', { ...options, recursively: true }))
            .filter(file => file.toLocaleLowerCase().endsWith('.gui'))
            .map(file => 'interface/' + file);
    }

    protected validateIndexValue(value: unknown): value is GuiIndexItem {
        if (typeof value !== 'object' || value === null) {
            return false;
        }
        const item = value as Partial<GuiIndexItem>;
        return typeof item.file === 'string' &&
            (item.type === 'containerwindow' || item.type === 'window' ||
                item.type === 'scrollbar' || item.type === 'extendedscrollbar');
    }

    private async fillGuiItems(guiFile: string, index: Map<string, GuiIndexItem>, options: { mod?: boolean; hoi4?: boolean; dlc?: boolean }, estimatedSize?: [number]): Promise<void> {
        try {
            const [fileBuffer, uri] = await readFileFromModOrHOI4(guiFile, options);
            const gui = convertNodeToJson<GuiFile>(
                parseHoi4File(fileBuffer.toString(), localize('infile', 'In file {0}:\n', uri.toString())),
                guiFileSchema);

            for (const guiTypes of gui.guitypes) {
                const itemsByType = [
                    ['containerwindow', guiTypes.containerwindowtype],
                    ['window', guiTypes.windowtype],
                    ['scrollbar', guiTypes.scrollbartype],
                    ['extendedscrollbar', guiTypes.extendedscrollbartype],
                ] as const;
                for (const [type, items] of itemsByType) {
                    for (const item of items) {
                        if (item.name) {
                            index.set(item.name, { type, file: guiFile });
                        }
                    }
                }
            }

            if (estimatedSize) {
                estimatedSize[0] += fileBuffer.length;
            }
        } catch (e) {
            const baseMessage = options.hoi4
                ? localize('prefix.vanilla', '[Vanilla]')
                : localize('prefix.mod', '[Mod]');
            const failureMessage = localize('index.error.parsingfailed', 'Parsing failed. Please check if the file has issues.');
            if (e instanceof Error) {
                Logger.error(`${baseMessage} ${guiFile} ${failureMessage}\n${e.stack}`);
            }
        }
    }
}

export const guiIndex = new GuiIndex();
