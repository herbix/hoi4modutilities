import * as vscode from 'vscode';
import { parseHoi4File } from '../../hoiformat/hoiparser';
import { getSpriteTypes } from '../../hoiformat/spritetype';
import { getImageByPath } from '../../util/image/imagecache';
import { localize } from '../../util/i18n';
import { SpriteType } from '../../hoiformat/spritetype';
import { html, htmlEscape } from '../../util/html';
import { StyleTable } from '../../util/styletable';

export async function renderGfxFile(fileContent: string, uri: vscode.Uri, webview: vscode.Webview): Promise<string> {
    const setPreviewFileUriScript = { content: `window.previewedFileUri = "${uri.toString()}";` };

    try {
        const spriteTypes = getSpriteTypes(parseHoi4File(fileContent, localize('infile', 'In file {0}:\n', uri.toString())));
        const styleTable = new StyleTable();
        const baseContent = await renderSpriteTypes(spriteTypes, styleTable);
        return html(
            webview,
            baseContent, 
            [
                setPreviewFileUriScript,
                'common.js',
                'gfx.js',
            ],
            [
                'common.css',
                styleTable,
            ],
        );

    } catch (e) {
        const baseContent = `${localize('error', 'Error')}: <br/>  <pre>${htmlEscape(e.toString())}</pre>`;
        return html(webview, baseContent, [ setPreviewFileUriScript ], []);
    }
}

async function renderSpriteTypes(spriteTypes: SpriteType[], styleTable: StyleTable): Promise<string> {
    const imageList = (await Promise.all(spriteTypes.map(st => renderSpriteType(st, styleTable)))).join('');
    const filter = `<div
    class="${styleTable.style('filterBar', () => `
        position: fixed;
        padding-top: 10px;
        padding-left: 20px;
        width: 100%;
        height: 30px;
        top: 0;
        left: 0;
        background: var(--vscode-editor-background);
        border-bottom: 1px solid var(--vscode-panel-border);
    `)}">
        <label for="filter" class="${styleTable.style('filterLabel', () => `margin-right:5px`)}">${localize('gfx.filter', 'Filter: ')}</label>
        <input
            id="filter"
            type="text"
        />
    </div>`;

    return `${filter}
    <div class="${styleTable.style('imageList', () => `margin-top: 40px`)}">
        ${imageList}
    </div>`;
}

async function renderSpriteType(spriteType: SpriteType, styleTable: StyleTable): Promise<string> {
    const image = await getImageByPath(spriteType.texturefile);
    return `<div
        id="${spriteType.name}"
        class="
            spriteTypePreview
            navigator
            ${styleTable.style('spriteTypePreview', () => `
                display: inline-block;
                text-align: center;
                margin: 10px;
                cursor: pointer;
            `)}
        "
        start="${spriteType.token?.start}"
        end="${spriteType.token?.end}"
        title="${spriteType.name}${image ? ` (${
            image.width / spriteType.noofframes}x${image.height}x${spriteType.noofframes})` : ''
            }\n${image ? image.path : localize('gfx.imagenotfound', 'Image not found')}">
        ${image ? `<img src="${image.uri}" />` :
            `<div 
            class="${styleTable.style('missingImageOuter', () => `
                height: 100px;
                width: 100px;
                background: grey;
                margin: auto;
                display: table;
            `)}">
                <div class="${styleTable.style('missingImageInner', () => `display:table-cell;vertical-align:middle;color:black;`)}">
                    MISSING
                </div>
            </div>`}
        <p class="
            ${styleTable.style('imageName-common', () => `
                min-width: 120px;
                overflow: hidden;
                text-overflow: ellipsis;
                margin-top: 0
            `)}
            ${styleTable.oneTimeStyle('imageName', () => `
                max-width: ${Math.max(image?.width || 100, 120)}px;
            `)}
        ">
            ${htmlEscape(spriteType.name)}
        </p>
    </div>`;
}
