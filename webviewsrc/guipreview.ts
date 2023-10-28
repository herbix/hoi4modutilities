import { normalizeForStyle } from "../src/util/styletable";
import { Checkbox } from "./util/checkbox";
import { setState, getState, scrollToState, tryRun, subscribeRefreshButton } from "./util/common";

const existingCheckboxes: Checkbox[] = [];
let toggleVisibilityContentVisible = getState().toggleVisibilityContentVisible;

function folderChange(folder: string) {
    const elements = document.getElementsByClassName('containerwindow');
    setState({ folder: folder });

    for (let i = 0; i < elements.length; i++) {
        const element = elements[i] as HTMLDivElement;
        element.style.display = element.id === folder ? 'block' : 'none';
    }

    setupContainerWindowToggles(folder);
}

function setupContainerWindowToggles(folder: string) {
    existingCheckboxes.forEach(checkbox => checkbox.dispose());
    existingCheckboxes.length = 0;

    const containerWindowVisibilities: Record<string, boolean> = getState().containerWindowVisibilities ?? {};
    const toggleVisibilityContentInner = document.getElementById('toggleVisibilityContentInner') as HTMLDivElement;
    const containerWindowName = folder.replace('containerwindow_', '');
    toggleVisibilityContentInner.innerHTML = (window as any).containerWindowToggles[containerWindowName]?.content ?? '';
    const checkboxes = document.getElementsByClassName('toggleContainerWindowCheckbox');
    
    const toggleVisibility = document.getElementById('toggleVisibility') as HTMLButtonElement;
    toggleVisibility.disabled = toggleVisibilityContentInner.innerHTML === '';
    if (toggleVisibility.disabled) {
        toggleVisibilityContentVisible = false;
        refreshToggleVisibilityContent();
        setState({ toggleVisibilityContentVisible });
    }

    const relatedContainerWindow: Record<string, HTMLElement | null> = {};
    for (let i = 0; i < checkboxes.length; i++) {
        const input = checkboxes.item(i) as HTMLInputElement;
        let selector = '.containerwindow_' + normalizeForStyle(containerWindowName) + ' ';
        for (let j = 0; j <= i; j++) {
            const anotherInput = checkboxes.item(j) as HTMLInputElement;
            if (input.id.startsWith(anotherInput.id)) {
                selector = selector + '.childcontainerwindow_' + normalizeForStyle(anotherInput.attributes.getNamedItem('containerWindowName')?.value ?? '') + ' ';
            }
        }
        relatedContainerWindow[input.id] = document.querySelector(selector);
    }

    for (let i = 0; i < checkboxes.length; i++) {
        const input = checkboxes.item(i) as HTMLInputElement;
        input.checked = !(input.id in containerWindowVisibilities) || containerWindowVisibilities[input.id];
        
        const containerWindow = relatedContainerWindow[input.id];
        if (containerWindow) {
            containerWindow.style.display = input.checked ? 'block' : 'none';
        }

        const checkbox = new Checkbox(input, input.attributes.getNamedItem('containerWindowName')?.value ?? '');
        existingCheckboxes.push(checkbox);

        input.addEventListener('change', () => {
            containerWindowVisibilities[input.id] = input.checked;
            if (input.checked) {
                for (let i = 0; i < checkboxes.length; i++) {
                    const anotherInput = checkboxes.item(i) as HTMLInputElement;
                    if (anotherInput !== input && (anotherInput.id.startsWith(input.id) || input.id.startsWith(anotherInput.id))) {
                        anotherInput.checked = true;
                        containerWindowVisibilities[anotherInput.id] = true;
                    }
                }
            } else {
                for (let i = 0; i < checkboxes.length; i++) {
                    const anotherInput = checkboxes.item(i) as HTMLInputElement;
                    if (anotherInput !== input && anotherInput.id.startsWith(input.id)) {
                        anotherInput.checked = false;
                        containerWindowVisibilities[anotherInput.id] = false;
                    }
                }
            }
            setState({ containerWindowVisibilities });
            for (let i = 0; i < checkboxes.length; i++) {
                const input = checkboxes.item(i) as HTMLInputElement;
                const containerWindow = relatedContainerWindow[input.id];
                if (containerWindow) {
                    containerWindow.style.display = input.checked ? 'block' : 'none';
                }
            }
        });
    }
}

function refreshToggleVisibilityContent() {
    const mainContent = document.getElementById('mainContent') as HTMLDivElement;
    const toggleVisibilityContent = document.getElementById('toggleVisibilityContent') as HTMLDivElement;
    toggleVisibilityContent.style.display = toggleVisibilityContentVisible ? 'block' : 'none';
    mainContent.style.marginTop = toggleVisibilityContentVisible ? '240px' : '40px';
}

window.addEventListener('load', tryRun(function() {
    const folderSelector = document.getElementById('folderSelector') as HTMLSelectElement;
    const folder = getState().folder || folderSelector.value;
    folderSelector.value = folder;
    folderChange(folder);
    folderSelector.addEventListener('change', function() {
        setState({ containerWindowVisibilities: {} });
        folderChange(this.value);
    });

    refreshToggleVisibilityContent();
    const toggleVisibility = document.getElementById('toggleVisibility') as HTMLButtonElement;
    toggleVisibility.addEventListener('click', () => {
        toggleVisibilityContentVisible = !toggleVisibilityContentVisible;
        refreshToggleVisibilityContent();
        setState({ toggleVisibilityContentVisible });
    });

    scrollToState();
    subscribeRefreshButton();

}));
