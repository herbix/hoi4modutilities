(function() {
    const vscode = acquireVsCodeApi();
    const hiddenBranches = {};

    window.navigateText = function(start, end) {
        vscode.postMessage({
            command: 'navigate',
            start: start,
            end: end
        });
    };

    window.showBranch = function(visibility, optionClass) {
        const elements = document.getElementsByClassName(optionClass);

        if (visibility) {
            delete hiddenBranches[optionClass];
        } else {
            hiddenBranches[optionClass] = true;
        }

        const hiddenBranchesList = Object.keys(hiddenBranches);
        for (let i = 0; i < elements.length; i++) {
            const element = elements[i];
            element.style.display = element.className.split(' ').some(b => hiddenBranchesList.includes(b)) ? "none" : "block";
        }
    };

    window.gotoFocus = function(focusId) {
        const focus = this.document.getElementById(focusId);
        if (focus) {
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
