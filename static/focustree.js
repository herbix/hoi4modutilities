(function() {
    const vscode = acquireVsCodeApi();

    window.navigateText = function(start, end) {
        vscode.postMessage({
            command: 'navigate',
            start: start,
            end: end
        });
    };

    window.showBranch = function(visibility, optionClass, focusId) {
        const elements = document.getElementsByClassName(optionClass);
        const focus = this.document.getElementById(focusId);
        if (!visibility && focus) {
            focus.scrollIntoView({ block: "center", inline: "center" });
        }

        for (let i = 0; i < elements.length; i++) {
            elements[i].style.display = visibility ? "block" : "none";
        }

        if (visibility && focus) {
            focus.scrollIntoView({ block: "center", inline: "center" });
        }
    };

    window.onload = function() {
        const state = vscode.getState() || {};
        const xOffset = state.xOffset || 0;
        const yOffset = state.yOffset || 0;
        window.scroll(xOffset, yOffset);

        window.onscroll = function() {
            const state = vscode.getState() || {};
            state.xOffset = window.pageXOffset;
            state.yOffset = window.pageYOffset;
            vscode.setState(state);
        };
    };
    
    const state = vscode.getState() || {};
    state.uri = window.previewedFileUri;
    vscode.setState(state);
})();
