import { getState, setState, arrayToMap, subscribeNavigators, scrollToState } from "./util/common";
import { DivDropdown } from "./util/dropdown";
import { difference, minBy } from "lodash";
import { renderGridBox, GridBoxItem, GridBoxConnection } from "../src/util/hoi4gui/gridbox";
import { StyleTable } from "../src/util/styletable";
import { FocusTree, Focus } from "../src/previewdef/focustree/schema";
import { applyCondition, ConditionItem } from "../src/hoiformat/condition";
import { NumberPosition } from "../src/util/common";
import { GridBoxType } from "../src/hoiformat/gui";
import { toNumberLike } from "../src/hoiformat/schema";

function showBranch(visibility: boolean, optionClass: string) {
    const elements = document.getElementsByClassName(optionClass);

    const hiddenBranches = getState().hiddenBranches || {};
    if (visibility) {
        delete hiddenBranches[optionClass];
    } else {
        hiddenBranches[optionClass] = true;
    }
    setState({ hiddenBranches: hiddenBranches });

    for (let i = 0; i < elements.length; i++) {
        const element = elements[i] as HTMLDivElement;
        element.style.display = element.className.split(' ').some(b => hiddenBranches[b]) ? "none" : "block";
    }
};

function search(searchContent: string, navigate: boolean = true) {
    const focuses = document.getElementsByClassName('focus');
    const searchedFocus: HTMLDivElement[] = [];
    let navigated = false;
    for (let i = 0; i < focuses.length; i++) {
        const focus = focuses[i] as HTMLDivElement;
        if (searchContent && focus.id.toLowerCase().replace(/^focus_/, '').includes(searchContent)) {
            focus.style.outline = '1px solid #E33';
            focus.style.background = 'rgba(255, 0, 0, 0.5)';
            if (navigate && !navigated) {
                focus.scrollIntoView({ block: "center", inline: "center" });
                navigated = true;
            }
            searchedFocus.push(focus);
        } else {
            focus.style.outlineWidth = '0';
            focus.style.background = 'transparent';
        }
    }

    return searchedFocus;
}

const useConditionInFocus = (window as any).useConditionInFocus;
let selectedExprs: ConditionItem[] = getState().selectedExprs || [];

async function buildContent() {
    const focustreeplaceholder = document.getElementById('focustreeplaceholder') as HTMLDivElement;
    
    const styleTable = new StyleTable();
    const renderedFocus: Record<string, string> = (window as any).renderedFocus;
    const focustree: FocusTree = (window as any).focustree;
    const focuses = Object.values(focustree.focuses);

    const allowBranchOptionsValue: Record<string, boolean> = {};
    focustree.allowBranchOptions.forEach(option => {
        const focus = focustree.focuses[option];
        allowBranchOptionsValue[option] = !focus || focus.allowBranch === undefined || applyCondition(focus.allowBranch, selectedExprs);
    });

    const gridbox: GridBoxType = (window as any).gridBox;

    const focusPosition: Record<string, NumberPosition> = {};
    const focusGrixBoxItems = focuses.map(focus => focusToGridItem(focus, focustree, allowBranchOptionsValue, focusPosition)).filter((v): v is GridBoxItem => !!v);
    
    const minX = minBy(Object.values(focusPosition), 'x')?.x ?? 0;
    const leftPadding = gridbox.position.x._value - minX * (window as any).xGridSize;

    const focusTreeContent = await renderGridBox({ ...gridbox, position: {...gridbox.position, x: toNumberLike(leftPadding)} }, {
        size: { width: 0, height: 0 },
        orientation: 'upper_left'
    }, {
        styleTable,
        items: arrayToMap(focusGrixBoxItems, 'id'),
        onRenderItem: item => Promise.resolve(renderedFocus[item.id].replace('{{position}}', item.gridX + ', ' + item.gridY)),
        cornerPosition: 0.5,
    });

    focustreeplaceholder.innerHTML = focusTreeContent + styleTable.toStyleElement((window as any).styleNonce);
    subscribeNavigators();
}

function getFocusPosition(focus: Focus, positionByFocusId: Record<string, NumberPosition>, focustree: FocusTree): NumberPosition {
    const cached = positionByFocusId[focus.id];
    if (cached) {
        return cached;
    }

    let position: NumberPosition = { x: focus.x, y: focus.y };
    if (focus.relativePositionId !== undefined) {
        const relativeFocusPosition = getFocusPosition(focustree.focuses[focus.relativePositionId], positionByFocusId, focustree);
        position.x += relativeFocusPosition.x;
        position.y += relativeFocusPosition.y;
    }

    for (const offset of focus.offset) {
        if (offset.trigger !== undefined && applyCondition(offset.trigger, selectedExprs)) {
            position.x += offset.x;
            position.y += offset.y;
        }
    }

    positionByFocusId[focus.id] = position;
    return position;
}

