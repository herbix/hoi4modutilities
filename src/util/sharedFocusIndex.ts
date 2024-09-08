import * as vscode from 'vscode';
import * as path from 'path';
import { debounceByInput } from './common';
import { listFilesFromModOrHOI4, readFileFromModOrHOI4 } from './fileloader';
import { localize } from './i18n';
import { sendEvent } from './telemetry';
import { Logger } from "./logger";
import { getFocusTree } from "../previewdef/focustree/schema";
import { parseHoi4File } from "../hoiformat/hoiparser";
import { sharedFocusIndex } from "./featureflags";

interface FocusIndex {
    [file: string]: string[]; // Filename -> array of focus keys
}

const globalFocusIndex: FocusIndex = {};
let workspaceFocusIndex: FocusIndex = {};

export function registerSharedFocusIndex(): vscode.Disposable {
    const disposables: vscode.Disposable[] = [];

    if (sharedFocusIndex) {
        const estimatedSize: [number] = [0];

        const task = Promise.all([
            buildGlobalFocusIndex(estimatedSize),
            buildWorkspaceFocusIndex(estimatedSize)
        ]);

        vscode.window.setStatusBarMessage('$(loading~spin) ' + localize('sharedFocusIndex.building', 'Building Shared Focus index...'), task);
        task.then(() => {
            vscode.window.showInformationMessage(localize('sharedFocusIndex.builddone', 'Building Shared Focus index done.'));
            sendEvent('sharedFocusIndex', { size: estimatedSize[0].toString() });
        });

        disposables.push(vscode.workspace.onDidChangeWorkspaceFolders(onChangeWorkspaceFolders));
        disposables.push(vscode.workspace.onDidChangeTextDocument(onChangeTextDocument));
        disposables.push(vscode.workspace.onDidCloseTextDocument(onCloseTextDocument));
        disposables.push(vscode.workspace.onDidCreateFiles(onCreateFiles));
        disposables.push(vscode.workspace.onDidDeleteFiles(onDeleteFiles));
        disposables.push(vscode.workspace.onDidRenameFiles(onRenameFiles));
    }

    return vscode.Disposable.from(...disposables);
}

async function buildGlobalFocusIndex(estimatedSize: [number]): Promise<void> {
    const options = { mod: false, hoi4: true, recursively: true };
    const focusFiles = await listFilesFromModOrHOI4('common/national_focus', options);
    await Promise.all(focusFiles.map(f => fillFocusItems('common/national_focus/' + f, globalFocusIndex, options, estimatedSize)));
}

async function buildWorkspaceFocusIndex(estimatedSize: [number]): Promise<void> {
    const options = { mod: true, hoi4: false, recursively: true };
    const focusFiles = await listFilesFromModOrHOI4('common/national_focus', options);
    await Promise.all(focusFiles.map(f => fillFocusItems('common/national_focus/' + f, workspaceFocusIndex, options, estimatedSize)));
}

async function fillFocusItems(focusFile: string, focusIndex: FocusIndex, options: { mod?: boolean; hoi4?: boolean }, estimatedSize?: [number]): Promise<void> {
    const [fileBuffer, uri] = await readFileFromModOrHOI4(focusFile, options);
    const fileContent = fileBuffer.toString();

    try {
        const sharedFocusTrees: any[] = [];
        const focusTrees = getFocusTree(parseHoi4File(fileContent, localize('infile', 'In file {0}:\n', focusFile)), sharedFocusTrees, focusFile);

        // Only store focus trees where isSharedFocues is true
        focusTrees.forEach(tree => {
            if (tree.isSharedFocues) {
                const focusKeys = Object.keys(tree.focuses);
                focusIndex[focusFile] = focusKeys;
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

// Function to find the file name containing the specified focus key
export function findFileByFocusKey(key: string): string | undefined {
    let result: string | undefined;

    // Search in globalFocusIndex first
    for (const file in globalFocusIndex) {
        if (globalFocusIndex[file].includes(key)) {
            result = file;
            break;
        }
    }

    // Always search in workspaceFocusIndex, and if found, override the result
    for (const file in workspaceFocusIndex) {
        if (workspaceFocusIndex[file].includes(key)) {
            result = file;
            break;
        }
    }

    return result;
}

function onChangeWorkspaceFolders(_: vscode.WorkspaceFoldersChangeEvent) {
    // Clear the workspace focus index
    workspaceFocusIndex = {};

    const estimatedSize: [number] = [0];
    const task = buildWorkspaceFocusIndex(estimatedSize);
    vscode.window.setStatusBarMessage('$(loading~spin) ' + localize('sharedFocusIndex.workspace.building', 'Building workspace Focus index...'), task);
    task.then(() => {
        vscode.window.showInformationMessage(localize('sharedFocusIndex.workspace.builddone', 'Building workspace Focus index done.'));
        sendEvent('sharedFocusIndex.workspace', { size: estimatedSize[0].toString() });
    });
}

function onChangeTextDocument(e: vscode.TextDocumentChangeEvent) {
    const file = e.document.uri;
    if (file.path.endsWith('.txt')) {
        onChangeTextDocumentImpl(file);
    }
}

const onChangeTextDocumentImpl = debounceByInput(
    (file: vscode.Uri) => {
        removeWorkspaceFocusIndex(file);
        addWorkspaceFocusIndex(file);
    },
    file => file.toString(),
    1000,
    { trailing: true }
);

function onCloseTextDocument(document: vscode.TextDocument) {
    const file = document.uri;
    if (file.path.endsWith('.txt')) {
        removeWorkspaceFocusIndex(file);
        addWorkspaceFocusIndex(file);
    }
}

function onCreateFiles(e: vscode.FileCreateEvent) {
    for (const file of e.files) {
        if (file.path.endsWith('.txt')) {
            addWorkspaceFocusIndex(file);
        }
    }
}

function onDeleteFiles(e: vscode.FileDeleteEvent) {
    for (const file of e.files) {
        if (file.path.endsWith('.txt')) {
            removeWorkspaceFocusIndex(file);
        }
    }
}

function onRenameFiles(e: vscode.FileRenameEvent) {
    onDeleteFiles({ files: e.files.map(f => f.oldUri) });
    onCreateFiles({ files: e.files.map(f => f.newUri) });
}

function removeWorkspaceFocusIndex(file: vscode.Uri) {
    const wsFolder = vscode.workspace.getWorkspaceFolder(file);
    if (wsFolder) {
        const relative = path.relative(wsFolder.uri.path, file.path).replace(/\\+/g, '/');
        if (relative && relative.startsWith('common/national_focus/')) {
            delete workspaceFocusIndex[relative];
        }
    }
}

function addWorkspaceFocusIndex(file: vscode.Uri) {
    const wsFolder = vscode.workspace.getWorkspaceFolder(file);
    if (wsFolder) {
        const relative = path.relative(wsFolder.uri.path, file.path).replace(/\\+/g, '/');
        if (relative && relative.startsWith('common/national_focus/')) {
            fillFocusItems(relative, workspaceFocusIndex, { hoi4: false });
        }
    }
}