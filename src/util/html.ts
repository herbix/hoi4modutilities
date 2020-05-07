import * as vscode from 'vscode';
import * as path from 'path';
import { contextContainer } from '../context';

export interface DynamicScript {
    content: string;
}

export function html(webview: vscode.Webview, body: string, scripts: (string | DynamicScript)[], styles?: StyleTable | DynamicScript[]): string {
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

    const styleNonce = randomString(32);
    const preparedStyles = styles === undefined ? [['', `'unsafe-inline'`] as [string, string]] :
        Array.isArray(styles) ? styles.map<[string, string]>(style => {
            const nonce = randomString(32);
            return [
                `<style nonce="${nonce}">${style.content}</style>`,
                `'nonce-${nonce}'`,
            ];
        }) :
        [[styles.toStyleElement(styleNonce), `'nonce-${styleNonce}'`] as [string, string]];

    return `
<!DOCTYPE html>
<html>
    <head>
        <meta charset="UTF-8">
        <meta http-equiv="Content-Security-Policy" content="
            default-src 'none';
            style-src ${preparedStyles.map(v => v[1]).join(' ')};
            script-src ${preparedScripts.map(v => v[1]).filter(v => v.length > 0).join(' ')} ${webview.cspSource};
            img-src data:;
        ">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        ${preparedScripts.map(v => v[0]).join('')}
        ${preparedStyles.map(v => v[0]).join('')}
    </head>
    <body>${body.replace(/(<\w+(?:\s+\w+\s*=\s*".*?")*?\s+class\s*=\s*")(.*?)("(?:\s+\w+\s*=\s*".*?")*?\s*\/?>)/gs, (substr, g1, g2, g3) => {
        return g1 + g2.replace(/\s+/g, ' ').trim() + g3;
    })}</body>
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

export function htmlEscape(unsafe: string): string {
    return unsafe
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");
}

export class StyleTable {
    readonly records: Record<string, string> = {};
    private id: number = 0;

    public style(name: string, callback: () => string): string
    public style(name: string, callback: () => Promise<string>): Promise<string>
    public style(name: string, callback: (() => string) | (() => Promise<string>)): string | Promise<string> {
        name = 'st-' + name;
        const result = this.records[name];
        if (result !== undefined) {
            return name;
        }
    
        const callbackResult = callback();
        if (typeof callbackResult === 'string') {
            this.records[name] = callbackResult;
            return name;
        } else {
            return callbackResult.then<string>(v => {
                this.records[name] = v;
                return name;
            });
        }
    }

    public oneTimeStyle(name: string, callback: () => string): string
    public oneTimeStyle(name: string, callback: () => Promise<string>): Promise<string>
    public oneTimeStyle(name: string, callback: (() => string) | (() => Promise<string>)): string | Promise<string> {
        const sid = this.id++;
        return this.style(name + '-' + sid, callback as any);
    }

    public toStyleElement(nonce: string): string {
        return `<style nonce="${nonce}">${Object.entries(this.records).map(([k, v]) => `.${k} { ${v.replace(/^\s+/gm, '')} }\n`).join('')}</style>`;
    }
}
