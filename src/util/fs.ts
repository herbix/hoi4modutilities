import * as vscode from 'vscode';
import { Hoi4FsScheme } from '../constants';
import { hoi4FsProvider } from './hoifs';

let nodeFs: vscode.FileSystem | undefined = undefined;

if (!IS_WEB_EXT) {
    const fs: typeof import('fs/promises') = require('fs/promises');
    const emfileRetryCount = 20;
    const emfileRetryDelay = 100;

    async function retryOnEmfile<T>(operation: () => Promise<T>): Promise<T> {
        for (let retryCount = 0; ; retryCount++) {
            try {
                return await operation();
            } catch (error) {
                if ((error as NodeJS.ErrnoException)?.code !== 'EMFILE' || retryCount >= emfileRetryCount) {
                    throw error;
                }
                await new Promise(resolve => setTimeout(resolve, emfileRetryDelay));
            }
        }
    }

    nodeFs = {
        async stat(uri: vscode.Uri): Promise<vscode.FileStat> {
            const stat = await retryOnEmfile(() => fs.stat(uri.fsPath));
            return {
                type: stat.isFile() ? vscode.FileType.File : stat.isDirectory() ? vscode.FileType.Directory : vscode.FileType.Unknown,
                ctime: stat.ctimeMs,
                mtime: stat.mtimeMs,
                size: stat.size,
            };
        },
        async readDirectory(uri: vscode.Uri): Promise<[string, vscode.FileType][]> {
            const entries = await retryOnEmfile(() => fs.readdir(uri.fsPath, { withFileTypes: true }));
            return entries.map(entry => [entry.name, entry.isFile() ? vscode.FileType.File : entry.isDirectory() ? vscode.FileType.Directory : vscode.FileType.Unknown]);
        },
        async createDirectory(uri: vscode.Uri): Promise<void> {
            await retryOnEmfile(() => fs.mkdir(uri.fsPath, { recursive: true }));
        },
        async readFile(uri: vscode.Uri): Promise<Uint8Array> {
            return await retryOnEmfile(() => fs.readFile(uri.fsPath));
        },
        async writeFile(uri: vscode.Uri, content: Uint8Array): Promise<void> {
            await retryOnEmfile(() => fs.writeFile(uri.fsPath, content));
        },
        async delete(uri: vscode.Uri, options: { recursive: boolean; }): Promise<void> {
            await retryOnEmfile(() => fs.rm(uri.fsPath, { recursive: options.recursive }));
        },
        async rename(oldUri: vscode.Uri, newUri: vscode.Uri, options: { overwrite: boolean; }): Promise<void> {
            await retryOnEmfile(() => fs.rename(oldUri.fsPath, newUri.fsPath));
        },
        async copy(source: vscode.Uri, destination: vscode.Uri, options: { overwrite: boolean; }): Promise<void> {
            await retryOnEmfile(() => fs.copyFile(source.fsPath, destination.fsPath));
        },
        isWritableFileSystem(scheme: string): boolean {
            return scheme === 'file';
        },
    };
}

const hoi4Fs: vscode.FileSystem = {
    async stat(uri: vscode.Uri): Promise<vscode.FileStat> {
        return await hoi4FsProvider.stat(uri);
    },
    async readDirectory(uri: vscode.Uri): Promise<[string, vscode.FileType][]> {
        return await hoi4FsProvider.readDirectory(uri);
    },
    async createDirectory(uri: vscode.Uri): Promise<void> {
        await hoi4FsProvider.createDirectory(uri);
    },
    async readFile(uri: vscode.Uri): Promise<Uint8Array> {
        return await hoi4FsProvider.readFile(uri);
    },
    async writeFile(uri: vscode.Uri, content: Uint8Array): Promise<void> {
        await hoi4FsProvider.writeFile(uri, content, { create: true, overwrite: true });
    },
    async delete(uri: vscode.Uri, options: { recursive: boolean; }): Promise<void> {
        await hoi4FsProvider.delete(uri, options);
    },
    async rename(oldUri: vscode.Uri, newUri: vscode.Uri, options: { overwrite: boolean; }): Promise<void> {
        await hoi4FsProvider.rename(oldUri, newUri, options);
    },
    async copy(source: vscode.Uri, destination: vscode.Uri, options: { overwrite: boolean; }): Promise<void> {
        await hoi4FsProvider.copy(source, destination, options);
    },
    isWritableFileSystem(scheme: string): boolean {
        return false;
    },
};

export function getFs(uri: vscode.Uri): vscode.FileSystem {
    // Reduce calling vscode.workspace.fs to speed up.
    if (uri.scheme === 'file' && uri.fsPath && nodeFs) {
        return nodeFs;
    }
    if (uri.scheme === Hoi4FsScheme) {
        return hoi4Fs;
    }
    return vscode.workspace.fs;
}
