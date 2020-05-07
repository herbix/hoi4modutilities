declare var previewedFileUri: string | undefined;
declare function acquireVsCodeApi(): VSCodeAPI;

declare interface VSCodeAPI {
    setState<T>(state: T): void;
    getState<T>(): T | undefined;
    postMessage(message: any): void;
}
