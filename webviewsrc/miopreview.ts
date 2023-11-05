import { getState, setState, arrayToMap, subscribeNavigators, scrollToState, tryRun, enableZoom } from "./util/common";
import { DivDropdown } from "./util/dropdown";
import { minBy } from "lodash";
import { renderGridBoxCommon, GridBoxItem, GridBoxConnection } from "../src/util/hoi4gui/gridboxcommon";
import { StyleTable, normalizeForStyle } from "../src/util/styletable";
import { applyCondition, ConditionItem } from "../src/hoiformat/condition";
import { NumberPosition } from "../src/util/common";
import { GridBoxType } from "../src/hoiformat/gui";
import { toNumberLike } from "../src/hoiformat/schema";
import { feLocalize } from './util/i18n';
import { Mio, MioTrait } from "../src/previewdef/mio/schema";

const mios: Mio[] = (window as any).mios;

let selectedExprs: ConditionItem[] = getState().selectedExprs ?? [];
let selectedMioIndex: number = Math.min(mios.length - 1, getState().selectedMioIndex ?? 0);
let conditions: DivDropdown | undefined = undefined;

async function buildContent() {
    const miopreviewplaceholder = document.getElementById('miopreviewplaceholder') as HTMLDivElement;
    
    const styleTable = new StyleTable();
    const mio = mios[selectedMioIndex];
    const renderedTrait: Record<string, string> = (window as any).renderedTrait[mio.id];
    const traits = Object.values(mio.traits);

    const allowBranchOptionsValue: Record<string, boolean> = {};
    const exprs = selectedExprs;
    Object.values(mio.traits).forEach(trait => {
        if (trait.hasVisible) {
            allowBranchOptionsValue[trait.id] = applyCondition(trait.visible, exprs);
        }
    });

    const gridbox: GridBoxType = (window as any).gridBox;

    const traitPosition: Record<string, NumberPosition> = {};
    calculateTraitVisible(mio, allowBranchOptionsValue);
    const traitGrixBoxItems = traits.map(trait => traitToGridItem(trait, mio, allowBranchOptionsValue, traitPosition)).filter((v): v is GridBoxItem => !!v);
    
    const minX = minBy(Object.values(traitPosition), 'x')?.x ?? 0;
    const leftPadding = gridbox.position.x._value - Math.min(minX * (window as any).xGridSize, 0);

    const traitPreviewContent = await renderGridBoxCommon({ ...gridbox, position: {...gridbox.position, x: toNumberLike(leftPadding)} }, {
        size: { width: 0, height: 0 },
        orientation: 'upper_left'
    }, {
        styleTable,
        items: arrayToMap(traitGrixBoxItems, 'id'),
        onRenderItem: item => Promise.resolve(
            renderedTrait[item.id].replace('{{position}}', item.gridX + ', ' + item.gridY)),
        cornerPosition: 0.5,
    });

    miopreviewplaceholder.innerHTML = traitPreviewContent + styleTable.toStyleElement((window as any).styleNonce);

    subscribeNavigators();
}

function calculateTraitVisible(mio: Mio, allowBranchOptionsValue: Record<string, boolean>) {
    const traits = mio.traits;

    let changed = true;
    while (changed) {
        changed = false;
        for (const key in traits) {
            const trait = traits[key];
            if (trait.anyParent.length === 0 && trait.allParents.length === 0 && !trait.parent) {
                continue;
            }

            if (trait.id in allowBranchOptionsValue) {
                continue;
            }

            if (trait.parent) {
                if (trait.parent.traits.length - trait.parent.traits.filter(p => allowBranchOptionsValue[p] === false).length < trait.parent.numNeeded) {
                    allowBranchOptionsValue[trait.id] = false;
                    changed = true;
                    break;
                }

                if (trait.parent.traits.filter(p => allowBranchOptionsValue[p] === true).length >= trait.parent.numNeeded) {
                    allowBranchOptionsValue[trait.id] = true;
                    changed = true;
                    continue;
                }
            }

            if (trait.allParents.some(p => allowBranchOptionsValue[p] === false)) {
                allowBranchOptionsValue[trait.id] = false;
                changed = true;
                break;
            }

            if (trait.anyParent.some(p => allowBranchOptionsValue[p] === true)) {
                allowBranchOptionsValue[trait.id] = true;
                changed = true;
                continue;
            }
        }
    }
}

