import { enableDropdowns } from './dropdown';
import { enableCheckboxes } from './checkbox';
import { vscode } from './vscode';
import { sendException } from './telemetry';
export { arrayToMap } from '../../src/util/common';

export function setState(obj: Record<string, any>): void {
    const state = getState();
    Object.assign(state, obj);
    vscode.setState(state);
}

export function getState(): Record<string, any> {
    return vscode.getState() || {};
}

export function scrollToState() {
    const state = getState();
    const xOffset = state.xOffset || 0;
    const yOffset = state.yOffset || 0;
    window.scroll(xOffset, yOffset);
}

export function copyArray<T>(src: T[], dst: T[], offsetSrc: number, offsetDst: number, length: number): void {
    for (let i = offsetSrc, j = offsetDst, k = 0; k < length; i++, j++, k++) {
        dst[j] = src[i];
    }
}

export function subscribeNavigators() {
    const navigators = document.getElementsByClassName("navigator");
    for (let i = 0; i < navigators.length; i++) {
        const navigator = navigators[i] as HTMLDivElement;
        navigator.addEventListener('click', function(e) {
            e.stopPropagation();
            const startStr = this.attributes.getNamedItem('start')?.value;
            const endStr = this.attributes.getNamedItem('end')?.value;
            const file = this.attributes.getNamedItem('file')?.value;
            const start = !startStr || startStr === 'undefined' ? undefined : parseInt(startStr);
            const end = !endStr ? undefined : parseInt(endStr);
            navigateText(start, end, file);
        });
    }
}

export function tryRun<T extends (...args: any[]) => any>(func: T): (...args: Parameters<T>) => ReturnType<T> | undefined {
    return function(this: any, ...args) {
        try {
            const result = func.apply(this, args);
            if (result instanceof Promise) {
                return result.catch(e => {
                    console.error(e);
                    sendException(e);
                }) as ReturnType<T>;
            }

            return result;

        } catch (e) {
            console.error(e);
            sendException(e);
        }

        return undefined;
    };
}

export function enableZoom(contentElement: HTMLDivElement, xOffset: number, yOffset: number): void {
    let scale = getState().scale || 1;
    contentElement.style.transform = `scale(${scale})`;
    contentElement.style.transformOrigin = '0 0';
    window.addEventListener('wheel', function(e) {
        e.preventDefault();
        const oldScale = scale;

        if (e.deltaY > 0) {
            scale = Math.max(0.2, scale - 0.2);
        } else if (e.deltaY < 0) {
            scale = Math.min(1, scale + 0.2);
        }

        const oldScrollX = window.pageXOffset;
        const oldScrollY = window.pageYOffset;
        
        contentElement.style.transform = `scale(${scale})`;
        setState({ scale });

        const nextScrollX = (e.pageX - xOffset) * scale / oldScale + xOffset - (e.pageX - oldScrollX);
        const nextScrollY = (e.pageY - yOffset) * scale / oldScale + yOffset - (e.pageY - oldScrollY);
        window.scrollTo(nextScrollX, nextScrollY);
    },
    {
        passive: false
    });
}

function navigateText(start: number | undefined, end: number | undefined, file: string | undefined): void {
    vscode.postMessage({
        command: 'navigate',
        start,
        end,
        file,
    });
};

if (window.previewedFileUri) {
    setState({ uri: window.previewedFileUri });
}

window.addEventListener('load', function() {
    // Disable selection
    document.body.style.userSelect = 'none';

    // Save scroll position
    (function() {
        scrollToState();

        window.addEventListener('scroll', function() {
            const state = getState();
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

    subscribeNavigators();

    enableDropdowns();
    enableCheckboxes();
});
