import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as AdmZip from 'adm-zip';
import { PromiseCache, Cache } from './cache';
import { getLastModified } from './common';

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

function getFilePathFromModOrHOI4(relativePath: string): string | undefined;
function getFilePathFromModOrHOI4(relativePath: string, canPromise: true): Promise<string | undefined>;
function getFilePathFromModOrHOI4(relativePath: string, canPromise: boolean = false): string | undefined | Promise<string | undefined> {
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
                return canPromise ? Promise.resolve(openedPath) : openedPath;
            }
        }
    }

    // Find in HOI4 install path
    const conf = vscode.workspace.getConfiguration('hoi4ModUtilities');
    const installPath: string = conf.installPath;
    if (!absolutePath) {
        const findPath = path.join(installPath, relativePath);
        if (fs.existsSync(findPath)) {
            absolutePath = findPath;
        }
    }

    function readFromDlcs(dlcs: string[] | null): string | undefined {
        if (dlcs !== null) {
            for (const dlc of dlcs) {
                const dlcZip = dlcZipCache.get(dlc);
                const entry = dlcZip.getEntry(relativePath);
                if (entry !== null) {
                    return `${dlc}?${relativePath}`;
                }
            }
        }

        return undefined;
    }

    // Find in HOI4 DLCs
    if (!absolutePath && conf.loadDlcContents) {
        if (canPromise) {
            return dlcZipPathsCache.get(installPath).then(readFromDlcs);
        } else {
            absolutePath = readFromDlcs(dlcPaths);
        }
    }

    return canPromise ? Promise.resolve(absolutePath) : absolutePath;
}

export function hoiFileExpiryToken(relativePath: string): string | undefined {
    const realPath = getFilePathFromModOrHOI4(relativePath);
    if (!realPath) {
        return undefined;
    }

    if (realPath.includes("?")) {
        const split = realPath.split('?');
        if (split[0] === 'opened') {
            return split[1] + '@' + Date.now();
        } else {
            return split[0] + '@' + getLastModified(split[0]);
        }
    }

    return realPath + '@' + getLastModified(realPath);
}

export async function readFileFromModOrHOI4(relativePath: string): Promise<[Buffer, string]> {
    const realPath = await getFilePathFromModOrHOI4(relativePath, true);

    if (!realPath) {
        throw new Error("Can't find file " + relativePath);
    }

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
                return await Promise.all([new Promise<Buffer>(resolve => entry.getDataAsync(resolve)), realPath]);
            }

            throw new Error("Can't find file " + relativePath);
        }
    }

    return Promise.all([
        new Promise<Buffer>((resolve, reject) => fs.readFile(realPath, (err, data) => err ? reject(err) : resolve(data))),
        realPath,
    ]);
}

async function getDlcZipPaths(installPath: string): Promise<string[] | null> {
    const dlcPath = path.join(installPath, 'dlc');
    if (!fs.existsSync(dlcPath)) {
        return dlcPaths = null;
    }

    const dlcFolders = await new Promise<string[]>((resolve, reject) => fs.readdir(dlcPath, (err, files) => err ? reject(err) : resolve(files)));
    const paths = await Promise.all(dlcFolders.map(async (dlcFolder) => {
        const dlcZipFolder = path.join(dlcPath, dlcFolder);
        const stats = await new Promise<fs.Stats>((resolve, reject) => fs.lstat(dlcZipFolder, (err, stats) => err ? reject(err) : resolve(stats)));
        if (stats.isDirectory()) {
            const files = await new Promise<string[]>((resolve, reject) => fs.readdir(dlcZipFolder, (err, files) => err ? reject(err) : resolve(files)));
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
