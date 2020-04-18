declare module 'vscode' {
    namespace workspace {
        export function getConfiguration(section: 'hoi4ModUtilities'): WorkspaceConfiguration | {
            readonly installPath: string;
            readonly loadDlcContents: boolean;
        };
    }
}
