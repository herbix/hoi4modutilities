import * as vscode from 'vscode';
import { contextContainer } from '../context';
import { StyleTable } from './styletable';
import { randomString } from './common';

export interface DynamicScript {
    content: string;
}

export interface NonceOnly {
    nonce: string;
}

export function html(webview: vscode.Webview, body: string, scripts: (string | DynamicScript)[], styles?: (string | StyleTable | DynamicScript | NonceOnly)[]): string {
    const preparedScripts = scripts.map<[string, string]>(script => {
        if (typeof script === 'string') {
            const uri = contextContainer.current ?
                webview.asWebviewUri(vscode.Uri.joinPath(contextContainer.current.extensionUri, 'static/' + script)) :
                "";
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

    const preparedStyles = styles === undefined ? [['', `'unsafe-inline'`] as [string, string]] :
        styles.map<[string, string]>(style => {
            const nonce = randomString(32);
            if (style instanceof StyleTable) {
                return [
                    style.toStyleElement(nonce),
                    `'nonce-${nonce}'`
                ];
            } else if (typeof style === 'object') {
                if ('nonce' in style) {
                    return [
                        '',
                        `'nonce-${style.nonce}'`,
                    ];
                } else {
                    return [
                        `<style nonce="${nonce}">${style.content}</style>`,
                        `'nonce-${nonce}'`,
                    ];
                }
            } else {
                const uri = contextContainer.current ?
                    webview.asWebviewUri(vscode.Uri.joinPath(contextContainer.current.extensionUri, 'static/' + style)) :
                    "";
                return [
                    `<link rel="stylesheet" href="${uri}"/>`,
                    ''
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
            style-src ${preparedStyles.map(v => v[1]).join(' ')} ${webview.cspSource};
            script-src ${preparedScripts.map(v => v[1]).filter(v => v.length > 0).join(' ')} ${webview.cspSource};
            img-src data: ${webview.cspSource};
            font-src ${webview.cspSource};
        ">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        ${preparedScripts.map(v => v[0]).join('')}
        ${preparedStyles.map(v => v[0]).join('')}
    </head>
    <body>${body.replace(/\s\s+/g, ' ')}</body>
</html>
`;
}

export function htmlEscape(unsafe: string): string {
    return unsafe
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;")
         .replace(/\n/g, "&#13;")
         .replace(/ /g, "&nbsp;");
}
