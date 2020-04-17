import * as vscode from 'vscode';
import { parseHoi4File } from '../../hoiformat/hoiparser';
import { getSpriteTypes } from '../../hoiformat/spritetype';
import { imageCache, Image } from '../../util/imagecache';

export async function getHtmlFromGfxFile(fileContent: string, uri: vscode.Uri, webview: vscode.Webview): Promise<string> {
    let baseContent = '';
    try {
        const spriteTypes = getSpriteTypes(parseHoi4File(fileContent));
        baseContent = (await Promise.all(spriteTypes.map(st => imageCache.get(st.texturefile))))
            .filter((image): image is Image => image !== null)
            .map(image => `<img src="${image.uri}" style="display:inline-block;"/>`)
            .join('');
    } catch (e) {
        baseContent = "Error: <br/>  <pre>" + e.toString() + "</pre>";
    }

    return `<!doctype html>
    <html>
    <body>
    <script>
        window.previewedFileUri = "${uri.toString()}";
    </script>
    ${baseContent}
    </body>
    </html>`;
}
