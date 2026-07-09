import { chain, flatMap, flatten, min, sumBy } from "lodash";
import { RenderedTechnologyFolder, RenderedTechnologyFolderGridBox, Technology, TechnologyTree } from "../src/previewdef/technology/schema";
import { RenderCommonOptions } from "../src/util/hoi4gui/common";
import { GridBoxConnection, GridBoxItem, renderGridBoxCommon } from "../src/util/hoi4gui/gridboxcommon";
import { setState, getState, scrollToState, tryRun, subscribeRefreshButton, subscribeNavigators, arrayToMap, enableZoom, subscribePreviewLabelToggle, refreshPreviewLabelMode } from "./util/common";
import { StyleTable } from "../src/util/styletable";
import { applyCondition, ConditionItem } from "../src/hoiformat/condition";
import { DivDropdown } from "./util/dropdown";
const renderedTechFolders: Record<string, RenderedTechnologyFolder> = (window as any).renderedTechFolders;
const technologyTrees: TechnologyTree[] = (window as any).technologyTrees;

let selectedExprs: ConditionItem[] = getState().selectedExprs ?? [];
let selectedFolder: string = getState().folder;
let conditions: DivDropdown | undefined = undefined;

async function buildContent() {
    const mainContent = document.getElementById('mainContent') as HTMLDivElement;
    const folder = selectedFolder;
    const renderedFolder = renderedTechFolders[folder];
    let template = renderedFolder.template ?? '';

    const styleTable = new StyleTable();
    const commonOptions: RenderCommonOptions = {
        styleTable,
    };
    for (const [startTechId, gridbox] of Object.entries(renderedFolder.gridboxes)) {
        const tree = technologyTrees.find(t => t.startTechnology === startTechId);
        if (!tree) {
            continue;
        }
        template = template.replace('{{gridbox-' + startTechId + '}}',
            await renderTechnologyTreeGridBox(tree, gridbox, folder, commonOptions, renderedFolder));
    }

    mainContent.innerHTML = template + styleTable.toStyleElement((window as any).styleNonce);
    subscribeNavigators();
    refreshPreviewLabelMode();
}

