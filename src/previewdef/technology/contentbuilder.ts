import * as vscode from 'vscode';
import * as path from 'path';
import { parseHoi4File } from '../../hoiformat/hoiparser';
import { contextContainer } from '../../context';
import { localize } from '../../util/i18n';
import { Technology, getTechnologyTrees, TechnologyTree, TechnologyFolder } from '../../hoiformat/technology';
import { getTechnologyIcon, getSpriteByGfxName, Sprite } from '../../util/imagecache';
import { arrayToMap } from '../../util/common';
import { readFileFromModOrHOI4 } from '../../util/fileloader';
import { convertNodeFromFileToJson, HOIPartial, ContainerWindowType, GridBoxType, InstantTextBoxType } from '../../hoiformat/schema';
import { renderContainerWindow, renderContainerWindowChildren } from '../../util/html/containerwindow';
import { ParentInfo } from '../../util/html/common';
import { renderGridBox, GridBoxItem, GridBoxConnection } from '../../util/html/gridbox';
import { renderInstantTextBox } from '../../util/html/instanttextbox';

const technologyGfxFiles = ['interface/countrytechtreeview.gfx', 'interface/countrytechnologyview.gfx'];

export async function renderTechnologyFile(fileContent: string, uri: vscode.Uri, webview: vscode.Webview): Promise<string> {
    let baseContent = '';
    try {
        const technologyTrees = getTechnologyTrees(parseHoi4File(fileContent));
        if (technologyTrees.length < 1) {
            baseContent = localize('focustree.nofocustree', 'No technology tree.');
        } else {
            baseContent = await renderTechnologyFolder(technologyTrees, technologyTrees[0].folder);
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
    <div style="pointer-events: none;">
        ${baseContent}
    </div>
    <script src="${webview.asWebviewUri(vscode.Uri.file(path.join(contextContainer.current?.extensionPath || '', 'static/common.js')))}">
    </script>
    </body>
    </html>`;
}

async function renderTechnologyFolder(technologyTrees: TechnologyTree[], folder: string): Promise<string> {
    const guiFilePath = 'interface/countrytechtreeview.gui';
    const [guiFile] = await readFileFromModOrHOI4(guiFilePath);
    const guiTypes = convertNodeFromFileToJson(parseHoi4File(guiFile.toString())).guitypes;
    const containerWindowTypes = guiTypes.reduce((p, c) => p.concat(c.containerwindowtype), [] as HOIPartial<ContainerWindowType>[]);
    const techTreeView = containerWindowTypes.find(c => c.name === 'countrytechtreeview');
    if (!techTreeView) {
        throw new Error(`Can't find countrytechtreeview in ${guiFilePath}.`);
    }

    const folderTreeView = techTreeView.containerwindowtype.find(c => c.name === folder);
    if (!folderTreeView) {
        throw new Error(`Can't find technology folder ${folder} in ${guiFilePath}.`);
    }

    const folderItem = containerWindowTypes.find(c => c.name === `techtree_${folder}_item`);
    const folderSmallItem = containerWindowTypes.find(c => c.name === `techtree_${folder}_small_item`) || folderItem;

    return await renderContainerWindowChildren(
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
                return getSpriteByGfxName(sprite, technologyGfxFiles);
            }
        }
    );
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
        items: arrayToMap(tree.technologies.map<GridBoxItem>(t => ({
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
        }
    });
}

async function renderTechnology(item: HOIPartial<ContainerWindowType> | undefined, technology: Technology, folder: TechnologyFolder, parentInfo: ParentInfo): Promise<string> {
    if (!item) {
        return '';
    }

    const subSlotRegex = /^sub_technology_slot_(\d)$/;
    const containerWindow = await renderContainerWindow(item, parentInfo, {
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
            height: p;
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
        return await getTechnologyIcon(`GFX_${technology.id}_medium`);
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
                return getTechnologyIcon(sprite);
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
        background = await getSpriteByGfxName(imageName, technologyGfxFiles);
        if (background !== undefined) {
            break;
        }
    }

    return background;
}
