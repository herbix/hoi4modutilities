import * as vscode from 'vscode';
import * as path from 'path';
import { IndexBase } from './indexbase';
import { IndexType } from './indexmanager';
import { listFilesFromModOrHOI4, readFileFromModOrHOI4 } from '../util/fileloader';
import { parseHoi4File } from '../hoiformat/hoiparser';
import { localize } from '../util/i18n';
import { Logger } from '../util/logger';
import { getEvents } from '../previewdef/event/schema';

// event id -> event file path
class EventIndex extends IndexBase<string> {
    public type: IndexType = 'event';

    public includesFile(file: vscode.Uri): boolean {
        return file.path.endsWith('.txt') && file.path.includes('events/');
    }

    public addWorkspaceIndex(file: vscode.Uri): void {
        const wsFolder = vscode.workspace.getWorkspaceFolder(file);
        if (wsFolder) {
            const relative = path.relative(wsFolder.uri.path, file.path).replace(/\\+/g, '/');
            if (relative && relative.startsWith('events/')) {
                this.fillEventItems(relative, this._workspaceIndex, { hoi4: false, dlc: false });
            }
        }
    }

    public removeWorkspaceIndex(file: vscode.Uri): void {
        const wsFolder = vscode.workspace.getWorkspaceFolder(file);
        if (wsFolder) {
            const relative = path.relative(wsFolder.uri.path, file.path).replace(/\\+/g, '/');
            if (relative && relative.startsWith('events/')) {
                for (const [key, value] of this._workspaceIndex) {
                    if (value === relative) {
                        this._workspaceIndex.delete(key);
                    }
                }
            }
        }
    }

    public async buildIndex(index: Map<string, string>, estimatedSize: [number], options: { mod?: boolean; hoi4?: boolean; dlc?: boolean }): Promise<void> {
        const eventFiles = (await listFilesFromModOrHOI4('events', { ...options, recursively: true })).filter(f => f.toLocaleLowerCase().endsWith('.txt'));
        await Promise.all(eventFiles.map(f => this.fillEventItems('events/' + f, index, options, estimatedSize)));
    }

    private async fillEventItems(eventFile: string, eventIndex: Map<string, string>, options: { mod?: boolean; hoi4?: boolean, dlc?: boolean }, estimatedSize?: [number]): Promise<void> {
        const [fileBuffer, uri] = await readFileFromModOrHOI4(eventFile, options);
        const fileContent = fileBuffer.toString();

        try {
            const events = getEvents(parseHoi4File(fileContent, localize('infile', 'In file {0}:\n', eventFile)), eventFile);
            const eventItems = Object.values(events.eventItemsByNamespace).flat();
            for (const event of eventItems) {
                eventIndex.set(event.id, eventFile);
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
                Logger.error(`${baseMessage} ${eventFile} ${failureMessage}\n${e.stack}`);
            }
        }
    }
}

export const eventIndex = new EventIndex();
