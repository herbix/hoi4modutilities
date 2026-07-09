import * as vscode from 'vscode';
import { i18nTableAsScript, localize } from '../../util/i18n';
import { Technology, TechnologyTree, TechnologyFolder, RenderedTechnologyFolder, RenderedTechnologyFolderGridBox } from './schema';
import { getSpriteByGfxName, Sprite } from '../../util/image/imagecache';
import { arrayToMap, forceError, randomString, UserError } from '../../util/common';
import { HOIPartial } from '../../hoiformat/schema';
import { renderContainerWindow, renderContainerWindowChildren } from '../../util/hoi4gui/containerwindow';
import { ParentInfo, RenderCommonOptions } from '../../util/hoi4gui/common';
import { renderGridBox, GridBoxItem, GridBoxConnection, GridBoxConnectionItem, getGridBoxCommonChildParentInfo } from '../../util/hoi4gui/gridbox';
import { renderInstantTextBox } from '../../util/hoi4gui/instanttextbox';
import { renderIcon } from '../../util/hoi4gui/icon';
import { html, htmlEscape } from '../../util/html';
import { ContainerWindowType, GridBoxType, IconType, InstantTextBoxType, Format } from '../../hoiformat/gui';
import { TechnologyTreeLoader, TechnologyTreeLoaderResult } from './loader';
import { LoaderSession } from '../../util/loader/loader';
import { debug } from '../../util/debug';
import { flatMap, sumBy, min, flatten, chain, uniq, range } from 'lodash';
import { StyleTable } from '../../util/styletable';
import { renderBackground, RenderNodeCommonOptions } from '../../util/hoi4gui/nodecommon';
import { getLocalisedTextQuick } from "../../util/localisationIndex";
import { localisationIndex } from "../../util/featureflags";

const techTreeViewName = 'countrytechtreeview';
const doctrineTreeViewName = 'countrydoctrineview';

export async function renderTechnologyFile(loader: TechnologyTreeLoader, uri: vscode.Uri, webview: vscode.Webview): Promise<string> {
    const setPreviewFileUriScript = { content: `window.previewedFileUri = "${uri.toString()}";` };
    try {
        const session = new LoaderSession(false);
        const loadResult = await loader.load(session);
        const loadedLoaders = Array.from((session as any).loadedLoader).map<string>(v => (v as any).toString());
        debug('Loader session tech tree', loadedLoaders);

        const technologyTrees = loadResult.result.technologyTrees;
        const folders = uniq(technologyTrees.map(tt => tt.folder));
        
        if (folders.length === 0) {
            const baseContent = localize('techtree.notechtree', 'No technology tree.');
            return html(webview, baseContent, [ setPreviewFileUriScript ], []);
        }

        const styleTable = new StyleTable();
        const jsCodes: string[] = [];
        const styleNonce = randomString(32);
        const baseContent = await renderTechnologyFolders(technologyTrees, folders, styleTable, loadResult.result, jsCodes);
        jsCodes.push('window.styleNonce = ' + JSON.stringify(styleNonce));
        jsCodes.push(i18nTableAsScript());

        return html(
            webview,
            baseContent,
            [
                setPreviewFileUriScript,
                ...jsCodes.map(c => ({ content: c })),
                'common.js',
                'techtree.js',
            ],
            [
                'common.css',
                'codicon.css',
                styleTable,
                { nonce: styleNonce },
            ],
        );

    } catch (e) {
        const baseContent = `${localize('error', 'Error')}: <br/>  <pre>${htmlEscape(forceError(e).toString())}</pre>`;
        return html(webview, baseContent, [ setPreviewFileUriScript ], []);
    }
}

