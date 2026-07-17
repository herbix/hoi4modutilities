import * as vscode from 'vscode';
import * as path from 'path';
import { IndexBase } from './indexbase';
import { IndexType } from './indexmanager';
import { listFilesFromModOrHOI4, readFileFromModOrHOI4 } from '../util/fileloader';
import { parseHoi4File } from '../hoiformat/hoiparser';
import { localize } from '../util/i18n';
import { matchPathEnd } from '../util/nodecommon';
import { getFocusTree } from '../previewdef/focustree/schema';
import { Logger } from '../util/logger';

// sprite name -> focus file path
class SharedFocusIndex extends IndexBase<string> {
    public type: IndexType = 'sharedfocus';

    public includesFile(file: vscode.Uri): boolean {
        return file.path.endsWith('.txt') && matchPathEnd(file.toString().toLowerCase(), ['common', 'national_focus', '*']);
    }

    public addWorkspaceIndex(file: vscode.Uri): void {
        const wsFolder = vscode.workspace.getWorkspaceFolder(file);
        if (wsFolder) {
            const relative = path.relative(wsFolder.uri.path, file.path).replace(/\\+/g, '/');
            if (relative && relative.startsWith('common/national_focus/')) {
                this.fillFocusItems(relative, this._workspaceIndex, { hoi4: false, dlc: false });
            }
        }
    }

    public removeWorkspaceIndex(file: vscode.Uri): void {
        const wsFolder = vscode.workspace.getWorkspaceFolder(file);
        if (wsFolder) {
            const relative = path.relative(wsFolder.uri.path, file.path).replace(/\\+/g, '/');
            if (relative && relative.startsWith('common/national_focus/')) {
                for (const key in this._workspaceIndex) {
                    if (this._workspaceIndex[key] === relative) {
                        delete this._workspaceIndex[key];
                    }
                }
            }
        }
    }

    public async buildIndex(index: Record<string, string>, estimatedSize: [number], options: { mod?: boolean; hoi4?: boolean; dlc?: boolean }): Promise<void> {
        const focusFiles = (await listFilesFromModOrHOI4('common/national_focus', options)).filter(f => f.toLocaleLowerCase().endsWith('.txt'));
        await Promise.all(focusFiles.map(f => this.fillFocusItems('common/national_focus/' + f, index, options, estimatedSize)));
    }

    private async fillFocusItems(focusFile: string, focusIndex: Record<string, string>, options: { mod?: boolean; hoi4?: boolean, dlc?: boolean }, estimatedSize?: [number]): Promise<void> {
        const [fileBuffer, uri] = await readFileFromModOrHOI4(focusFile, options);
        const fileContent = fileBuffer.toString();

        try {
            const sharedFocusTrees: any[] = [];
            const focusTrees = getFocusTree(parseHoi4File(fileContent, localize('infile', 'In file {0}:\n', focusFile)), sharedFocusTrees, focusFile);

            // Only store focus trees where isSharedFocues is true
            focusTrees.forEach(tree => {
                if (tree.isSharedFocues) {
                    for (const key of Object.keys(tree.focuses)) {
                        if (focusIndex[key] === undefined) {
                            focusIndex[key] = focusFile;
                        }
                    }
                }
            });

            if (estimatedSize) {
                estimatedSize[0] += fileBuffer.length;
            }
        } catch (e) {
            const baseMessage = options.hoi4
                ? localize('sharedFocusIndex.vanilla', '[Vanilla]')
                : localize('sharedFocusIndex.mod', '[Mod]');

            const failureMessage = localize('sharedFocusIndex.parseFailure', 'Parsing failed! Please check if the file has issues!');
            if (e instanceof Error) {
                Logger.error(`${baseMessage} ${focusFile} ${failureMessage}\n${e.stack}`);
            }
        }
    }
}

export const sharedFocusIndex = new SharedFocusIndex();