async function renderTechnologyTreeGridBox(
    tree: TechnologyTree,
    gridbox: RenderedTechnologyFolderGridBox,
    folder: string,
    commonOptions: RenderCommonOptions,
    renderedFolder: RenderedTechnologyFolder,
): Promise<string> {
    const xorJointKey = "#xorJoint#";
    const techMap = arrayToMap(tree.technologies, 'id');
    const technologiesInFolder = tree.technologies.filter(t => folder in t.folders);
    
    const allowBranchOptionsValue: Record<string, boolean> = {};
    const exprs = selectedExprs;
    technologiesInFolder.forEach(tech => {
        if (tech.allowBranch) {
            allowBranchOptionsValue[tech.id] = applyCondition(tech.allowBranch, exprs);
        }
    });

    calculateTechAllowed(technologiesInFolder, allowBranchOptionsValue);
    const allowedTechnologies = technologiesInFolder.filter(t => allowBranchOptionsValue[t.id] !== false);

    const technologyXorJoints = allowedTechnologies
        .map<{ tech: Technology, nonXors: Technology[], xorGroups: Technology[][] } | undefined>(tech => findXorGroups(techMap, tech, folder))
        .filter((t): t is { tech: Technology, nonXors: Technology[], xorGroups: Technology[][] } => t !== undefined && t.xorGroups.length > 0);
    const technologyXorJointsMap: Record<string, {nonXors: Technology[], xorGroups: Technology[][]}> = {};

    technologyXorJoints.forEach(({ tech, nonXors, xorGroups }) => technologyXorJointsMap[tech.id] = { nonXors, xorGroups });

    const technologyItemsArray = allowedTechnologies.map<GridBoxItem>(t => {
        const jointsItem = technologyXorJointsMap[t.id];
        const connections: GridBoxConnection[] = [];
        let leadsToTechs: Technology[];
        if (jointsItem) {
            const { nonXors, xorGroups } = jointsItem;
            leadsToTechs = nonXors;
            connections.push(...xorGroups.map<GridBoxConnection>((_, i) => ({ target: xorJointKey + t.id + i, style: "1px solid #88aaff", targetType: "child" })));
        } else {
            leadsToTechs = t.leadsToTechs.map(t => techMap[t]).filter(t => t !== undefined);
        }

        connections.push(...leadsToTechs.map<GridBoxConnection>(c => {
            if (c.leadsToTechs.includes(t.id)) {
                return { target: c.id, style: "1px dashed #88aaff", targetType: "related" };
            }
            return { target: c.id, style: "1px solid #88aaff", targetType: "child" };
        }));

        return {
            id: t.id,
            gridX: t.folders[folder].x,
            gridY: t.folders[folder].y,
            connections,
        };
    });

    const technologyXorJointsItemsArray = flatMap(technologyXorJoints, ({ tech, xorGroups }) =>
        xorGroups.map<GridBoxItem>((tl, i) => ({
            id: xorJointKey + tech.id + i,
            gridX: Math.round(sumBy(tl, t => t.folders[folder].x) / tl.length),
            gridY: (min(tl.map(t1 => t1.folders[folder].y)) ?? 0) - 1,
            isJoint: true,
            connections: tl.map<GridBoxConnection>(c => {
                return { target: c.id, style: "1px solid red", targetType: "child" };
            }),
        }))
    );

    const hasLineItem = renderedFolder.renderedLines.length === 32;

    return await renderGridBoxCommon(gridbox.gridbox, gridbox.parentInfo, {
        ...commonOptions,
        items: arrayToMap([...technologyItemsArray, ...technologyXorJointsItemsArray], 'id'),
        lineRenderMode: hasLineItem ? 'control' : 'line',
        onRenderItem: async (item, parent) => {
            if (item.id.startsWith(xorJointKey)) {
                const format = gridbox.gridbox.format?._name ?? 'up';
                return format === 'left' || format === 'right' ? renderedFolder.renderedXor.leftRight : renderedFolder.renderedXor.upDown;
            } else {
                return renderedFolder.renderedTechnologies[item.id] ?? '';
            }
        },
        onRenderLineBox: async (item, parent) => {
            if (!hasLineItem) {
                return '';
            }
            
            const directionalItems = [ item.up, item.down, item.right, item.left ];
            const inSet = chain(directionalItems).compact().flatMap(c => Object.keys(c.in)).uniq().value();
            const outSet = chain(directionalItems).compact().flatMap(c => Object.keys(c.out)).uniq().value();
            let sameInOut = false;
        
            if (inSet.length === outSet.length) {
                sameInOut = true;
                for (const inItem of inSet) {
                    if (!outSet.includes(inItem)) {
                        sameInOut = false;
                        break;
                    }
                }
            }

            const lineIndex = (item.up ? 1 : 0) | (item.right ? 2 : 0) | (item.down ? 4 : 0) | (item.left ? 8 : 0) | (sameInOut ? 16 : 0);
            return renderedFolder.renderedLines[lineIndex];
        },
    },
    async (_, _1) => gridbox.background);
}

function calculateTechAllowed(technologies: Technology[], allowBranchOptionsValue: Record<string, boolean>) {
    let changed = true;
    while (changed) {
        changed = false;
        for (const technology of technologies) {
            if (allowBranchOptionsValue[technology.id] !== false) {
                continue;
            }

            for (const leadsToTechId of technology.leadsToTechs) {
                const leadsToTech = technologies.find(t => t.id === leadsToTechId);
                if (!leadsToTech) {
                    continue;
                }

                if (!(leadsToTech.id in allowBranchOptionsValue) &&
                    technologies.filter(t => t.leadsToTechs.includes(leadsToTech.id)).every(t => allowBranchOptionsValue[t.id] === false)) {
                    allowBranchOptionsValue[leadsToTech.id] = false;
                    changed = true;
                }
            }
        }
    }
}

