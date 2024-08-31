import * as vscode from 'vscode';
import {getSpriteByGfxName, Image, getImageByPath} from '../../util/image/imagecache';
import {localize, i18nTableAsScript} from '../../util/i18n';
import {forceError, randomString} from '../../util/common';
import {HOIPartial, toNumberLike, toStringAsSymbolIgnoreCase} from '../../hoiformat/schema';
import {html, htmlEscape} from '../../util/html';
import {GridBoxType} from '../../hoiformat/gui';
import {MioLoader} from './loader';
import {LoaderSession} from '../../util/loader/loader';
import {debug} from '../../util/debug';
import {StyleTable, normalizeForStyle} from '../../util/styletable';
import {Mio, MioTrait, TraitEffect} from './schema';
import {getLocalisedTextQuick} from "../../util/localisationIndex";
import {localisationIndex} from "../../util/featureflags";

const defaultTraitIcon = 'gfx/interface/goals/goal_unknown.dds';
const traitEffectIconMap: Record<TraitEffect, string> = {
    equiment: 'GFX_design_team_icon',
    production: 'GFX_industrial_manufacturer_icon',
    organization: 'GFX_organization_modifier_icon',
};

export async function renderMioFile(loader: MioLoader, uri: vscode.Uri, webview: vscode.Webview): Promise<string> {
    const setPreviewFileUriScript = {content: `window.previewedFileUri = "${uri.toString()}";`};

    try {
        const session = new LoaderSession(false);
        const loadResult = await loader.load(session);
        const loadedLoaders = Array.from((session as any).loadedLoader).map<string>(v => (v as any).toString());
        debug('Loader session mio', loadedLoaders);

        const mios = loadResult.result.mios;

        if (mios.length === 0) {
            const baseContent = localize('miopreview.nomio', 'No military industrial organization defined.');
            return html(webview, baseContent, [setPreviewFileUriScript], []);
        }

        mios.sort((a, b) => a.id.localeCompare(b.id));

        const styleTable = new StyleTable();
        const jsCodes: string[] = [];
        const styleNonce = randomString(32);
        const baseContent = await renderMios(mios, styleTable, loadResult.result.gfxFiles, jsCodes, styleNonce, loader.file);
        jsCodes.push(i18nTableAsScript());

        return html(
            webview,
            baseContent,
            [
                setPreviewFileUriScript,
                ...jsCodes.map(c => ({content: c})),
                'common.js',
                'miopreview.js',
            ],
            [
                'codicon.css',
                'common.css',
                styleTable,
                {nonce: styleNonce},
            ],
        );

    } catch (e) {
        const baseContent = `${localize('error', 'Error')}: <br/>  <pre>${htmlEscape(forceError(e).toString())}</pre>`;
        return html(webview, baseContent, [setPreviewFileUriScript], []);
    }
}

const leftPadding = 50;
const topPadding = 50;
const xGridSize = 87;
const yGridSize = 117;

