import * as vscode from 'vscode';
import * as path from 'path';
import { parseHoi4File } from '../../hoiformat/hoiparser';
import { getSpriteTypes } from '../../hoiformat/spritetype';
import { getImageByPath } from '../../util/image/imagecache';
import { contextContainer } from '../../context';
import { localize } from '../../util/i18n';
import { SpriteType } from '../../hoiformat/schema';

export async function renderGfxFile(fileContent: string, uri: vscode.Uri, webview: vscode.Webview): Promise<string> {
    let baseContent = '';
    try {
        const spriteTypes = getSpriteTypes(parseHoi4File(fileContent, localize('infile', 'In file {0}:\n', uri.toString())));
        baseContent = await renderSpriteTypes(spriteTypes);
    } catch (e) {
        baseContent = `${localize('error', 'Error')}: <br/>  <pre>${e.toString()}</pre>`;
    }

    return `<!doctype html>
    <html>
    <body>
    <script>
        window.previewedFileUri = "${uri.toString()}";
    </script>
    ${baseContent}
    <script src="${webview.asWebviewUri(vscode.Uri.file(path.join(contextContainer.current?.extensionPath || '', 'static/common.js')))}">
    </script>
    <script src="${webview.asWebviewUri(vscode.Uri.file(path.join(contextContainer.current?.extensionPath || '', 'static/gfx.js')))}">
    </script>
    </body>
    </html>`;
}

async function renderSpriteTypes(spriteTypes: SpriteType[]): Promise<string> {
    const imageList = (await Promise.all(spriteTypes.map(st => renderSpriteType(st)))).join('');
    const filter = `<div
    style="
        position: fixed;
        padding-top: 10px;
        padding-left: 20px;
        width: 100%;
        height: 30px;
        top: 0;
        left: 0;
        background: var(--vscode-editor-background);
        border-bottom: 1px solid var(--vscode-panel-border);
    ">
        <label for="filter" style="margin-right:5px">${localize('gfx.filter', 'Filter: ')}</label>
        <input
            id="filter"
            type="text"
            onchange="hoi4mu.gfx.filterChange(this.value)"
            onkeypress="hoi4mu.gfx.filterChange(this.value)"
            onkeyup="hoi4mu.gfx.filterChange(this.value)"
            onpaste="hoi4mu.gfx.filterChange(this.value)"
            oncut="hoi4mu.gfx.filterChange(this.value)"
        />
    </div>`;

    return `${filter}
    <div style="margin-top: 40px">
        ${imageList}
    </div>`;
}

async function renderSpriteType(spriteType: SpriteType): Promise<string> {
    const image = await getImageByPath(spriteType.texturefile);
    return `<div
        id="${spriteType.name}"
        class="spriteTypePreview"
        title="${spriteType.name}\n${image ? image.path : localize('gfx.imagenotfound', 'Image not found')}"
        style="
            display: inline-block;
            text-align: center;
            margin: 10px;
            cursor: pointer;
        "
        onclick="hoi4mu.navigateText(${spriteType._token?.start}, ${spriteType._token?.end})">
        ${image ? `<img src="${image.uri}" />` :
            `<div style="
                height: 100px;
                width: 100px;
                background: grey;
                margin: auto;
                display: table;
            ">
                <div style="display:table-cell;vertical-align:middle;color:black;">
                    MISSING
                </div>
            </div>`}
        <p style="
            min-width: 120px;
            max-width: ${Math.max(image?.width || 100, 120)}px;
            overflow: hidden;
            text-overflow: ellipsis;
            margin-top: 0
        ">
            ${spriteType.name}
        </p>
    </div>`;
}
