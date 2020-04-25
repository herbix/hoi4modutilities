import * as vscode from 'vscode';
import * as path from 'path';
import { contextContainer } from '../context';

export interface DynamicScript {
    content: string;
}

export function html(webview: vscode.Webview, body: string, scripts: (string | DynamicScript)[]): string {
    const preparedScripts = scripts.map<[string, string]>(script => {
        if (typeof script === 'string') {
            const uri = webview.asWebviewUri(vscode.Uri.file(path.join(contextContainer.current?.extensionPath || '', 'static/' + script)));
            return [
                `<script src="${uri}"></script>`,
                '',
            ];
        } else {
            const nonce = randomString(32);
            return [
                `<script nonce="${nonce}">${script.content}</script>`,
                `'nonce-${nonce}'`,
            ];
        }
    });
    return `
<!DOCTYPE html>
<html>
    <head>
        <meta charset="UTF-8">
        <meta http-equiv="Content-Security-Policy" content="
            default-src 'none';
            style-src 'unsafe-inline';
            script-src ${preparedScripts.map(v => v[1]).filter(v => v.length > 0).join(' ')} ${webview.cspSource};
            img-src data:;
        ">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        ${preparedScripts.map(v => v[0])}
    </head>
    <body>${body}</body>
</html>
`;
}

export function randomString(length: number, charset: string | undefined = undefined): string {
    var result = '';
    var characters = charset ?? 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    var charactersLength = characters.length;
    for (let i = 0; i < length; i++ ) {
       result += characters.charAt(Math.floor(Math.random() * charactersLength));
    }
    return result;
 }