async function renderMios(mios: Mio[], styleTable: StyleTable, gfxFiles: string[], jsCodes: string[], styleNonce: string, file: string): Promise<string> {

    const gridBox: HOIPartial<GridBoxType> = {
        position: {x: toNumberLike(leftPadding), y: toNumberLike(topPadding)},
        format: toStringAsSymbolIgnoreCase('up'),
        size: {width: toNumberLike(xGridSize), height: undefined},
        slotsize: {width: toNumberLike(xGridSize), height: toNumberLike(yGridSize)},
    } as HOIPartial<GridBoxType>;

    const renderedTrait: Record<string, Record<string, string>> = {};
    for (const mio of mios) {
        const renderedTraitForMio: Record<string, string> = {};
        renderedTrait[mio.id] = renderedTraitForMio;
        await Promise.all(Object.values(mio.traits).map(async (trait) =>
            renderedTraitForMio[trait.id] = (await renderTrait(trait, styleTable, gfxFiles, file)).replace(/\s\s+/g, ' ')));
    }

    jsCodes.push('window.mios = ' + JSON.stringify(mios));
    jsCodes.push('window.renderedTrait = ' + JSON.stringify(renderedTrait));
    jsCodes.push('window.gridBox = ' + JSON.stringify(gridBox));
    jsCodes.push('window.styleNonce = ' + JSON.stringify(styleNonce));
    jsCodes.push('window.xGridSize = ' + xGridSize);

    return (
        `<div id="dragger" class="${styleTable.oneTimeStyle('dragger', () => `
            width: 100vw;
            height: 100vh;
            position: fixed;
            left:0;
            top:0;
        `)}"></div>` +
        `<div id="miopreviewcontent" class="${styleTable.oneTimeStyle('miopreviewcontent', () => `top:40px;left:-20px;position:relative`)}">
            <div id="miopreviewplaceholder"></div>
        </div>` +
        renderWarningContainer(styleTable) +
        await renderToolBar(mios, styleTable)
    );
}

function renderWarningContainer(styleTable: StyleTable) {
    styleTable.style('warnings', () => 'outline: none;', ':focus');
    return `
    <div id="warnings-container" class="${styleTable.style('warnings-container', () => `
        height: 100vh;
        width: 100vw;
        position: fixed;
        top: 0;
        left: 0;
        padding-top: 40px;
        background: var(--vscode-editor-background);
        box-sizing: border-box;
        display: none;
    `)}">
        <textarea id="warnings" readonly wrap="off" class="${styleTable.style('warnings', () => `
            height: 100%;
            width: 100%;
            font-family: 'Consolas', monospace;
            resize: none;
            background: var(--vscode-editor-background);
            padding: 10px;
            border-top: none;
            border-left: none;
            border-bottom: none;
            box-sizing: border-box;
        `)}"></textarea>
    </div>`;
}

async function renderToolBar(mios: Mio[], styleTable: StyleTable): Promise<string> {
    const mioSelect = mios.length <= 1 ? '' : `
        <label for="mios" class="${styleTable.style('miosLabel', () => `margin-right:5px`)}">${localize('miopreview.mio', 'Military Industrial Organization: ')}</label>
        <div class="select-container ${styleTable.style('marginRight10', () => `margin-right:10px`)}">
            <select id="mios" class="select multiple-select" tabindex="0" role="combobox">
                ${await Promise.all(mios.map(async (mio, i) => {
        const localizedText = localisationIndex ? `(${mio.id}) ${await getLocalisedTextQuick(mio.id)}` : mio.id;
        return `<option value="${i}">${localizedText}</option>`;
    })).then(options => options.join(''))}
            </select>
        </div>`;

    const conditions = `
        <div id="condition-container">
            <label for="conditions" class="${styleTable.style('conditionsLabel', () => `margin-right:5px`)}">${localize('miopreview.conditions', 'Conditions: ')}</label>
            <div class="select-container ${styleTable.style('marginRight10', () => `margin-right:10px`)}">
                <div id="conditions" class="select multiple-select" tabindex="0" role="combobox" class="${styleTable.style('conditionsLabel', () => `max-width:400px`)}">
                    <span class="value"></span>
                </div>
            </div>
        </div>`;

    const warningsButton = mios.every(mio => mio.warnings.length === 0) ? '' : `
        <button id="show-warnings" title="${localize('miopreview.warnings', 'Toggle warnings')}">
            <i class="codicon codicon-warning"></i>
        </button>`;

    return `<div class="toolbar-outer ${styleTable.style('toolbar-height', () => `box-sizing: border-box; height: 40px;`)}">
        <div class="toolbar">
            ${mioSelect}
            ${conditions}
            ${warningsButton}
        </div>
    </div>`;
}

