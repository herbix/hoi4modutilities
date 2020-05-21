import { getState, setState } from "./util/common";

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

function gotoFocus(focusId: string) {
    const focus = document.getElementById(focusId);
    if (focus) {
        focus.scrollIntoView({ block: "center", inline: "center" });
    }
};

window.addEventListener('load', function() {
    const hiddenBranches = getState().hiddenBranches || {};
    for (const key in hiddenBranches) {
        const element = document.getElementById(key) as HTMLInputElement;
        element.checked = false;
        showBranch(false, key);
    }

    const inbranchCheckboxes = document.getElementsByClassName("inbranch-checkbox");
    for (let i = 0; i < inbranchCheckboxes.length; i++) {
        const inbranchCheckbox = inbranchCheckboxes[i] as HTMLInputElement;
        inbranchCheckbox.addEventListener('change', function() {
            showBranch(this.checked, this.id);
        });
    }

    const goToFocusButtons = document.getElementsByClassName("gotofocus-button");
    for (let i = 0; i < goToFocusButtons.length; i++) {
        const goToFocusButton = goToFocusButtons[i] as HTMLLinkElement;
        goToFocusButton.addEventListener('click', function(e) {
            e.stopPropagation();
            const focusName = this.attributes.getNamedItem('focus')?.value;
            if (focusName) {
                gotoFocus(focusName);
            }
        });
    }
});
