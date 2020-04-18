window.hoi4mu.ft = (function() {
    function showBranch(visibility, optionClass) {
        const elements = document.getElementsByClassName(optionClass);

        const hiddenBranches = hoi4mu.getState().hiddenBranches || {};
        if (visibility) {
            delete hiddenBranches[optionClass];
        } else {
            hiddenBranches[optionClass] = true;
        }
        hoi4mu.setState({ hiddenBranches: hiddenBranches });

        for (let i = 0; i < elements.length; i++) {
            const element = elements[i];
            element.style.display = element.className.split(' ').some(b => hiddenBranches[b]) ? "none" : "block";
        }
    };

    function gotoFocus(focusId) {
        const focus = document.getElementById(focusId);
        if (focus) {
            focus.scrollIntoView({ block: "center", inline: "center" });
        }
    };

    window.addEventListener('load', function() {
        const hiddenBranches = hoi4mu.getState().hiddenBranches || {};
        
        for (const key in hiddenBranches) {
            const element = document.getElementById(key);
            element.checked = false;
            showBranch(false, key);
        }
    });

    return {
        showBranch: showBranch,
        gotoFocus: gotoFocus,
    };
})();
