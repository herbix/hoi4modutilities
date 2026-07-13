import { SchemaDef } from "../../../hoiformat/schema";
import { readFileFromModOrHOI4AsJson } from "../../../util/fileloader";
import { LoadResult, LoaderSession } from "../../../util/loader/loader";
import { Bookmark, BookmarkDate, MapLoaderExtra, WorldMapWarning } from "../definitions";
import { FileLoader, FolderLoader, LoadResultOD, mergeInLoadResult } from "./common";

interface BookmarkFile {
    bookmarks: BookmarksDefinition;
}

interface BookmarksDefinition {
    bookmark: BookmarkDefinition[];
}

interface BookmarkDefinition {
    name: string;
    date: string;
}

const bookmarkFileSchema: SchemaDef<BookmarkFile> = {
    bookmarks: {
        bookmark: {
            _innerType: {
                name: "string",
                date: "string",
            },
            _type: "array",
        },
    },
};

type BookmarksLoaderResult = { bookmarks: Bookmark[] };
export class BookmarksLoader extends FolderLoader<BookmarksLoaderResult, BookmarkDefinition[]> {
    constructor() {
        super('common/bookmarks', BookmarkLoader);
    }

    protected async mergeFiles(fileResults: LoadResult< BookmarkDefinition[], MapLoaderExtra>[], session: LoaderSession): Promise<LoadResult<BookmarksLoaderResult, MapLoaderExtra>> {
        const bookmarks = mergeInLoadResult(fileResults, 'result');
        const warnings = mergeInLoadResult(fileResults, 'warnings');
        
        return {
            result: {
                bookmarks: bookmarks.map(b => ({
                    name: b.name,
                    date: toBookmarkDate(b.date),
                })).sort((a, b) => compareBookmarkDate(a.date, b.date)),
            },
            dependencies: [this.folder + '/*'],
            warnings,
        };
    }

    public toString() {
        return `[BookmarksLoader]`;
    }
}

export function toBookmarkDate(date: string): BookmarkDate {
    const [year, month, day, hour] = date.split('.').map(Number);
    return {
        year: year ?? 0,
        month: month ?? 0,
        day: day ?? 0,
        hour: hour ?? 0,
    };
}

export function compareBookmarkDate(a: BookmarkDate, b: BookmarkDate): number {
    if (a.year !== b.year) {
        return a.year - b.year;
    }
    if (a.month !== b.month) {
        return a.month - b.month;
    }
    if (a.day !== b.day) {
        return a.day - b.day;
    }
    return a.hour - b.hour;
}

export function bookmarkDateToString(date: BookmarkDate): string {
    return `${date.year}.${date.month}.${date.day}.${date.hour}`;
}

class BookmarkLoader extends FileLoader< BookmarkDefinition[]> {
    protected async loadFromFile(): Promise<LoadResultOD<BookmarkDefinition[]>> {
        const warnings: WorldMapWarning[] = [];
        return {
            result: await loadBookmark(this.file, warnings),
            warnings,
        };
    }

    public toString() {
        return `[BookmarkLoader: ${this.file}]`;
    }
}

async function loadBookmark(file: string, globalWarnings: WorldMapWarning[]): Promise<BookmarkDefinition[]> {
    const data = await readFileFromModOrHOI4AsJson<BookmarkFile>(file, bookmarkFileSchema);
    const result: BookmarkDefinition[] = [];
    for (const bookmark of data.bookmarks?.bookmark ?? []) {
        if (bookmark?.date) {
            result.push({
                name: bookmark.name ?? bookmark.date,
                date: bookmark.date
            });
        }
    }

    return result;
}
