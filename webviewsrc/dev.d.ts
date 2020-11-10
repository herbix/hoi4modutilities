declare var previewedFileUri: string | undefined;
declare function acquireVsCodeApi(): VSCodeAPI;

declare interface VSCodeAPI {
    setState<T>(state: T): void;
    getState<T>(): T | undefined;
    postMessage<T>(message: T): void;
}

interface NodeRequire {
    context(directory: string, useSubdirectories?: boolean, regExp?: RegExp, mode?: string): NodeRequire;
}