function findXorGroups(treeMap: Record<string, Technology>, technology: Technology, folder: string): { tech: Technology, nonXors: Technology[], xorGroups: Technology[][] } | undefined {
    const techChildren = technology.leadsToTechs
        .map(techName => treeMap[techName])
        .filter(tech => tech && folder in technology.folders);
    const xorGroupMap: Record<string, Technology[]> = {};

    for (const techChild of techChildren) {
        const techChildXors = techChild.xor
            .map(techName => treeMap[techName])
            .filter(techChildXor => techChildXor && folder in technology.folders && techChildXor !== techChild && techChildXor.xor.includes(techChild.id));
        if (techChildXors.length === 0) {
            continue;
        }

        const groups = techChildXors.map(tech => xorGroupMap[tech.id]).filter((v, i, a) => v !== undefined && i === a.indexOf(v));
        const bigGroup = flatten(groups).concat([ techChild ]);
        bigGroup.forEach(tech => xorGroupMap[tech.id] = bigGroup);
    }

    const xorGroups = Object.values(xorGroupMap).filter((v, i, a) => i === a.indexOf(v));
    if (xorGroups.length === 0) {
        return undefined;
    }

    const nonXors = techChildren.filter(tech => !xorGroups.some(group => group.includes(tech)));
    return { tech: technology, nonXors, xorGroups };
}

async function folderChange(folder: string, clearCondition: boolean) {
    selectedFolder = folder;
    setState({ folder: folder });
    
    const conditionExprs = chain(technologyTrees).filter(t => t.folder === folder).flatMap(t => t.conditionExprs).uniqBy(e => e.scopeName + '!' + e.nodeContent).value();

    const conditionContainerElement = document.getElementById('condition-container') as HTMLDivElement | null;
    if (conditionContainerElement) {
        conditionContainerElement.style.display = conditionExprs.length > 0 ? 'block' : 'none';
    }

    if (conditions) {
        conditions.select.innerHTML = `<span class="value"></span>
            ${conditionExprs.map(option =>
                `<div class="option" value='${option.scopeName}!|${option.nodeContent}'>${option.scopeName ? `[${option.scopeName}] ` : ''}${option.nodeContent}</div>`
            ).join('')}`;
        conditions.selectedValues$.next(clearCondition ? [] : selectedExprs.map(e => `${e.scopeName}!|${e.nodeContent}`));
    }

    await buildContent();
}

window.addEventListener('load', tryRun(async function() {
    subscribePreviewLabelToggle();

    // Tech tree folder selector
    const element = document.getElementById('folderSelector') as HTMLSelectElement;
    const folder = getState().folder || element.value;
    element.value = folder;
    element.addEventListener('change', function() {
        folderChange(this.value, true);
    });

    // Conditions
    const conditionsElement = document.getElementById('conditions') as HTMLDivElement | null;
    if (conditionsElement) {
        conditions = new DivDropdown(conditionsElement, true);
        
        conditions.selectedValues$.next(selectedExprs.map(e => `${e.scopeName}!|${e.nodeContent}`));
        conditions.selectedValues$.subscribe(async (selection) => {
            selectedExprs = selection.map<ConditionItem>(selection => {
                const index = selection.indexOf('!|');
                if (index === -1) {
                    return {
                        scopeName: '',
                        nodeContent: selection,
                    };
                } else {
                    return {
                        scopeName: selection.substring(0, index),
                        nodeContent: selection.substring(index + 2),
                    };
                }
            });

            setState({ selectedExprs });
            await buildContent();
        });
    }

    // Zoom
    const contentElement = document.getElementById('mainContent') as HTMLDivElement;
    enableZoom(contentElement, 0, 40);

    subscribeRefreshButton();
    await folderChange(folder, false);
    scrollToState();
}));

