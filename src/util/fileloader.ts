import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as AdmZip from 'adm-zip';
import { PromiseCache, Cache } from './cache';
import { getLastModified, getLastModifiedAsync, readFile, readdir, lstat } from './common';
import { parseHoi4File } from '../hoiformat/hoiparser';
import { localize } from './i18n';
import { convertNodeToJson, SchemaDef, HOIPartial } from '../hoiformat/schema';
import { error } from './debug';
import { updateSelectedModFileStatus, workspaceModFilesCache } from './modfile';
import { getConfiguration } from './vsccommon';

let dlcPaths: string[] | null = null;
const dlcZipPathsCache = new PromiseCache({
    factory: getDlcZipPaths,
    life: 10 * 60 * 1000,
});

const dlcZipCache = new Cache({
    factory: getDlcZip,
    expireWhenChange: getLastModified,
    life: 15 * 1000,
});

function isSamePath(a: string, b: string): boolean {
    return path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();
}

export async function getFilePathFromModOrHOI4(relativePath: string): Promise<string | undefined> {
    relativePath = relativePath.replace(/\/\/+|\\+/g, '/');
    let absolutePath: string | undefined = undefined;

    // Find in opened workspace folders
    if (vscode.workspace.workspaceFolders) {
        for (const folder of vscode.workspace.workspaceFolders) {
            if (folder.uri.scheme !== 'file') {
                continue;
            }

            const findPath = path.join(folder.uri.fsPath, relativePath);
            if (fs.existsSync(findPath)) {
                absolutePath = findPath;
                break;
            }
        }
        
        if (absolutePath !== undefined) {
            // Opened document
            const document = vscode.workspace.textDocuments.some(d => isSamePath(d.uri.fsPath, absolutePath!));
            if (document) {
                const openedPath = 'opened?' + absolutePath;
                return openedPath;
            }
        }
    }

    const replacePaths = await getReplacePaths();
    if (replacePaths) {
        const relativePathDir = path.dirname(relativePath);
        for (const replacePath of replacePaths) {
            if (isSamePath(relativePathDir, replacePath)) {
                return undefined;
            }
        }
    }

    // Find in HOI4 install path
    const conf = getConfiguration();
    const installPath: string = conf.installPath;
    if (!absolutePath) {
        const findPath = path.join(installPath, relativePath);
        if (fs.existsSync(findPath)) {
            absolutePath = findPath;
        }
    }

    // Find in HOI4 DLCs
    if (!absolutePath && conf.loadDlcContents) {
        const dlcs = await dlcZipPathsCache.get(installPath);
        if (dlcs !== null) {
            for (const dlc of dlcs) {
                const dlcZip = dlcZipCache.get(dlc);
                const entry = dlcZip.getEntry(relativePath);
                if (entry !== null) {
                    return `${dlc}?${relativePath}`;
                }
            }
        }
    }

    return absolutePath;
}

export async function hoiFileExpiryToken(relativePath: string): Promise<string> {
    const realPath = await getFilePathFromModOrHOI4(relativePath);
    if (!realPath) {
        return '';
    }

    if (realPath.includes("?")) {
        const split = realPath.split('?');
        if (split[0] === 'opened') {
            return split[1] + '@' + Date.now();
        } else {
            return split[0] + '@' + await getLastModifiedAsync(split[0]);
        }
    }

    return realPath + '@' + await getLastModifiedAsync(realPath);
}

export async function readFileFromPath(realPath: string, relativePath?: string): Promise<[Buffer, string]> {
    if (realPath.includes("?")) {
        const split = realPath.split('?');
        if (split[0] === 'opened') {
            const absolutePath = split[1];
            const document = vscode.workspace.textDocuments.find(d => isSamePath(d.uri.fsPath, absolutePath));
            if (document) {
                return [Buffer.from(document.getText()), absolutePath];
            }
        } else {
            const dlc = split[0];
            const filePath = split[1];
            
            const dlcZip = dlcZipCache.get(dlc);
            const entry = dlcZip.getEntry(filePath);
            if (entry !== null) {
                return [await new Promise<Buffer>(resolve => entry.getDataAsync(resolve)), realPath];
            }

            throw new Error("Can't find file " + relativePath);
        }
    }

    return [ await readFile(realPath), realPath ];
}

export async function readFileFromModOrHOI4(relativePath: string): Promise<[Buffer, string]> {
    const realPath = await getFilePathFromModOrHOI4(relativePath);

    if (!realPath) {
        throw new Error("Can't find file " + relativePath);
    }

    return await readFileFromPath(realPath, relativePath);
}

