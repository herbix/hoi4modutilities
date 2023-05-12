import * as vscode from 'vscode';
import * as path from 'path';
import { PromiseCache } from './cache';
import { isSamePath } from './nodecommon';
import { getLastModifiedAsync, readDirFiles, isFile, isDirectory, readFile, readDir, isSameUri, fileOrUriStringToUri, ensureFileScheme } from './vsccommon';
import { parseHoi4File } from '../hoiformat/hoiparser';
import { localize } from './i18n';
import { convertNodeToJson, SchemaDef, HOIPartial } from '../hoiformat/schema';
import { error } from './debug';
import { updateSelectedModFileStatus, workspaceModFilesCache } from './modfile';
import { getConfiguration, getDocumentByUri } from './vsccommon';
import { UserError } from './common';
import type * as AdmZip from 'adm-zip';
import { Hoi4FsSchema } from '../constants';
import { trimStart } from 'lodash';

const dlcZipPathsCache = new PromiseCache({
    factory: getDlcZipPaths,
    life: 10 * 60 * 1000,
});

const dlcPathsCache = new PromiseCache({
    factory: getDlcPaths,
    life: 10 * 60 * 1000,
});

let dlcZipCache: PromiseCache<AdmZip> | null = null;

if (!IS_WEB_EXT) {
    // adm-zip requires fs, which doesn't work on web.
    function getDlcZip(dlcZipPath: string): Promise<AdmZip> {
        const uri = vscode.Uri.parse(dlcZipPath);
        if (uri.scheme === Hoi4FsSchema) {
            dlcZipPath = path.join(getConfiguration().installPath, trimStart(uri.path, '/'));
        } else {
            ensureFileScheme(uri);
            dlcZipPath = uri.fsPath;
        }

        const AdmZip = require('adm-zip');
        return Promise.resolve(new AdmZip(dlcZipPath));
    }

    dlcZipCache = new PromiseCache({
        factory: getDlcZip,
        expireWhenChange: key => getLastModifiedAsync(vscode.Uri.parse(key)),
        life: 15 * 1000,
    });
}

export async function clearDlcZipCache() {
    dlcPathsCache.clear();
    dlcZipPathsCache.clear();
    dlcZipCache?.clear();
}

export async function getFilePathFromMod(relativePath: string): Promise<vscode.Uri | undefined> {
    let absolutePath: vscode.Uri | undefined = undefined;

    // Find in opened workspace folders
    if (vscode.workspace.workspaceFolders) {
        for (const folder of vscode.workspace.workspaceFolders) {
            const findPath = vscode.Uri.joinPath(folder.uri, relativePath);
            if (await isFile(findPath)) {
                absolutePath = findPath;
                break;
            }
        }
        
        if (absolutePath !== undefined) {
            // Opened document
            const document = vscode.workspace.textDocuments.find(d => isSameUri(d.uri, absolutePath!));
            if (document) {
                return document.uri.with({ fragment: ':opened' });
            }
        }
    }

    return absolutePath;
}

export async function getFilePathFromModOrHOI4(relativePath: string): Promise<vscode.Uri | undefined> {
    relativePath = relativePath.replace(/\/\/+|\\+/g, '/');
    let absolutePath = await getFilePathFromMod(relativePath);

    if (absolutePath !== undefined) {
        return absolutePath;
    }

    const replacePaths = await getReplacePaths();
    if (replacePaths) {
        const relativePathDir = path.dirname(relativePath);
        for (const replacePath of replacePaths) {
            if (isSamePath(relativePathDir, replacePath)) {
                return absolutePath;
            }
        }
    }

    // Find in HOI4 install path
    const installPath = vscode.Uri.parse(Hoi4FsSchema + ':/');
    if (!absolutePath) {
        const findPath = vscode.Uri.joinPath(installPath, relativePath);
        if (await isFile(findPath)) {
            absolutePath = findPath;
        }
    }

    // Find in HOI4 DLCs
    const conf = getConfiguration();
    if (!absolutePath && conf.loadDlcContents) {
        const dlcs = await dlcZipPathsCache.get(installPath.toString());
        if (dlcs !== null && dlcZipCache !== null) {
            for (const dlc of dlcs) {
                const dlcZip = await dlcZipCache.get(dlc.toString());
                const entry = dlcZip.getEntry(relativePath);
                if (entry !== null) {
                    return dlc.with({ fragment: relativePath });
                }
            }
        }

        const dlcFolders = await dlcPathsCache.get(installPath.toString());
        if (dlcFolders !== null) {
            for (const dlc of dlcFolders) {
                const findPath = vscode.Uri.joinPath(dlc, relativePath);
                if (await isFile(findPath)) {
                    return findPath;
                }
            }
        }
    }

    return absolutePath;
}

