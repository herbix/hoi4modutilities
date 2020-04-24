import * as vscode from 'vscode';
import * as path from 'path';
import { parseHoi4File } from '../../hoiformat/hoiparser';
import { contextContainer } from '../../context';
import { localize } from '../../util/i18n';
import { Technology, getTechnologyTrees, TechnologyTree, TechnologyFolder } from './schema';
import { getSpriteByGfxName, Sprite } from '../../util/image/imagecache';
import { arrayToMap } from '../../util/common';
import { readFileFromModOrHOI4 } from '../../util/fileloader';
import { convertNodeFromFileToJson, HOIPartial, ContainerWindowType, GridBoxType, InstantTextBoxType } from '../../hoiformat/schema';
import { renderContainerWindow, renderContainerWindowChildren } from '../../util/html/containerwindow';
import { ParentInfo } from '../../util/html/common';
import { renderGridBox, GridBoxItem, GridBoxConnection } from '../../util/html/gridbox';
import { renderInstantTextBox } from '../../util/html/instanttextbox';

export const guiFilePath = 'interface/countrytechtreeview.gui';
const technologyUIGfxFiles = ['interface/countrytechtreeview.gfx', 'interface/countrytechnologyview.gfx'];
const technologiesGFX = 'interface/technologies.gfx';
const techTreeViewName = 'countrytechtreeview';

