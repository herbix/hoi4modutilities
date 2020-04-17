import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export function readFileFromModOrHOI4(relativePath: string): Promise<Buffer> {
    let absolutePath: string | null = null;
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

    if (!absolutePath) {
        const conf = vscode.workspace.getConfiguration('hoi4modutilities');
        const installPath: string = conf.installPath;

        const findPath = path.join(installPath, relativePath);
        if (fs.existsSync(findPath)) {
            absolutePath = findPath;
        }
    }

    if (!absolutePath) {
        return Promise.reject(new Error("Can't find file " + relativePath));
    }

    return new Promise<Buffer>((resolve, reject) => {
        fs.readFile(absolutePath!, (err, data) => err ? reject(err) : resolve(data));
    });
}
