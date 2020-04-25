window.hoi4mu.gfx = (function() {
    function filterChange(text) {
        text = text.toLowerCase();
        const elements = document.getElementsByClassName('spriteTypePreview');
        hoi4mu.setState({ filter: text });

        for (let i = 0; i < elements.length; i++) {
            const element = elements[i];
            element.style.display = (text.length === 0 || element.id.toLowerCase().includes(text)) ? 'inline-block' : 'none';
        }
    }

    window.addEventListener('load', function() {
        const filter = hoi4mu.getState().filter || '';
        const element = document.getElementById('filter');
        element.value = filter;
        filterChange(filter);

        const changeFunc = function() {
            hoi4mu.gfx.filterChange(this.value);
        };

        element.addEventListener('change', changeFunc);
        element.addEventListener('keypress', changeFunc);
        element.addEventListener('keyup', changeFunc);
        element.addEventListener('paste', changeFunc);
        element.addEventListener('cut', changeFunc);
    });

    return {
        filterChange: filterChange,
    };
})();