function focusToGridItem(focus: Focus, focustree: FocusTree, allowBranchOptionsValue: Record<string, boolean>, positionByFocusId: Record<string, NumberPosition>): GridBoxItem | undefined {
    if (useConditionInFocus) {
        for (const allowBranch of focus.inAllowBranch) {
            if (allowBranchOptionsValue[allowBranch] === false) {
                return undefined;
            }
        }
    }

    const classNames = focus.inAllowBranch.map(v => 'inbranch_' + v).join(' ');
    const connections: GridBoxConnection[] = [];
    
    for (const prerequisites of focus.prerequisite) {
        let style: string;
        if (prerequisites.length > 1) {
            style = "1px dashed #88aaff";
        } else {
            style = "1px solid #88aaff";
        }

        prerequisites.forEach(p => {
            const fp = focustree.focuses[p];
            const classNames2 = fp?.inAllowBranch.map(v => 'inbranch_' + v).join(' ') ?? '';
            connections.push({
                target: p,
                targetType: 'parent',
                style: style,
                classNames: classNames + ' ' + classNames2,
            });
        });
    }

    focus.exclusive.forEach(e => {
        const fe = focustree.focuses[e];
        const classNames2 = fe?.inAllowBranch.map(v => 'inbranch_' + v).join(' ') ?? '';
        connections.push({
            target: e,
            targetType: 'related',
            style: "1px solid red",
            classNames: classNames + ' ' + classNames2,
        });
    });

    const position = getFocusPosition(focus, positionByFocusId, focustree);

    return {
        id: focus.id,
        htmlId: 'focus_' + focus.id,
        classNames: classNames + ' focus',
        gridX: position.x,
        gridY: position.y,
        connections,
    };
}

window.addEventListener('load', async function() {
    await buildContent();
    scrollToState();

    // Allow branch
    if (!useConditionInFocus) {
        const hiddenBranches = getState().hiddenBranches || {};
        for (const key in hiddenBranches) {
            showBranch(false, key);
        }

        const allowBranchesElement = document.getElementById('allowbranch') as HTMLDivElement | null;
        if (allowBranchesElement) {
            const allowBranches = new DivDropdown(allowBranchesElement, true);
            allowBranches.selectAll();

            const allValues = allowBranches.selectedValues;
            allowBranches.setSelection(allValues.filter(v => !hiddenBranches[v]));

            let oldSelection = allowBranches.selectedValues;
            allowBranches.onChange(selection => {
                const showBranches = difference(selection, oldSelection);
                showBranches.forEach(s => showBranch(true, s));
                const hideBranches = difference(oldSelection, selection);
                hideBranches.forEach(s => showBranch(false, s));
                oldSelection = selection;
            });
        }
    }

    // Searchbox
    const searchbox = document.getElementById('searchbox') as HTMLInputElement;
    let currentNavigatedIndex = 0;
    let oldSearchboxValue: string = getState().searchboxValue || '';
    let searchedFocus: HTMLDivElement[] = search(oldSearchboxValue, false);

    searchbox.value = oldSearchboxValue;

    const searchboxChangeFunc = function(this: HTMLInputElement) {
        const searchboxValue = this.value.toLowerCase();
        if (oldSearchboxValue !== searchboxValue) {
            currentNavigatedIndex = 0;
            searchedFocus = search(searchboxValue);
            oldSearchboxValue = searchboxValue;
            setState({ searchboxValue });
        }
    };

    searchbox.addEventListener('change', searchboxChangeFunc);
    searchbox.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            const visibleSearchedFocus = searchedFocus.filter(f => f.style.display !== 'none');
            if (visibleSearchedFocus.length > 0) {
                currentNavigatedIndex = (currentNavigatedIndex + (e.shiftKey ? visibleSearchedFocus.length - 1 : 1)) % visibleSearchedFocus.length;
                visibleSearchedFocus[currentNavigatedIndex].scrollIntoView({ block: "center", inline: "center" });
            }
        } else {
            searchboxChangeFunc.apply(this);
        }
    });
    searchbox.addEventListener('keyup', searchboxChangeFunc);
    searchbox.addEventListener('paste', searchboxChangeFunc);
    searchbox.addEventListener('cut', searchboxChangeFunc);

    // Conditions
    if (useConditionInFocus) {
        const conditionsElement = document.getElementById('conditions') as HTMLDivElement | null;
        if (conditionsElement) {
            const conditions = new DivDropdown(conditionsElement, true);
            
            conditions.setSelection(selectedExprs.map(e => `${e.scopeName}!|${e.nodeContent}`));

            conditions.onChange(async (selection) => {
                selectedExprs = selection.map<ConditionItem>(selection => {
                    const index = selection.indexOf('!|');
                    if (index === -1) {
                        return {
                            scopeName: '',
                            nodeContent: selection,
                        };
                    } else {
                        return {
                            scopeName: selection.substr(0, index),
                            nodeContent: selection.substr(index + 2),
                        };
                    }
                });

                setState({ selectedExprs });
                
                await buildContent();
                searchedFocus = search(oldSearchboxValue, false);
            });
        }
    }

    // Zoom
    let scale = getState().scale || 1;
    const contentElement = document.getElementById('focustreecontent') as HTMLDivElement;
    contentElement.style.transform = `scale(${scale})`;
    contentElement.style.transformOrigin = '0 0';
    window.addEventListener('wheel', function(e) {
        e.preventDefault();
        const oldScale = scale;

        if (e.deltaY > 0) {
            scale = Math.max(0.2, scale - 0.2);
        } else if (e.deltaY < 0) {
            scale = Math.min(1, scale + 0.2);
        }

        const oldScrollX = window.pageXOffset;
        const oldScrollY = window.pageYOffset;
        
        contentElement.style.transform = `scale(${scale})`;
        setState({ scale });

        const nextScrollX = e.pageX * scale / oldScale - (e.pageX - oldScrollX);
        const nextScrollY = (e.pageY - 40) * scale / oldScale + 40 - (e.pageY - oldScrollY);
        window.scrollTo(nextScrollX, nextScrollY);
    },
    {
        passive: false
    });
});