export function isHoiFileOpened(path: vscode.Uri): boolean {
    return path.fragment === ':opened';
}

export function getHoiOpenedFileOriginalUri(path: vscode.Uri): vscode.Uri {
    return path.with({ fragment: '' });
}

export function isHoiFileFromDlc(path: vscode.Uri): boolean {
    return path.fragment !== '' && path.path.endsWith('.zip');
}

export function getHoiDlcFileOriginalUri(path: vscode.Uri): { uri: vscode.Uri, entryPath: string } {
    return { uri: path.with({ fragment: '' }), entryPath: path.fragment };
}

export async function hoiFileExpiryToken(relativePath: string): Promise<string> {
    return await expiryToken(await getFilePathFromModOrHOI4(relativePath));;
}

export async function expiryToken(realPath: vscode.Uri | undefined): Promise<string> {
    if (!realPath) {
        return '';
    }

    if (isHoiFileOpened(realPath)) {
        return realPath.toString() + '@' + Date.now();
    } else if (isHoiFileFromDlc(realPath)) {
        return realPath.with({ fragment: '' }).toString() + '@' + await getLastModifiedAsync(realPath);
    }

    return realPath.toString() + '@' + await getLastModifiedAsync(realPath);
}

export async function readFileFromPath(realPath: vscode.Uri, relativePath?: string): Promise<[Buffer, vscode.Uri]> {
    if (isHoiFileOpened(realPath)) {
        const realPathWithoutOpenMark = getHoiOpenedFileOriginalUri(realPath);
        const document = getDocumentByUri(realPathWithoutOpenMark);
        if (document) {
            return [Buffer.from(document.getText()), realPath];
        }

        realPath = realPathWithoutOpenMark;

    } else if (realPath.fragment !== '' && realPath.path.endsWith('.zip')) {
        if (dlcZipCache !== null) {
            const { uri: dlc, entryPath: filePath } = getHoiDlcFileOriginalUri(realPath);

            const dlcZip = await dlcZipCache.get(dlc.toString());
            const entry = dlcZip.getEntry(filePath);
            if (entry !== null) {
                return [await new Promise<Buffer>(resolve => entry.getDataAsync(resolve)), realPath];
            }
        }

        throw new UserError("Can't find file " + relativePath);
    }

    return [ await readFile(realPath), realPath ];
}

