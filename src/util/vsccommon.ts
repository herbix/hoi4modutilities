import * as vscode from 'vscode';
import * as path from 'path';
import { localize } from './i18n';
import { UserError } from './common';
import { isSamePath } from './nodecommon';
import { ConfigurationKey } from '../constants';

export function getConfiguration() {
    return vscode.workspace.getConfiguration(ConfigurationKey);
}

export function getDocumentByUri(uri: vscode.Uri): vscode.TextDocument | undefined {
    return vscode.workspace.textDocuments.find(document => document.uri.toString() === uri.toString());
}

export function getRelativePathInWorkspace(uri: vscode.Uri): string {
    const folder = vscode.workspace.getWorkspaceFolder(uri);
    if (folder) {
        return path.relative(folder.uri.path, uri.path).replace(/\\/g, '/');
    } else {
        ensureFileScheme(uri);
        return uri.fsPath;
    }
}

export function isFileScheme(uri: vscode.Uri) {
    return uri.scheme === 'file';
}

export function ensureFileScheme(uri: vscode.Uri) {
    if (!isFileScheme(uri)) {
        throw new UserError(localize('filenotondisk', 'File is not on disk: {0}.', uri.toString()));
    }
}

export function isSameUri(uriA: vscode.Uri, uriB: vscode.Uri) {
    return (isFileScheme(uriA) && isFileScheme(uriB) && isSamePath(uriA.fsPath, uriB.fsPath)) || uriA.toString() === uriB.toString();
}

export async function getLastModifiedAsync(path: vscode.Uri): Promise<number> {
    return (await vscode.workspace.fs.stat(path)).mtime;
}

export async function readDir(dir: vscode.Uri): Promise<string[]> {
    return (await vscode.workspace.fs.readDirectory(dir)).map(f => f[0]);
}

export async function readDirFiles(dir: vscode.Uri): Promise<string[]> {
    return (await vscode.workspace.fs.readDirectory(dir)).filter(f => f[1] === vscode.FileType.File).map(f => f[0]);
}

export async function readFile(path: vscode.Uri): Promise<Buffer> {
    return Buffer.from(await vscode.workspace.fs.readFile(path));
}

export async function writeFile(path: vscode.Uri, buffer: Buffer): Promise<void> {
    return await vscode.workspace.fs.writeFile(path, buffer);
}

export async function mkdirs(path: vscode.Uri): Promise<void> {
    await vscode.workspace.fs.createDirectory(path);
}

export async function isFile(path: vscode.Uri): Promise<boolean> {
    try {
        return (await vscode.workspace.fs.stat(path)).type === vscode.FileType.File;
    } catch (e) {
        return false;
    }
}

export async function isDirectory(path: vscode.Uri): Promise<boolean> {
    try {
        return (await vscode.workspace.fs.stat(path)).type === vscode.FileType.Directory;
    } catch (e) {
        return false;
    }
}

export function dirUri(uri: vscode.Uri): vscode.Uri {
    const updatedPath = path.dirname(uri.path);
    return uri.with({ path: updatedPath });
}

export function basename(uri: vscode.Uri, ext?: string): string {
    return path.basename(uri.path, ext);
}

export function fileOrUriStringToUri(path: string): vscode.Uri | undefined {
    if (path.trim() === '') {
        return undefined;
    }

    try {
        if (path.indexOf(':') > 2) { // try to avoid prefix like "D:\"
            return vscode.Uri.parse(path);
        } else {
            return vscode.Uri.file(path);
        }
    } catch (e) {
        return undefined;
    }
}

export function uriToFilePathWhenPossible(uri: vscode.Uri): string {
    if (isFileScheme(uri)) {
        return uri.fsPath;
    }

    return uri.toString();
}