async function renderTrait(trait: MioTrait, styleTable: StyleTable, gfxFiles: string[], file: string): Promise<string> {
    const traitIcon = trait.icon;
    if (traitIcon) {
        const iconObject = traitIcon ? await getTraitIcon(traitIcon, gfxFiles) : null;
        styleTable.style('trait-icon-' + normalizeForStyle(traitIcon ?? '-empty'), () =>
            `${iconObject ? `background-image: url(${iconObject.uri});` : 'background: grey;'}
            background-size: ${iconObject ? iconObject.width : 0}px;`
        );
    }

    styleTable.style('trait-icon-' + normalizeForStyle('-empty'), () => 'background: grey;');
    styleTable.raw(`.${styleTable.name('trait-common')}:hover .${styleTable.name('trait-span')}`, `display:inline-block;`);
    styleTable.raw(`.${styleTable.name('trait-common')}:hover .${styleTable.name('trait-span-display')}`, `margin-top: -12px;`);

    const traitBg = await getSpriteByGfxName(trait.specialTraitBackground ? 'GFX_country_spefific_org_trait_button' : 'GFX_industrial_org_trait_button', gfxFiles);

    return `<div
    class="
        ${styleTable.style(trait.specialTraitBackground ? 'trait-bg-special' : 'trait-bg-normal',
        () => traitBg ? `background-image: url(${(traitBg.frames[2] ?? traitBg.image).uri});` : '')}
        ${styleTable.style('trait-background', () => `
            background-position-x: center;
            background-position-y: center;
            background-repeat: no-repeat;
            width: 100%;
            height: 100%;
            text-align: center;
            cursor: pointer;
        `)}"
    >
        <div
        class="
            navigator
            ${styleTable.name('trait-icon-' + normalizeForStyle(traitIcon ?? '-empty'))}
            ${styleTable.style('trait-common', () => `
                background-position-x: center;
                background-position-y: calc(50% - 8px);
                background-repeat: no-repeat;
                width: 100%;
                height: 100%;
                text-align: center;
                cursor: pointer;
            `)}
        "
        start="${trait.token?.start}"
        end="${trait.token?.end}"
        ${file === trait.file ? '' : `file="${trait.file}"`}
        title="${trait.id}${localisationIndex ? `\n${await getLocalisedTextQuick(trait.name)}` : ''}\n({{position}})">
            <div class="
                ${styleTable.style('effect-host', () => `
                    text-align: center;
                    position: absolute;
                    width: 100%;
                    top: 73px;
                `)}
            ">
                ${(await Promise.all(trait.effects.map(async (effect) => `
                <span class="
                    ${await styleTable.style('effect-icon-' + effect, async () => {
        const icon = await getTraitIcon(traitEffectIconMap[effect], gfxFiles);
        return icon ? `background-image: url(${icon.uri}); width: ${icon.width}px; height: ${icon.height}px;` : '';
    })}
                    ${styleTable.style('effect-icon', () => `
                        display: inline-block;
                    `)}
                ">
                &nbsp;
                </span>
                `))).join('')}
            </div>
            <span
            class="${styleTable.style('trait-span', () => `
                margin: 10px -400px;
                margin-top: 95px;
                text-align: center;
                display: none;
                position: relative;
                z-index: 5;
            `)}">
            ${trait.id}
            </span>
            <br/>
            <span
            class="${styleTable.style('trait-span-display', () => `
                margin: 10px -400px;
                margin-top: 84px;
                text-align: center;
                display: inline-block;
                position: relative;
                z-index: 5;
            `)}">
            ${localisationIndex ? `${await getLocalisedTextQuick(trait.name)}` : ''}
            </span>
        </div>
    </div>`;
}

export async function getTraitIcon(name: string, gfxFiles: string[]): Promise<Image | undefined> {
    const sprite = await getSpriteByGfxName(name, gfxFiles);
    if (sprite !== undefined) {
        return sprite.image;
    }

    return await getImageByPath(defaultTraitIcon);
}
