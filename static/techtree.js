window.hoi4mu.tt = (function() {
    function folderChange(folder) {
        const elements = document.getElementsByClassName('techfolder');
        hoi4mu.setState({ folder: folder });

        for (let i = 0; i < elements.length; i++) {
            const element = elements[i];
            element.style.display = element.id === folder ? 'block' : 'none';
        }
    }

    window.addEventListener('load', function() {
        const element = document.getElementById('folderSelector');
        const folder = hoi4mu.getState().folder || element.value;
        element.value = folder;
        folderChange(folder);

        element.addEventListener('change', function() {
            folderChange(this.value);
        });
    });

    return {
        folderChange: folderChange,
    };
})();
