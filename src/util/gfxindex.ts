import * as vscode from 'vscode';
import * as path from 'path';
import { parseHoi4File } from '../hoiformat/hoiparser';
import { getSpriteTypes } from '../hoiformat/spritetype';
import { debounceByInput, forceError, UserError } from './common';
import { error } from './debug';
import { gfxIndex } from './featureflags';
import { listFilesFromModOrHOI4, readFileFromModOrHOI4 } from './fileloader';
import { localize } from './i18n';
import { uniq } from 'lodash';
import { sendEvent } from './telemetry';

interface GfxIndexItem {
    file: string;
}

const globalGfxIndex: Record<string, GfxIndexItem | undefined> = {};
let workspaceGfxIndex: Record<string, GfxIndexItem | undefined> = {};

export function registerGfxIndex(): vscode.Disposable {
    const disposables: vscode.Disposable[] = [];
    if (gfxIndex) {
        const estimatedSize: [number] = [0];
        const task = Promise.all([ buildGlobalGfxIndex(estimatedSize), buildWorkspaceGfxIndex(estimatedSize) ]);
        vscode.window.setStatusBarMessage('$(loading~spin) ' + localize('gfxindex.building', 'Building GFX index...'), task);
        task.then(() => {
            vscode.window.showInformationMessage(localize('gfxindex.builddone', 'Building GFX index done.'));
            sendEvent('gfxIndex', { size: estimatedSize[0].toString() });
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

export async function getGfxContainerFile(gfxName: string | undefined): Promise<string | undefined> {
    if (!gfxIndex || !gfxName) {
        return undefined;
    }

    return (globalGfxIndex[gfxName] ?? workspaceGfxIndex[gfxName])?.file;
}

export async function getGfxContainerFiles(gfxNames: (string | undefined)[]): Promise<string[]> {
    return uniq((await Promise.all(gfxNames.map(getGfxContainerFile))).filter((v): v is string => v !== undefined));
}

async function buildGlobalGfxIndex(estimatedSize: [number]): Promise<void> {
    const options = { mod: false, recursively: true };
    const gfxFiles = (await listFilesFromModOrHOI4('interface', options)).filter(f => f.toLocaleLowerCase().endsWith('.gfx'));
    await Promise.all(gfxFiles.map(f => fillGfxItems('interface/' + f, globalGfxIndex, options, estimatedSize)));
}

async function buildWorkspaceGfxIndex(estimatedSize: [number]): Promise<void> {
    const options = { hoi4: false, recursively: true };
    const gfxFiles = (await listFilesFromModOrHOI4('interface', options)).filter(f => f.toLocaleLowerCase().endsWith('.gfx'));
    await Promise.all(gfxFiles.map(f => fillGfxItems('interface/' + f, workspaceGfxIndex, options, estimatedSize)));
}

async function fillGfxItems(gfxFile: string, gfxIndex: Record<string, GfxIndexItem | undefined>, options: { mod?: boolean, hoi4?: boolean }, estimatedSize?: [number]): Promise<void> {
    try {
        if (estimatedSize) {
            estimatedSize[0] += gfxFile.length;
        }
        const [fileBuffer, uri] = await readFileFromModOrHOI4(gfxFile, options);
        const spriteTypes = getSpriteTypes(parseHoi4File(fileBuffer.toString(), localize('infile', 'In file {0}:\n', uri.toString())));
        for (const spriteType of spriteTypes) {
            gfxIndex[spriteType.name] = { file: gfxFile };
            if (estimatedSize) {
                estimatedSize[0] += spriteType.name.length + 8;
            }
        }
    } catch(e) {
        error(new UserError(forceError(e).toString()));
    }
}

function onChangeWorkspaceFolders(_: vscode.WorkspaceFoldersChangeEvent) {
    workspaceGfxIndex = {};
    const estimatedSize: [number] = [0];
    const task = buildWorkspaceGfxIndex(estimatedSize);
    vscode.window.setStatusBarMessage('$(loading~spin) ' + localize('gfxindex.workspace.building', 'Building workspace GFX index...'), task);
    task.then(() => {
        vscode.window.showInformationMessage(localize('gfxindex.workspace.builddone', 'Building workspace GFX index done.'));
        sendEvent('gfxIndex.workspace', { size: estimatedSize[0].toString() });
    });
}

function onChangeTextDocument(e: vscode.TextDocumentChangeEvent) {
    const file = e.document.uri;
    if (file.path.endsWith('.gfx')) {
        onChangeTextDocumentImpl(file);
    }
}

const onChangeTextDocumentImpl = debounceByInput(
    (file: vscode.Uri) => {
        removeWorkspaceGfxIndex(file);
        addWorkspaceGfxIndex(file);
    },
    file => file.toString(),
    1000,
    { trailing: true }
);

function onCloseTextDocument(document: vscode.TextDocument) {
    const file = document.uri;
    if (file.path.endsWith('.gfx')) {
        removeWorkspaceGfxIndex(file);
        addWorkspaceGfxIndex(file);
    }
}

function onCreateFiles(e: vscode.FileCreateEvent) {
    for (const file of e.files) {
        if (file.path.endsWith('.gfx')) {
            addWorkspaceGfxIndex(file);
        }
    }
}

function onDeleteFiles(e: vscode.FileDeleteEvent) {
    for (const file of e.files) {
        if (file.path.endsWith('.gfx')) {
            removeWorkspaceGfxIndex(file);
        }
    }
}

function onRenameFiles(e: vscode.FileRenameEvent) {
    onDeleteFiles({ files: e.files.map(f => f.oldUri) });
    onCreateFiles({ files: e.files.map(f => f.newUri) });
}

function removeWorkspaceGfxIndex(file: vscode.Uri) {
    const wsFolder = vscode.workspace.getWorkspaceFolder(file);
    if (wsFolder) {
        const relative = path.relative(wsFolder.uri.path, file.path).replace(/\\+/g, '/');
        if (relative && relative.startsWith('interface/')) {
            for (const key in workspaceGfxIndex) {
                if (workspaceGfxIndex[key]?.file === relative) {
                    delete workspaceGfxIndex[key];
                }
            }
        }
    }
}

function addWorkspaceGfxIndex(file: vscode.Uri) {
    const wsFolder = vscode.workspace.getWorkspaceFolder(file);
    if (wsFolder) {
        const relative = path.relative(wsFolder.uri.path, file.path).replace(/\\+/g, '/');
        if (relative && relative.startsWith('interface/')) {
            fillGfxItems(relative, workspaceGfxIndex, { hoi4: false });
        }
    }
}
