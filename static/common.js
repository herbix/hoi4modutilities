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

    function scrollToState() {
        const state = vscode.getState() || {};
        const xOffset = state.xOffset || 0;
        const yOffset = state.yOffset || 0;
        window.scroll(xOffset, yOffset);
    }

    setState({ uri: window.previewedFileUri });

    window.addEventListener('load', function() {
        // Disable selection
        document.body.style.userSelect = 'none';

        // Save scroll position
        (function() {
            scrollToState();

            window.addEventListener('scroll', function() {
                const state = vscode.getState() || {};
                state.xOffset = window.pageXOffset;
                state.yOffset = window.pageYOffset;
                vscode.setState(state);
            });
        })();

        // Drag to scroll
        (function() {
            // Dragger should be like this: <div id="dragger" style="width:100vw;height:100vh;position:fixed;left:0;top:0;"></div>
            const dragger = document.getElementById("dragger");
            if (!dragger) {
                return;
            }

            let mdx = -1;
            let mdy = -1;
            let pressed = false;
            dragger.addEventListener('mousedown', function(e) {
                mdx = e.pageX;
                mdy = e.pageY;
                pressed = true;
            });

            document.body.addEventListener('mousemove', function(e) {
                if (pressed) {
                    window.scroll(window.pageXOffset - e.pageX + mdx, window.pageYOffset - e.pageY + mdy);
                }
            });

            document.body.addEventListener('mouseup', function() {
                pressed = false;
            });

            document.body.addEventListener('mouseenter', function(e) {
                if (pressed && (e.buttons & 1) !== 1) {
                    pressed = false;
                }
            });
        })();

        // Subscribe navigator
        (function() {
            const navigators = document.getElementsByClassName("navigator");
            for (let i = 0; i < navigators.length; i++) {
                const navigator = navigators[i];
                navigator.addEventListener('click', function(e) {
                    e.stopPropagation();
                    const start = this.attributes.start.value === 'undefined' ? undefined : parseInt(this.attributes.start.value);
                    const end = parseInt(this.attributes.end.value);
                    navigateText(start, end);
                });
            }
        })();
    });

    return {
        vscode: vscode,
        setState: setState,
        getState: getState,
        navigateText: navigateText,
        scrollToState: scrollToState,
    };
})();
