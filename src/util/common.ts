import * as path from 'path';
import * as fs from 'fs';
import { debounce, DebounceSettings } from 'lodash';

export interface NumberSize {
    width: number;
    height: number;
}

export interface NumberPosition {
    x: number;
    y: number;
}

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

export function arrayToMap<T, K extends keyof T>(items: T[], key: K):
    T[K] extends string ? Record<string, T> : T[K] extends number ? Record<number, T> : never;
export function arrayToMap<T, K extends keyof T, V>(items: T[], key: K, valueSelector: (value: T) => V):
    T[K] extends string ? Record<string, V> : T[K] extends number ? Record<number, V> : never;
export function arrayToMap<T, K extends keyof T, V = T>(items: T[], key: K, valueSelector?: (value: T) => V):
    T[K] extends string ? Record<string, V | T> : T[K] extends number ? Record<number, V | T> : never {
    const result: Record<string | number, V | T> = {};
    for (const item of items) {
        const id = item[key];
        if (typeof id !== 'string' && typeof id !== 'number') {
            throw new Error('key of arrayToMap must be a string type');
        }
        result[id] = valueSelector ? valueSelector(item) : item;
    }

    return result as any;
}

export function hsvToRgb(h: number, s: number, v: number): Record<'r'|'g'|'b', number> {
    var r: number, g: number, b: number, i: number, f: number, p: number, q: number, t: number;
    i = Math.floor(h * 6);
    f = h * 6 - i;
    p = v * (1 - s);
    q = v * (1 - f * s);
    t = v * (1 - (1 - f) * s);
    switch (i % 6) {
        case 0: r = v, g = t, b = p; break;
        case 1: r = q, g = v, b = p; break;
        case 2: r = p, g = v, b = t; break;
        case 3: r = p, g = q, b = v; break;
        case 4: r = t, g = p, b = v; break;
        case 5: r = v, g = p, b = q; break;
    }
    return {
        r: Math.round(r! * 255),
        g: Math.round(g! * 255),
        b: Math.round(b! * 255)
    };
}

export function slice<T>(array: T[] | undefined, start: number, end: number): T[] {
    if (!array) {
        return [];
    }

    if (start >= 0) {
        return array.slice(start, end);
    } else {
        if (end <= start) {
            return [];
        }

        const result = new Array<T>(end - start);
        for (let i = start, j = 0; i < end; i++, j++) {
            result[j] = array[i];
        }
        return result;
    }
}

export function distinct<T>(array: T[]): T[] {
    return array.filter((v, i, a) => i === a.indexOf(v));
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

export function debounceByInput<TI extends any[], TO>(func: (...input: TI) => TO, keySelector: (...input: TI) => string, wait?: number, debounceSettings?: DebounceSettings): (...input: TI) => TO {
    const cachedMethods: Record<string, (input: TI) => TO> = {};
    
    function result(...input: TI): TO {
        const key = keySelector(...input);
        const method = cachedMethods[key];
        if (method) {
            return method(input);
        }

        const newMethod = debounce((input2) => {
            delete cachedMethods[key];
            return func(...input2);
        }, wait, debounceSettings);
        cachedMethods[key] = newMethod;
        return newMethod(input);
    }

    return result;
}
