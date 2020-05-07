import { ViewPoint } from "./definitions";
import { ProvinceMap } from "./definitions";
import { setState } from "../common";

export function enableDragger(
    canvas: HTMLCanvasElement,
    viewPoint: ViewPoint,
    loader: { provinceMap: ProvinceMap | undefined },
    renderer: { renderCanvas: () => void },
    topBar: { height: number },
) {
    let mdx = -1;
    let mdy = -1;
    let pressed = false;
    let vpx = -1;
    let vpy = -1;

    function alignViewPointXY() {
        if (!loader.provinceMap) {
            return;
        }

        if (viewPoint.x < 0) {
            viewPoint.x += loader.provinceMap.width;
        } else if (viewPoint.x > loader.provinceMap.width) {
            viewPoint.x -= loader.provinceMap.width;
        }

        if (viewPoint.y < -topBar.height) {
            viewPoint.y = -topBar.height;
        } else if (viewPoint.y > loader.provinceMap.height - canvas.height / viewPoint.scale) {
            viewPoint.y = loader.provinceMap.height - canvas.height / viewPoint.scale;
        }
    }

    canvas.addEventListener('mousedown', (e) => {
        if (!loader.provinceMap || !(e.buttons & 2)) {
            return;
        }

        mdx = e.pageX;
        mdy = e.pageY;
        vpx = viewPoint.x;
        vpy = viewPoint.y;
        pressed = true;
    });

    document.body.addEventListener('mousemove', function(e) {
        if (!loader.provinceMap) {
            pressed = false;
        }

        if (pressed) {
            viewPoint.x = vpx - (e.pageX - mdx) / viewPoint.scale;
            viewPoint.y = vpy - (e.pageY - mdy) / viewPoint.scale;
            alignViewPointXY();
            setState({ viewPoint });
            renderer.renderCanvas();
        }
    });

    document.body.addEventListener('mouseup', function() {
        pressed = false;
    });

    document.body.addEventListener('mouseenter', function(e) {
        if (pressed && (e.buttons & 2) !== 2) {
            pressed = false;
        }
    });

    document.body.addEventListener('wheel', function(e) {
        viewPoint.x += e.pageX / viewPoint.scale;
        viewPoint.y += e.pageY / viewPoint.scale;

        if (e.deltaY > 0) {
            viewPoint.scale = Math.max(1, viewPoint.scale - 1);
        } else if (e.deltaY < 0) {
            viewPoint.scale = Math.min(12, viewPoint.scale + 1);
        }

        viewPoint.x -= e.pageX / viewPoint.scale;
        viewPoint.y -= e.pageY / viewPoint.scale;

        alignViewPointXY();
        setState({ viewPoint });
        renderer.renderCanvas();
    });
};