export async function readFileFromModOrHOI4(relativePath: string): Promise<[Buffer, vscode.Uri]> {
    const realPath = await getFilePathFromModOrHOI4(relativePath);

    if (!realPath) {
        throw new UserError("Can't find file " + relativePath);
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
            const findPath = vscode.Uri.joinPath(folder.uri, relativePath);
            if (await isDirectory(findPath)) {
                try {
                    result.push(...await readDirFiles(findPath));
                } catch(e) {}
            }
        }
    }

    const replacePaths = await getReplacePaths();
    if (replacePaths) {
        for (const replacePath of replacePaths) {
            if (isSamePath(relativePath, replacePath)) {
                return result.filter((v, i, a) => i === a.indexOf(v));
            }
        }
    }

    // Find in HOI4 install path
    const conf = getConfiguration();
    const installPath = vscode.Uri.parse(Hoi4FsSchema + ':/');
    {
        const findPath = vscode.Uri.joinPath(installPath, relativePath);
        if (await isDirectory(findPath)) {
            try {
                result.push(...await readDirFiles(findPath));
            } catch(e) {}
        }
    }

    // Find in HOI4 DLCs
    if (conf.loadDlcContents) {
        const dlcs = await dlcZipPathsCache.get(installPath.toString());
        if (dlcs !== null && dlcZipCache !== null) {
            for (const dlc of dlcs) {
                const dlcZip = await dlcZipCache.get(dlc.toString());
                const folderEntry = dlcZip.getEntry(relativePath);
                if (folderEntry && folderEntry.isDirectory) {
                    for (const entry of dlcZip.getEntries()) {
                        if (isSamePath(path.dirname(entry.entryName.replace(/^[\\/]/, '')), relativePath) && !entry.isDirectory) {
                            result.push(path.basename(entry.name));
                        }
                    }
                }
            }
        }

        const dlcFolders = await dlcPathsCache.get(installPath.toString());
        if (dlcFolders !== null) {
            for (const dlc of dlcFolders) {
                const findPath = vscode.Uri.joinPath(dlc, relativePath);
                if (await isDirectory(findPath)) {
                    try {
                        result.push(...await readDirFiles(findPath));
                    } catch(e) {}
                }
            }
        }
    }

    return result.filter((v, i, a) => i === a.indexOf(v));
}

async function getDlcZipPaths(installPath: string): Promise<vscode.Uri[] | null> {
    const dlcPath = vscode.Uri.joinPath(vscode.Uri.parse(installPath), 'dlc');
    if (!await isDirectory(dlcPath)) {
        return null;
    }

    const dlcFolders = await readDir(dlcPath);
    const paths = await Promise.all(dlcFolders.map(async (dlcFolder) => {
        const dlcZipFolder = vscode.Uri.joinPath(dlcPath, dlcFolder);
        if (await isDirectory(dlcZipFolder)) {
            const files =  await readDir(dlcZipFolder);
            const zipFile = files.find(file => file.endsWith('.zip'));
            if (zipFile) {
                return vscode.Uri.joinPath(dlcZipFolder, zipFile);
            }
        }

        return null;
    }));

    return paths.filter((path): path is vscode.Uri => path !== null);
}

async function getDlcPaths(installPath: string): Promise<vscode.Uri[] | null> {
    const dlcPath = vscode.Uri.joinPath(vscode.Uri.parse(installPath), 'dlc');
    if (!await isDirectory(dlcPath)) {
        return null;
    }

    const dlcFolders = await readDir(dlcPath);
    const paths = await Promise.all(dlcFolders.map(async (dlcFolder) => {
        const dlcZipFolder = vscode.Uri.joinPath(dlcPath, dlcFolder);
        if (await isDirectory(dlcZipFolder) && dlcFolder.startsWith("dlc")) {
            return dlcZipFolder;
        }

        return null;
    }));

    return paths.filter((path): path is vscode.Uri => path !== null);
}

const replacePathsCache = new PromiseCache({
    factory: getReplacePathsFromModFile,
    expireWhenChange: key => getLastModifiedAsync(vscode.Uri.parse(key)),
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
    let modFile = fileOrUriStringToUri(conf.modFile);

    if (conf.modFile === "") {
        if (vscode.workspace.workspaceFolders) {
            for (const workspaceFolder of vscode.workspace.workspaceFolders) {
                const workspaceFolderPath = workspaceFolder.uri;
                const mods = await workspaceModFilesCache.get(workspaceFolderPath.toString());
                if (mods.length > 0) {
                    modFile = mods[0];
                    break;
                }
            }
        }
    }

    try {
        if (modFile && await isFile(modFile)) {
            const result = await replacePathsCache.get(modFile.toString());
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
    const content = (await readFile(vscode.Uri.parse(absolutePath))).toString();
    const node = parseHoi4File(content, localize('infile', 'In file {0}:\n', absolutePath));
    const modFile = convertNodeToJson<ModFile>(node, modFileSchema);
    return modFile.replace_path.filter((v): v is string => typeof v === 'string');
}
