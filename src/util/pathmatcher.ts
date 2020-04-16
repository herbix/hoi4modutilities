import * as path from 'path';

export function matchPathEnd(pathname: string, segments: string[]): boolean {
    for (let i = segments.length - 1; i >= 0; i--) {
        const name = path.basename(pathname);
        pathname = path.dirname(pathname);

        if (segments[i] === '*') {
            continue;
        }

        if (segments[i].toLowerCase() !== name) {
            return false;
        }
    }

    return true;
}
