import { setState, getState } from "../common";

export const height = 40;
export let viewMode: 'province' | 'state' = getState().viewMode ?? 'province';
export let colorSet: 'provinceid' | 'provincetype' | 'terrain' | 'country' | 'stateid' = getState().colorSet ?? 'provinceid';

let renderer: { renderCanvas: () => void }; 

export function init(theRenderer: { renderCanvas: () => void }) {
    renderer = theRenderer;
    loadControls();
}

function loadControls() {
    const viewModeElement = document.getElementById('viewmode') as HTMLSelectElement;
    const colorSetElement = document.getElementById('colorset') as HTMLSelectElement;

    viewModeElement.value = viewMode;
    colorSetElement.value = colorSet;

    viewModeElement.addEventListener('change', function() {
        viewMode = this.value as any;
        renderer.renderCanvas();
        setState({ viewMode });
    });

    colorSetElement.addEventListener('change', function() {
        colorSet = this.value as any;
        renderer.renderCanvas();
        setState({ colorSet });
    });
}
