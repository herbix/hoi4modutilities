import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as AdmZip from 'adm-zip';
import { PromiseCache, Cache } from './cache';

const dlcZipPathsCache = new PromiseCache({
    factory: getDlcZipPaths,
    life: 10 * 60 * 1000,
});

const dlcZipCache = new Cache({
    factory: getDlcZip,
    life: 15 * 1000,
});

export async function readFileFromModOrHOI4(relativePath: string): Promise<[Buffer, string]> {
    relativePath = relativePath.replace(/\/\/+|\\+/g, '/');
    let absolutePath: string | null = null;

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

    // Find in HOI4 DLCs
    if (!absolutePath && conf.loadDlcContents) {
        const dlcs = await dlcZipPathsCache.get(installPath);
        if (dlcs !== null) {
            for (const dlc of dlcs) {
                const dlcZip = dlcZipCache.get(dlc);
                const entry = dlcZip.getEntry(relativePath);
                if (entry !== null) {
                    return await Promise.all([new Promise<Buffer>(resolve => entry.getDataAsync(resolve)), `${dlc}!${relativePath}`]);
                }
            }
        }
    }

    if (!absolutePath) {
        throw new Error("Can't find file " + relativePath);
    }

    return Promise.all([new Promise<Buffer>((resolve, reject) => {
        fs.readFile(absolutePath!, (err, data) => err ? reject(err) : resolve(data));
    }), absolutePath]);
}

async function getDlcZipPaths(installPath: string): Promise<string[] | null> {
    const dlcPath = path.join(installPath, 'dlc');
    if (!fs.existsSync(dlcPath)) {
        return null;
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

    return paths.filter((path): path is string => path !== null);
}

function getDlcZip(path: string): AdmZip {
    return new AdmZip(path);
}