function updateSelectedMio(clearCondition: boolean) {
    const mio = mios[selectedMioIndex];

    const conditionExprs = mio.conditionExprs;

    const conditionContainerElement = document.getElementById('condition-container') as HTMLDivElement | null;
    if (conditionContainerElement) {
        conditionContainerElement.style.display = conditionExprs.length > 0 ? 'block' : 'none';
    }

    if (conditions) {
        conditions.select.innerHTML = `<span class="value"></span>
            ${conditionExprs.map(option =>
                `<div class="option" value='${option.scopeName}!|${option.nodeContent}'>${option.scopeName ? `[${option.scopeName}]` : ''}${option.nodeContent}</div>`
            ).join('')}`;
        conditions.selectedValues$.next(clearCondition ? [] : selectedExprs.map(e => `${e.scopeName}!|${e.nodeContent}`));
    }

    const warnings = document.getElementById('warnings') as HTMLTextAreaElement | null;
    if (warnings) {
        warnings.value = mio.warnings.length === 0 ? feLocalize('worldmap.warnings.nowarnings', 'No warnings.') :
            mio.warnings.map(w => `[${w.source}] ${w.text}`).join('\n');
    }
}

function getTraitPosition(
    trait: MioTrait | undefined,
    positionByFocusId: Record<string, NumberPosition>,
    mio: Mio,
    traitStack: MioTrait[] = []
): NumberPosition {
    if (trait === undefined) {
        return { x: 0, y: 0 };
    }

    const cached = positionByFocusId[trait.id];
    if (cached) {
        return cached;
    }

    if (traitStack.includes(trait)) {
        return { x: 0, y: 0 };
    }

    let position: NumberPosition = { x: trait.x, y: trait.y };
    if (trait.relativePositionId !== undefined) {
        traitStack.push(trait);
        const relativeFocusPosition = getTraitPosition(mio.traits[trait.relativePositionId], positionByFocusId, mio, traitStack);
        traitStack.pop();
        position.x += relativeFocusPosition.x;
        position.y += relativeFocusPosition.y;
    }

    positionByFocusId[trait.id] = position;
    return position;
}

function traitToGridItem(
    trait: MioTrait,
    mio: Mio,
    allowBranchOptionsValue: Record<string, boolean>,
    positionByTraitId: Record<string, NumberPosition>,
): GridBoxItem | undefined {
    if (allowBranchOptionsValue[trait.id] === false) {
        return undefined;
    }

    const connections: GridBoxConnection[] = [];

    for (const parent of trait.anyParent) {
        connections.push({
            target: parent,
            targetType: 'parent',
            style: '1px dashed #88aaff',
        });
    }

    for (const parent of trait.allParents) {
        connections.push({
            target: parent,
            targetType: 'parent',
            style: '1px solid #88aaff',
        });
    }

    if (trait.parent) {
        const style = trait.parent.traits.length === trait.parent.numNeeded ? '1px solid #88aaff' : '1px dashed #88aaff';
        for (const parent of trait.parent.traits) {
            connections.push({
                target: parent,
                targetType: 'parent',
                style: style,
            });
        }
    }

    trait.exclusive.forEach(e => {
        connections.push({
            target: e,
            targetType: 'related',
            style: "1px solid red",
        });
    });

    const position = getTraitPosition(trait, positionByTraitId, mio, []);

    return {
        id: trait.id,
        htmlId: 'trait_' + trait.id,
        classNames: 'trait',
        gridX: position.x,
        gridY: position.y,
        connections,
    };
}

window.addEventListener('load', tryRun(async function() {
    // Mio selection
    const mioSelect = document.getElementById('mios') as HTMLSelectElement | null;
    if (mioSelect) {
        mioSelect.value = selectedMioIndex.toString();
        mioSelect.addEventListener('change', () => {
            selectedMioIndex = parseInt(mioSelect.value);
            setState({ selectedMioIndex });
            updateSelectedMio(true);
        });
    }

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
    const contentElement = document.getElementById('miopreviewcontent') as HTMLDivElement;
    enableZoom(contentElement, 0, 40);

    // Toggle warnings
    const showWarnings = document.getElementById('show-warnings') as HTMLButtonElement;
    if (showWarnings) {
        const warnings = document.getElementById('warnings-container') as HTMLDivElement;
        showWarnings.addEventListener('click', () => {
            const visible = warnings.style.display === 'block';
            document.body.style.overflow = visible ? '' : 'hidden';
            warnings.style.display = visible ? 'none' : 'block';
        });
    }
    
    updateSelectedMio(false);
    await buildContent();
    scrollToState();
}));