async function renderTechnologyFolders(
    technologyTrees: TechnologyTree[],
    folders: string[],
    styleTable: StyleTable,
    loadResult: TechnologyTreeLoaderResult,
    jsCodes: string[]): Promise<string> {
    const guiFiles = loadResult.guiFiles.map(f => f.file);
    const guiTypes = flatMap(loadResult.guiFiles, f => f.data.guitypes);

    const containerWindowTypes = flatMap(guiTypes, t => t.containerwindowtype);
    const techTreeViews = containerWindowTypes.filter(c => c.name?.toLowerCase() === techTreeViewName || c.name?.toLowerCase() === doctrineTreeViewName);
    if (techTreeViews.length === 0) {
        throw new UserError(localize('techtree.cantfindviewin', "Can't find {0} in {1}.", techTreeViewName + "," + doctrineTreeViewName, guiFiles));
    }

    const gfxFiles = loadResult.gfxFiles;
    const techFolders: Record<string, RenderedTechnologyFolder> = {};
    await Promise.all(folders.map(async folder => {
        techFolders[folder] = await renderTechnologyFolder(technologyTrees, folder, techTreeViews, containerWindowTypes, styleTable, guiFiles, gfxFiles);
    }));
    
    jsCodes.push(`window.technologyTrees = ${JSON.stringify(technologyTrees)};`);
    jsCodes.push(`window.renderedTechFolders = ${JSON.stringify(techFolders)};`);

    return `
    ${await renderToolbar(folders, styleTable)}
    <div
    id="dragger"
    class="${styleTable.oneTimeStyle('dragger', () => `
        width: 100vw;
        height: 100vh;
        position: fixed;
        left:0;
        top:0;
        background:#101010;
    `)}">
    </div>
    <div
    id="mainContent"
    class="${styleTable.oneTimeStyle('mainContent', () => `
        position: absolute;
        left: 0;
        top: 0;
        pointer-events: none;
        margin-top: 40px;
    `)}">
    </div>`;
}

