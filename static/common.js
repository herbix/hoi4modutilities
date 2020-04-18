window.hoi4mu = (function() {
    const vscode = acquireVsCodeApi();
    
    function navigateText(start, end) {
        vscode.postMessage({
            command: 'navigate',
            start: start,
            end: end
        });
    };

    function setState(obj) {
        const state = getState();
        Object.assign(state, obj);
        vscode.setState(state);
    }

    function getState() {
        return vscode.getState() || {};
    }

    setState({ uri: window.previewedFileUri });

    window.addEventListener('load', function() {
        const state = vscode.getState() || {};
        const xOffset = state.xOffset || 0;
        const yOffset = state.yOffset || 0;
        window.scroll(xOffset, yOffset);

        window.addEventListener('scroll', function() {
            const state = vscode.getState() || {};
            state.xOffset = window.pageXOffset;
            state.yOffset = window.pageYOffset;
            vscode.setState(state);
        });
    });

    return {
        vscode: vscode,
        setState: setState,
        getState: getState,
        navigateText: navigateText,
    };
})();
