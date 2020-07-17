declare module 'vscode' {
    namespace workspace {
        export function getConfiguration(section: 'hoi4ModUtilities'): WorkspaceConfiguration & {
            readonly installPath: string;
            readonly loadDlcContents: boolean;
            readonly modFile: string;
            readonly featureFlags: string[];
        };
    }
}

declare module '*.html' {
    const _default: string;
    export default _default;
}

declare module '*.css' {
    const _default: string;
    export default _default;
}

declare const VERSION: string;
declare const EXTENSION_ID: string;