export async function readFileFromModOrHOI4AsJson<T>(relativePath: string, schema: SchemaDef<T>): Promise<HOIPartial<T>> {
    const [buffer, realPath] = await readFileFromModOrHOI4(relativePath);
    const nodes = parseHoi4File(buffer.toString(), localize('infile', 'In file {0}:\n', realPath));
    return convertNodeToJson<T>(nodes, schema);
}

export async function listFilesFromModOrHOI4(relativePath: string): Promise<string[]> {
    const result: string[] = [];

    // Find in opened workspace folders
    if (vscode.workspace.workspaceFolders) {
        for (const folder of vscode.workspace.workspaceFolders) {
            if (folder.uri.scheme !== 'file') {
                continue;
            }

            const findPath = path.join(folder.uri.fsPath, relativePath);
            if (fs.existsSync(findPath)) {
                try {
                    result.push(...await readdir(findPath));
                } catch(e) {}
            }
        }
    }

    const replacePaths = await getReplacePaths();
    if (replacePaths) {
        const relativePathDir = path.dirname(relativePath);
        for (const replacePath of replacePaths) {
            if (isSamePath(relativePathDir, replacePath)) {
                return result.filter((v, i, a) => i === a.indexOf(v));
            }
        }
    }

    // Find in HOI4 install path
    const conf = getConfiguration();
    const installPath: string = conf.installPath;
    {
        const findPath = path.join(installPath, relativePath);
        if (fs.existsSync(findPath)) {
            try {
                result.push(...await readdir(findPath));
            } catch(e) {}
        }
    }

    // Find in HOI4 DLCs
    if (conf.loadDlcContents) {
        const dlcs = await dlcZipPathsCache.get(installPath);
        if (dlcs !== null) {
            for (const dlc of dlcs) {
                const dlcZip = dlcZipCache.get(dlc);
                const folderEntry = dlcZip.getEntry(relativePath);
                if (folderEntry && folderEntry.isDirectory) {
                    for (const entry of dlcZip.getEntries()) {
                        if (isSamePath(entry.entryName.replace(/^[\\/]/, ''), relativePath)) {
                            result.push(path.basename(entry.name));
                        }
                    }
                }
            }
        }
    }

    return result.filter((v, i, a) => i === a.indexOf(v));
}

async function getDlcZipPaths(installPath: string): Promise<string[] | null> {
    const dlcPath = path.join(installPath, 'dlc');
    if (!fs.existsSync(dlcPath)) {
        return dlcPaths = null;
    }

    const dlcFolders = await readdir(dlcPath);
    const paths = await Promise.all(dlcFolders.map(async (dlcFolder) => {
        const dlcZipFolder = path.join(dlcPath, dlcFolder);
        const stats = await lstat(dlcZipFolder);
        if (stats.isDirectory()) {
            const files = await readdir(dlcZipFolder);
            const zipFile = files.find(file => file.endsWith('.zip'));
            if (zipFile) {
                return path.join(dlcZipFolder, zipFile);
            }
        }

        return null;
    }));

    return dlcPaths = paths.filter((path): path is string => path !== null);
}

function getDlcZip(path: string): AdmZip {
    return new AdmZip(path);
}

const replacePathsCache = new PromiseCache({
    factory: getReplacePathsFromModFile,
    expireWhenChange: getLastModifiedAsync,
    life: 60 * 1000,
});

interface ModFile {
    replace_path: string[];
}

const modFileSchema: SchemaDef<ModFile> = {
    replace_path: {
        _innerType: "string",
        _type: "array",
    },
};

async function getReplacePaths(): Promise<string[] | undefined> {
    const conf = getConfiguration();
    let modFile = conf.modFile;

    if (modFile === "") {
        if (vscode.workspace.workspaceFolders) {
            for (const workspaceFolder of vscode.workspace.workspaceFolders) {
                const workspaceFolderPath = workspaceFolder.uri.fsPath;
                const mods = await workspaceModFilesCache.get(workspaceFolderPath);
                if (mods.length > 0) {
                    modFile = mods[0];
                    break;
                }
            }
        }
    }

    try {
        if (fs.existsSync(modFile)) {
            const result = await replacePathsCache.get(modFile);
            updateSelectedModFileStatus(modFile);
            return result;
        }
    } catch (e) {
        error(e);
    }

    updateSelectedModFileStatus(modFile, true);
    return undefined;
}

async function getReplacePathsFromModFile(absolutePath: string): Promise<string[]> {
    const content = (await readFile(absolutePath)).toString();
    const node = parseHoi4File(content, localize('infile', 'In file {0}:\n', absolutePath));
    const modFile = convertNodeToJson<ModFile>(node, modFileSchema);
    return modFile.replace_path.filter((v): v is string => typeof v === 'string');
}
