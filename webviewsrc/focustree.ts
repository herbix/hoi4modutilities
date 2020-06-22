import { getState, setState } from "./util/common";
import { DivDropdown } from "./util/dropdown";
import { difference } from "lodash";

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

window.addEventListener('load', function() {
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
    
    const conditionsElement = document.getElementById('conditions') as HTMLDivElement | null;
    if (conditionsElement) {
        const conditions = new DivDropdown(conditionsElement, true);
    }

    const searchbox = document.getElementById('searchbox') as HTMLInputElement;
    let currentNavigatedIndex = 0;
    let oldSearchboxValue: string = getState().searchboxValue || '';
    let searchedFocus: HTMLDivElement[] = search(oldSearchboxValue, false);

    searchbox.value = oldSearchboxValue;

    const changeFunc = function(this: HTMLInputElement) {
        const searchboxValue = this.value.toLowerCase();
        if (oldSearchboxValue !== searchboxValue) {
            currentNavigatedIndex = 0;
            searchedFocus = search(searchboxValue);
            oldSearchboxValue = searchboxValue;
            setState({ searchboxValue });
        }
    };

    searchbox.addEventListener('change', changeFunc);
    searchbox.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            const visibleSearchedFocus = searchedFocus.filter(f => f.style.display !== 'none');
            if (visibleSearchedFocus.length > 0) {
                currentNavigatedIndex = (currentNavigatedIndex + (e.shiftKey ? visibleSearchedFocus.length - 1 : 1)) % visibleSearchedFocus.length;
                visibleSearchedFocus[currentNavigatedIndex].scrollIntoView({ block: "center", inline: "center" });
            }
        } else {
            changeFunc.apply(this);
        }
    });
    searchbox.addEventListener('keyup', changeFunc);
    searchbox.addEventListener('paste', changeFunc);
    searchbox.addEventListener('cut', changeFunc);

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