async function renderToolbar(folders: string[], styleTable: StyleTable): Promise<string> {
    const folderOptions = await Promise.all(
        folders.map(async (folder) => {
            const localizedText = localisationIndex ? `${await getLocalisedTextQuick(folder)} (${folder})` : folder;
            return `<option value="${folder}">${localizedText}</option>`;
        })
    );

    const folderSelect = `
        <label for="folderSelector" class="${styleTable.oneTimeStyle('folderSelectorLabel', () => `margin-right:5px`)}">
            ${localize('techtree.techfolder', 'Technology folder: ')}
        </label>
        <div class="select-container ${styleTable.style('marginRight10', () => `margin-right:10px`)}">
            <select
                id="folderSelector"
                type="text"
                class="${styleTable.oneTimeStyle('folderSelector', () => `min-width:200px`)}"
            >
                ${folderOptions.join('')}
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

    return `<div class="toolbar-outer ${styleTable.style('toolbar-height', () => `box-sizing: border-box; height: 40px; z-index: 10;`)}">
        <div class="toolbar">
            ${localisationIndex ? renderPreviewLabelModeControl(styleTable) : ''}
            ${folderSelect}
            ${conditions}
        </div>
    </div>`;
}

function renderPreviewLabelModeControl(styleTable: StyleTable): string {
    return `<div class="preview-label-mode ${styleTable.oneTimeStyle('previewLabelModeContainer', () => `margin-right:10px`)}">
        <span class="${styleTable.style('previewLabelModeLabel', () => `margin-right:5px`)}">${localize('preview.labelmode', 'Label: ')}</span>
        <button type="button" data-preview-label-mode-value="id" aria-pressed="true">${localize('preview.labelmode.id', 'ID')}</button>
        <button type="button" data-preview-label-mode-value="name" aria-pressed="false">${localize('preview.labelmode.name', 'Name')}</button>
    </div>`;
}

async function renderTechnologyFolder(
    technologyTrees: TechnologyTree[],
    folder: string,
    techTreeViews: HOIPartial<ContainerWindowType>[],
    allContainerWindowTypes: HOIPartial<ContainerWindowType>[],
    styleTable: StyleTable,
    guiFiles: string[],
    gfxFiles: string[]): Promise<RenderedTechnologyFolder> {
    const folderTreeView = flatMap(techTreeViews, tv => tv.containerwindowtype).find(c => c.name === folder);
    const gridboxes: Record<string, RenderedTechnologyFolderGridBox> = {};
    const renderedTechnologies: Record<string, string> = {};
    const renderedXor = { upDown: '', leftRight: '' };
    const renderedLines: string[] = [];

    let children: string;
    if (!folderTreeView) {
        children = `<div>${localize('techtree.cantfindtechfolderin', "Can't find technology folder {0} in {1}.", folder, guiFiles)}</div>`;

    } else {
        const folderItem = allContainerWindowTypes.find(c => c.name === `techtree_${folder}_item`);
        const folderSmallItem = allContainerWindowTypes.find(c => c.name === `techtree_${folder}_small_item`) || folderItem;
        const lineItem = allContainerWindowTypes.find(c => c.name === 'techtree_line_item');
        const xorItem = allContainerWindowTypes.find(c => c.name === 'techtree_xor_item');
        const commonOptions: RenderNodeCommonOptions = {
            getSprite: defaultGetSprite(gfxFiles),
            styleTable,
        };

        children = await renderContainerWindowChildren(
            folderTreeView,
            {
                size: { width: 1920, height: 1080 },
                orientation: 'upper_left',
            },
            {
                ...commonOptions,
                onRenderChild: async (type, child, parentInfo) => {
                    if (type === 'instanttextbox' && isTechnologyStaticTitleTextBox(child as HOIPartial<InstantTextBoxType>)) {
                        const text = child as HOIPartial<InstantTextBoxType>;
                        const localisedText = await getLocalisedTextQuick(text.text);
                        return await renderInstantTextBox(
                            { ...text, text: getLocalisationLabelContent(text.text ?? '', localisedText) },
                            parentInfo,
                            { ...commonOptions, localise: false, rawText: true }
                        );
                    }

                    if (type === 'gridbox') {
                        const tree = technologyTrees.find(t => t.startTechnology + '_tree' === child.name);
                        if (tree) {
                            const gridboxType = child as HOIPartial<GridBoxType>;
                            gridboxes[tree.startTechnology] = {
                                gridbox: gridboxType,
                                parentInfo,
                                background: await renderBackground(gridboxType.background, parentInfo, commonOptions),
                            };
                            const childrenParentInfo = getGridBoxCommonChildParentInfo(gridboxType, parentInfo);
                            
                            await Promise.all(tree.technologies.map(async technology => {
                                const technologyItem = technology.enableEquipments && !technology.forceUseSmallTechLayout ? folderItem : folderSmallItem;
                                const renderedTechnology = await renderTechnology(technologyItem, technology, technology.folders[folder], childrenParentInfo, commonOptions, guiFiles, gfxFiles);
                                renderedTechnologies[technology.id] = renderedTechnology;
                            }));

                            if (xorItem && renderedXor.upDown === '' && renderedXor.leftRight === '') {
                                renderedXor.upDown = 'loading'; // Avoid other "threads" to render the same xorItem
                                [renderedXor.upDown, renderedXor.leftRight] = await Promise.all([
                                    renderXorItem(xorItem, 'up', childrenParentInfo, commonOptions),
                                    renderXorItem(xorItem, 'left', childrenParentInfo, commonOptions)
                                ]);
                            }

                            if (lineItem && renderedLines.length === 0) {
                                renderedLines.length = 32; // Avoid other "threads" to render the same lineItem
                                await Promise.all(range(0, 32)
                                    .map(async i => renderedLines[i] = await renderLineItem(lineItem, i % 16, i > 16, childrenParentInfo, commonOptions)));
                                    
                            }

                            return '{{gridbox-' + tree.startTechnology + '}}';
                        }
                    }

                    return undefined;
                },
            }
        );
    }

    const template = `<div
        id="${folder}"
        class="techfolder"
    >
        ${children}
    </div>`;

    return { template, gridboxes, renderedTechnologies, renderedXor, renderedLines };
}

async function renderXorItem(xorItem: HOIPartial<ContainerWindowType>, format: Format['_name'], parentInfo: ParentInfo, commonOptions: RenderCommonOptions): Promise<string> {
    const upDownDirection = format === 'left' || format === 'right';
    return await renderContainerWindow(xorItem, parentInfo, {
        ...commonOptions,
        onRenderChild: async (type, child, parent) => {
            if (type === 'icon') {
                const icon = child as HOIPartial<IconType>;
                const childName = child.name?.toLowerCase();
                if (childName === 'first') {
                    return await renderIcon({...icon, spritetype: upDownDirection ? 'GFX_techtree_xor_up' : 'GFX_techtree_xor_left' },
                        parent, commonOptions);
                }
                if (childName === 'second') {
                    return await renderIcon({ ...icon, spritetype: upDownDirection ? 'GFX_techtree_xor_down' : 'GFX_techtree_xor_right' },
                        parent, commonOptions);
                }
            }

            return undefined;
        },
    });
}

async function renderTechnology(
    item: HOIPartial<ContainerWindowType> | undefined,
    technology: Technology,
    folder: TechnologyFolder,
    parentInfo: ParentInfo,
    commonOptions: RenderCommonOptions,
    guiFiles: string[],
    gfxFiles: string[],
): Promise<string> {
    if (!item) {
        return `<div>${localize('techtree.cantfindtechitemin', "Can't find containerwindowtype \"{0}\" in {1}", `techtree_${folder.name}_item`, guiFiles)}</div>`;
    }

    const subSlotRegex = /^sub_technology_slot_(\d)$/;
    const containerWindow = await renderContainerWindow(item, parentInfo, {
        ...commonOptions,
        noSize: true,
        getSprite: (sprite, callerType, callerName) => getTechnologySprite(sprite, technology, folder.name, callerType, callerName, gfxFiles),
        onRenderChild: async (type, child, parentInfo) => {
            if (type === 'icon' && child.name === 'bonus_icon') {
                return '';
            }

            if (type === 'instanttextbox') {
                const text = child as HOIPartial<InstantTextBoxType>;
                const childname = child.name?.toLowerCase().trim();
                if (childname === 'bonus') {
                    return '';
                } else if (isTechnologyLabelTextBox(childname)) {
                    const localisedText = await getLocalisedTextQuick(technology.id);
                    return await renderInstantTextBox(
                        { ...text, text: getTechnologyLabelContent(technology.id, localisedText) },
                        parentInfo,
                        { ...commonOptions, localise: false, rawText: true }
                    );
                }
            }

            if (type === 'containerwindow' && child.name) {
                const subSlot = subSlotRegex.exec(child.name.toLowerCase());
                if (subSlot) {
                    const slotId = parseInt(subSlot[1]);
                    return await renderSubTechnology(child as HOIPartial<ContainerWindowType>, folder, technology.subTechnologies[slotId], parentInfo, commonOptions, gfxFiles);
                }
            }

            return undefined;
        }
    });

    return `<div
        start="${technology.token?.start}"
        end="${technology.token?.end}"
        ${await getTechnologyTitleAttributes(technology.id, folder)}
        class="
            navigator 
            ${commonOptions.styleTable.style('navigator', () => `
                position: absolute;
                left: 0;
                top: 0;
                width: 0;
                height: 0;
                cursor: pointer;
                pointer-events: auto;
            `)}
        ">
            ${containerWindow}
        </div>`;
}

async function getTechnologySprite(sprite: string, technology: Technology, folder: string, callerType: 'bg' | 'icon', callerName: string | undefined, gfxFiles: string[]): Promise<Sprite | undefined> {
    let imageTryList: string[] = [sprite];
    if (sprite === 'GFX_technology_unavailable_item_bg' && callerType === 'bg') {
        imageTryList = technology.enableEquipments && !technology.forceUseSmallTechLayout ? [
            `GFX_technology_${folder}_available_item_bg`,
            `GFX_technology_available_item_bg`,
        ] : [
            `GFX_technology_${folder}_small_available_item_bg`,
            `GFX_technology_small_available_item_bg`,
            `GFX_technology_${folder}_available_item_bg`,
            `GFX_technology_available_item_bg`,
        ];
    } else if (sprite === 'GFX_technology_medium' && callerType === 'icon') {
        return await getTechnologyIcon(`GFX_${technology.id}_medium`, gfxFiles, 'GFX_technology_medium');
    }

    return await getSpriteFromTryList(imageTryList, gfxFiles);
}

async function renderSubTechnology(
    containerWindow: HOIPartial<ContainerWindowType>,
    folder: TechnologyFolder,
    subTechnology: Technology | undefined,
    parentInfo: ParentInfo,
    commonOptions: RenderCommonOptions,
    gfxFiles: string[],
): Promise<string> {
    if (subTechnology === undefined) {
        return '';
    }

    const containerWindowResult = await renderContainerWindow(containerWindow, parentInfo, {
        ...commonOptions,
        getSprite: (sprite, callerType, callerName) => {
            let imageTryList = [sprite];
            if (callerType === 'bg' && callerName === containerWindow.background?.name) {
                imageTryList = [
                    `GFX_subtechnology_${folder}_available_item_bg`,
                    `GFX_subtechnology_available_item_bg`,
                ];
            } else if (callerType === 'icon' && callerName?.toLowerCase() === 'picture') {
                return getTechnologyIcon(sprite, gfxFiles);
            }

            return getSpriteFromTryList(imageTryList, gfxFiles);
        }
    });

    return `<div
        start="${subTechnology.token?.start}"
        end="${subTechnology.token?.end}"
        ${await getTechnologyTitleAttributes(subTechnology.id, folder)}
        class="
            navigator
            ${commonOptions.styleTable.style('navigator', () => `
                position: absolute;
                left: 0;
                top: 0;
                width: 0;
                height: p;
                cursor: pointer;
                pointer-events: auto;
            `)}
        ">
            ${containerWindowResult}
        </div>`;
}

function isTechnologyLabelTextBox(childname: string | undefined): boolean {
    return childname === 'name';
}

function isTechnologyStaticTitleTextBox(textbox: HOIPartial<InstantTextBoxType>): boolean {
    const name = textbox.name?.toLowerCase().trim();
    const text = textbox.text?.trim();
    if (!name || !text) {
        return false;
    }

    return name.includes('title')
        || name.includes('subtitle')
        || /(^|_)TITLE(_|$)/i.test(text);
}

function getLocalisationLabelContent(localisationKey: string, localisedText: string | undefined): string {
    const name = localisedText && localisedText !== localisationKey ? localisedText : localisationKey;
    return `<span data-preview-label-id="${htmlEscape(localisationKey)}" data-preview-label-name="${htmlEscape(name)}">${htmlEscape(localisationKey)}</span>`;
}

function getTechnologyLabelContent(technologyId: string, localisedText: string | undefined): string {
    const name = localisedText && localisedText !== technologyId ? localisedText : technologyId;
    return `<span data-preview-label-id="${htmlEscape(technologyId)}" data-preview-label-name="${htmlEscape(name)}">${htmlEscape(technologyId)}</span>`;
}

async function getTechnologyTitleAttributes(technologyId: string, folder: TechnologyFolder): Promise<string> {
    const localisedText = await getLocalisedTextQuick(technologyId);
    const name = localisedText && localisedText !== technologyId ? localisedText : technologyId;
    const idTitle = `${technologyId}\n(${folder.x}, ${folder.y})`;
    const nameTitle = `${name}\n(${folder.x}, ${folder.y})`;
    return `title="${htmlEscape(idTitle)}" data-preview-title-id="${htmlEscape(idTitle)}" data-preview-title-name="${htmlEscape(nameTitle)}"`;
}

const centerNameTable = [
    undefined, undefined, undefined, 'bottom_left',
    undefined, undefined, 'top_left', 'right',
    undefined, 'bottom_right', undefined, 'up',
    'top_right', 'left', 'down', 'all',
];

async function renderLineItem(
    lineItem: HOIPartial<ContainerWindowType>,
    centerNameCode: number,
    dotLine: boolean,
    parentInfo: ParentInfo,
    commonOptions: RenderCommonOptions,
): Promise<string> {
    const centerName: string | undefined = centerNameTable[centerNameCode];
    const containerWindow = await renderContainerWindow(lineItem, parentInfo, {
        ...commonOptions,
        noSize: true,
        onRenderChild: async (type, child, parent) => {
            if (type === 'icon') {
                const icon = child as HOIPartial<IconType>;
                const childName = child.name?.toLowerCase();
                if (childName === 'left' || childName === 'right' || childName === 'up' || childName === 'down') {
                    if ((childName === 'left' && (centerNameCode & 8)) ||
                        (childName === 'right' && (centerNameCode & 2)) ||
                        (childName === 'up' && (centerNameCode & 1)) ||
                        (childName === 'down' && (centerNameCode & 4))) {
                        return await renderIcon({
                            ...icon,
                            spritetype: `GFX_techtree_line_${childName}_${dotLine ? 'dot_' : ''}states`,
                            frame: 2,
                        }, parent, commonOptions);
                    } else {
                        return '';
                    }
                } else if (childName === 'center') {
                    if (centerName && !dotLine) {
                        return await renderIcon({
                            ...icon,
                            spritetype: `GFX_techline_center_${centerName}_states`, frame: 2
                        }, parent, commonOptions);
                    } else {
                        return '';
                    }
                }
            }

            return undefined;
        },
    });

    return containerWindow;
}

async function getSpriteFromTryList(tryList: string[], gfxFiles: string[]): Promise<Sprite | undefined> {
    let background: Sprite | undefined = undefined;
    for (const imageName of tryList) {
        background = await getSpriteByGfxName(imageName, gfxFiles);
        if (background !== undefined) {
            break;
        }
    }

    return background;
}

async function getTechnologyIcon(name: string, gfxFiles: string[], defaultIcon?: string): Promise<Sprite | undefined> {
    const result = await getSpriteByGfxName(name, gfxFiles);
    if (result !== undefined || !defaultIcon) {
        return result;
    }

    return await getSpriteByGfxName(defaultIcon, gfxFiles);
}

function defaultGetSprite(gfxFiles: string[]) {
    return (sprite: string) => {
        return getSpriteByGfxName(sprite, gfxFiles);
    };
}