export async function renderTechnologyFile(fileContent: string, uri: vscode.Uri, webview: vscode.Webview): Promise<string> {
    let baseContent = '';
    try {
        const technologyTrees = getTechnologyTrees(parseHoi4File(fileContent, localize('infile', 'In file {0}:\n', uri.toString())));
        const folders = technologyTrees.map(tt => tt.folder).filter((v, i, a) => i === a.indexOf(v));
        if (folders.length < 1) {
            baseContent = localize('techtree.notechtree', 'No technology tree.');
        } else {
            baseContent = await renderTechnologyFolders(technologyTrees, folders);
        }

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
    <script src="${webview.asWebviewUri(vscode.Uri.file(path.join(contextContainer.current?.extensionPath || '', 'static/techtree.js')))}">
    </script>
    </body>
    </html>`;
}

async function renderTechnologyFolders(technologyTrees: TechnologyTree[], folders: string[]): Promise<string> {
    const [guiFile, realPath] = await readFileFromModOrHOI4(guiFilePath);
    const resolvedRealPath =  path.resolve(realPath);
    const openedDocument = vscode.workspace.textDocuments.find(d => path.resolve(d.uri.fsPath) === resolvedRealPath);
    const fileContent = openedDocument ? openedDocument.getText() : guiFile.toString();

    const guiTypes = convertNodeFromFileToJson(parseHoi4File(fileContent, localize('infile', 'In file {0}:\n', realPath))).guitypes;
    const containerWindowTypes = guiTypes.reduce((p, c) => p.concat(c.containerwindowtype), [] as HOIPartial<ContainerWindowType>[]);
    const techTreeView = containerWindowTypes.find(c => c.name?.toLowerCase() === techTreeViewName);
    if (!techTreeView) {
        throw new Error(localize('techtree.cantfindviewin', "Can't find {0} in {1}.", techTreeViewName, guiFilePath));
    }

    const techFolders = (await Promise.all(folders.map(folder => renderTechnologyFolder(technologyTrees, folder, techTreeView, containerWindowTypes)))).join('');
    
    return `
    <script>
        document.body.style.background = '#101010';
    </script>
    ${renderFolderSelector(folders)}
    <div id="dragger" style="width:100vw;height:100vh;position:fixed;left:0;top:0;"></div>
    <div
    style="
        position: absolute;
        left: 0;
        top: 0;
        pointer-events: none;
        margin-top: 40px;
    ">
        ${techFolders}
    </div>`;
}

function renderFolderSelector(folders: string[]): string {
    return `<div
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
        z-index: 10;
    ">
        <label for="folderSelector" style="margin-right:5px">${localize('techtree.techfolder', 'Technology folder: ')}</label>
        <select
            id="folderSelector"
            type="text"
            style="min-width:200px"
            onchange="hoi4mu.tt.folderChange(this.value)"
        >
            ${folders.map(folder => `<option value="techfolder_${folder}">${folder}</option>`)}
        </select>
    </div>`;
}

async function renderTechnologyFolder(technologyTrees: TechnologyTree[], folder: string, techTreeView: HOIPartial<ContainerWindowType>, allContainerWindowTypes: HOIPartial<ContainerWindowType>[]): Promise<string> {
    const folderTreeView = techTreeView.containerwindowtype.find(c => c.name === folder);
    let children: string;
    if (!folderTreeView) {
        children = `<div>${localize('techtree.cantfindtechfolderin', "Can't find technology folder {0} in {1}.", folder, guiFilePath)}</div>`;

    } else {
        const folderItem = allContainerWindowTypes.find(c => c.name === `techtree_${folder}_item`);
        const folderSmallItem = allContainerWindowTypes.find(c => c.name === `techtree_${folder}_small_item`) || folderItem;

        children = await renderContainerWindowChildren(
            folderTreeView,
            {
                size: { width: 1920, height: 1080 },
                orientation: 'upper_left',
            },
            {
                onRenderChild: async (type, child, parentInfo) => {
                    if (type === 'gridbox') {
                        const tree = technologyTrees.find(t => t.startTechnology + '_tree' === child.name);
                        if (tree) {
                            const gridboxType = child as HOIPartial<GridBoxType>;
                            return await renderTechnologyTreeGridBox(tree, gridboxType, folder, folderItem, folderSmallItem, parentInfo);
                        }
                    }

                    return undefined;
                },
                getSprite: sprite => {
                    return getSpriteByGfxName(sprite, technologyUIGfxFiles);
                }
            }
        );
    }

    return `<div
        id="techfolder_${folder}"
        class="techfolder"
    >
        ${children}
    </div>`;
}

async function renderTechnologyTreeGridBox(
    tree: TechnologyTree,
    gridboxType: HOIPartial<GridBoxType>,
    folder: string,
    folderItem: HOIPartial<ContainerWindowType> | undefined,
    folderSmallItem: HOIPartial<ContainerWindowType> | undefined,
    parentInfo: ParentInfo
): Promise<string> {
    const treeMap = arrayToMap(tree.technologies, 'id');
    return await renderGridBox(gridboxType, parentInfo, {
        items: arrayToMap(tree.technologies.filter(t => folder in t.folders).map<GridBoxItem>(t => ({
            id: t.id,
            gridX: t.folders[folder]?.x ?? 0,
            gridY: t.folders[folder]?.y ?? 0,
            connections: t.leadsToTechs.map<GridBoxConnection>(c => {
                if (treeMap[c]?.leadsToTechs.includes(t.id)) {
                    return {
                        target: c,
                        style: "1px dashed #88aaff",
                        targetType: "related",
                    };
                }
                return {
                    target: c,
                    style: "1px solid #88aaff",
                    targetType: "child",
                };
            }).concat(t.xor.map<GridBoxConnection>(c => ({
                target: c,
                style: "1px solid red",
                targetType: "related",
            })))
        })), 'id'),
        onRenderItem: async (item, parent) => {
            const technology = treeMap[item.id];
            const technologyItem = technology.enableEquipments ? folderItem : folderSmallItem;
            return await renderTechnology(technologyItem, technology, technology.folders[folder], parent);
        },
        getSprite: sprite => {
            return getSpriteByGfxName(sprite, technologyUIGfxFiles);
        }
    });
}

async function renderTechnology(item: HOIPartial<ContainerWindowType> | undefined, technology: Technology, folder: TechnologyFolder, parentInfo: ParentInfo): Promise<string> {
    if (!item) {
        return `<div>${localize('techtree.cantfindtechitemin', "Can't find containerwindowtype \"{0}\" in {1}", `techtree_${folder.name}_item`, guiFilePath)}</div>`;
    }

    const subSlotRegex = /^sub_technology_slot_(\d)$/;
    const containerWindow = await renderContainerWindow(item, parentInfo, {
        noSize: true,
        getSprite: (sprite, callerType, callerName) => getTechnologySprite(sprite, technology, folder.name, callerType, callerName),
        onRenderChild: async (type, child, parentInfo) => {
            if (type === 'icon' && child.name === 'bonus_icon') {
                return '';
            }

            if (type === 'instanttextbox') {
                const childname = child.name?.toLowerCase();
                if (childname === 'bonus') {
                    return '';
                } else if (childname === 'name') {
                    return await renderInstantTextBox({ ...child, text: technology.id } as HOIPartial<InstantTextBoxType>, parentInfo, {});
                }
            }

            if (type === 'containerwindow' && child.name) {
                const subSlot = subSlotRegex.exec(child.name.toLowerCase());
                if (subSlot) {
                    const slotId = parseInt(subSlot[1]);
                    return await renderSubTechnology(child as HOIPartial<ContainerWindowType>, folder, technology.subTechnologies[slotId], parentInfo);
                }
            }

            return undefined;
        }
    });

    return `<div
        title="${technology.id}\n(${folder.x}, ${folder.y})"
        style="
            position: absolute;
            left: 0;
            top: 0;
            width: 0;
            height: 0;
            cursor: pointer;
            pointer-events: auto;
        "
        onClick="hoi4mu.navigateText(${technology.token?.start}, ${technology.token?.end})">
            ${containerWindow}
        </div>`;
}

async function getTechnologySprite(sprite: string, technology: Technology, folder: string, callerType: 'bg' | 'icon', callerName: string | undefined): Promise<Sprite | undefined> {
    let imageTryList: string[] = [sprite];
    if (sprite === 'GFX_technology_unavailable_item_bg' && callerType === 'bg') {
        imageTryList = technology.enableEquipments ? [
            `GFX_technology_${folder}_available_item_bg`,
            `GFX_technology_available_item_bg`,
        ] : [
            `GFX_technology_${folder}_small_available_item_bg`,
            `GFX_technology_${folder}_available_item_bg`,
            `GFX_technology_available_item_bg`,
        ];
    } else if (sprite === 'GFX_technology_medium' && callerType === 'icon') {
        return await getTechnologyIcon(`GFX_${technology.id}_medium`, 'medium');
    }

    return await getSpriteFromTryList(imageTryList);
}

async function renderSubTechnology(containerWindow: HOIPartial<ContainerWindowType>, folder: TechnologyFolder, subTechnology: Technology | undefined, parentInfo: ParentInfo): Promise<string> {
    if (subTechnology === undefined) {
        return '';
    }

    const containerWindowResult = await renderContainerWindow(containerWindow, parentInfo, {
        getSprite: (sprite, callerType, callerName) => {
            let imageTryList = [sprite];
            if (callerType === 'bg' && callerName === containerWindow.background?.name) {
                imageTryList = [
                    `GFX_subtechnology_${folder}_available_item_bg`,
                    `GFX_subtechnology_available_item_bg`,
                ];
            } else if (callerType === 'icon' && callerName?.toLowerCase() === 'picture') {
                return getTechnologyIcon(sprite, 'small');
            }

            return getSpriteFromTryList(imageTryList);
        }
    });

    return `<div
        title="${subTechnology.id}\n(${folder.x}, ${folder.y})"
        style="
            position: absolute;
            left: 0;
            top: 0;
            width: 0;
            height: p;
            cursor: pointer;
            pointer-events: auto;
        "
        onClick="event.stopPropagation(); hoi4mu.navigateText(${subTechnology.token?.start}, ${subTechnology.token?.end})">
            ${containerWindowResult}
        </div>`;
}

async function getSpriteFromTryList(tryList: string[]): Promise<Sprite | undefined> {
    let background: Sprite | undefined = undefined;
    for (const imageName of tryList) {
        background = await getSpriteByGfxName(imageName, technologyUIGfxFiles);
        if (background !== undefined) {
            break;
        }
    }

    return background;
}

async function getTechnologyIcon(name: string, type: 'medium' | 'small'): Promise<Sprite | undefined> {
    const result = await getSpriteByGfxName(name, technologiesGFX);
    if (result !== undefined) {
        return result;
    }

    return await getSpriteByGfxName('GFX_technology_' + type, technologyUIGfxFiles);
}
