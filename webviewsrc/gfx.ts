import { setState, getState } from "./util/common";

function filterChange(text: string) {
    text = text.toLowerCase();
    const elements = document.getElementsByClassName('spriteTypePreview');
    setState({ filter: text });

    for (let i = 0; i < elements.length; i++) {
        const element = elements[i] as HTMLDivElement;
        element.style.display = (text.length === 0 || element.id.toLowerCase().includes(text)) ? 'inline-block' : 'none';
    }
}

window.addEventListener('load', function() {
    const filter = getState().filter || '';
    const element = document.getElementById('filter') as HTMLInputElement;
    element.value = filter;
    filterChange(filter);

    const changeFunc = function(this: HTMLInputElement) {
        filterChange(this.value);
    };

    element.addEventListener('change', changeFunc);
    element.addEventListener('keypress', changeFunc);
    element.addEventListener('keyup', changeFunc);
    element.addEventListener('paste', changeFunc);
    element.addEventListener('cut', changeFunc);
});
