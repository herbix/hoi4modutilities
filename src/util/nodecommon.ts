import * as path from 'path';
import * as fs from 'fs';

export function matchPathEnd(pathname: string, segments: string[]): boolean {
    for (let i = segments.length - 1; i >= 0; i--) {
        const name = path.basename(pathname);
        pathname = path.dirname(pathname);

        if (segments[i] === '*') {
            continue;
        }

        if (segments[i].toLowerCase() !== name.toLowerCase()) {
            return false;
        }
    }

    return true;
}

export function getLastModified(path: string): number {
    const stat = fs.lstatSync(path);
    return stat.mtimeMs;
}

export function getLastModifiedAsync(path: string): Promise<number> {
    return lstat(path).then(s => s.mtimeMs);
}

export function readFile(path: string): Promise<Buffer> {
    return fsFuncWrapper(fs.readFile, path);
}

export function readdir(path: string): Promise<string[]> {
    return fsFuncWrapper(fs.readdir, path);
}

export async function readdirfiles(dir: string): Promise<string[]> {
    const fileNames = await fsFuncWrapper<string[]>(fs.readdir, dir);
    const stat = await Promise.all(fileNames.map<Promise<[string, fs.Stats]>>(f => Promise.all([f, lstat(path.join(dir, f))])));
    return stat.filter(s => s[1].isFile()).map(s => s[0]);
}

export function lstat(path: string): Promise<fs.Stats> {
    return fsFuncWrapper(fs.lstat, path);
}

export function writeFile(path: string, buffer: Buffer): Promise<void> {
    return fsFuncWrapperWrite(fs.writeFile, path, buffer);
}

export function mkdirs(path: string): Promise<string> {
    return fsFuncWrapperWithOption<string, { recursive: true; }>(fs.mkdir, path, { recursive: true });
}

function fsFuncWrapper<T>(func: (path: fs.PathLike, cb: (err: NodeJS.ErrnoException | null, result: T) => void) => void, path: fs.PathLike): Promise<T> {
    return new Promise<T>((resolve, reject) => func(path, (err, files) => err ? reject(err) : resolve(files)));
}

function fsFuncWrapperWithOption<T, O>(func: (path: fs.PathLike, options: O, cb: (err: NodeJS.ErrnoException | null, result: T) => void) => void, path: fs.PathLike, options: O): Promise<T> {
    return new Promise<T>((resolve, reject) => func(path, options, (err, files) => err ? reject(err) : resolve(files)));
}

function fsFuncWrapperWrite<T>(func: (path: fs.PathLike, data: T, cb: (err: NodeJS.ErrnoException | null) => void) => void, path: fs.PathLike, data: T): Promise<void> {
    return new Promise<void>((resolve, reject) => func(path, data, (err) => err ? reject(err) : resolve()));
}
