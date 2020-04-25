import * as path from 'path';
import * as fs from 'fs';

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

export function arrayToMap<T, K extends keyof T>(items: T[], key: K): T[K] extends string ? Record<string, T> : never {
    const result: Record<string, T> = {};
    for (const item of items) {
        const id = item[key];
        if (typeof id !== 'string') {
            throw new Error('key of arrayToMap must be a string type');
        }
        result[id] = item;
    }

    return result as any;
}

export function getLastModified(path: string): number {
    const stat = fs.lstatSync(path);
    return stat.mtimeMs;
}
