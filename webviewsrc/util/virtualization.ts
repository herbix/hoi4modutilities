import { GridBoxVirtualizationData, GridBoxVirtualizedItem, GridBoxVirtualizedConnection } from "../../src/util/hoi4gui/gridboxcommon";
import { getState } from "./common";

type Item = GridBoxVirtualizedItem & { element?: HTMLDivElement; };
type Connection = GridBoxVirtualizedConnection & { element?: HTMLDivElement; };

export function virtualizeGridBox(data: GridBoxVirtualizationData, onElementShow?: (element: HTMLDivElement) => void)
: {
    refresh: () => void;
} {
    const gridBox = document.getElementsByClassName(data.className)[0] as HTMLDivElement;
    const unusedElements: HTMLDivElement[] = [];

    const items: Item[] = data.items;
    const connections: Connection[] = data.connections;

    const updateItem = (item: Item | Connection, isVisible: boolean) => {
        if (!isVisible && item.element) {
            unusedElements.push(item.element);
            item.element.style.display = 'none';
            item.element.id = '';
            item.element.className = '';
            item.element.innerHTML = '';
            item.element = undefined;
        }

        if (isVisible && !item.element) {
            let element = unusedElements.pop();
            if (!element) {
                element = document.createElement('div');
                element.style.display = 'none';
                gridBox.appendChild(element);
            }
            element.id = 'id' in item && item.id ? item.id : '';
            element.className = item.classNames;
            element.innerHTML = 'innerHTML' in item ? item.innerHTML : '';
            element.style.display = 'block';
            item.element = element;
            if (onElementShow) {
                onElementShow(element);
            }
        }
    };

    const viewportChanged = () => {
        const scale = getState().scale ?? 1;
        const viewportX = window.scrollX / scale - data.gridBoxX;
        const viewportY = window.scrollY / scale - data.gridBoxY;
        const viewportWidth = window.innerWidth / scale;
        const viewportHeight = window.innerHeight / scale;
        
        for (const item of items) {
            const isVisible = item.x + item.width >= viewportX &&
                              item.x <= viewportX + viewportWidth &&
                              item.y + item.height >= viewportY &&
                              item.y <= viewportY + viewportHeight;
            updateItem(item, isVisible);
        }

        for (const conn of connections) {
            const isVisible = ((conn.x + conn.width >= viewportX && conn.x <= viewportX + viewportWidth) && 
                (conn.hLine === 'top' && conn.y >= viewportY && conn.y <= viewportY + viewportHeight) ||
                (conn.hLine === 'bottom' && conn.y + conn.height >= viewportY && conn.y + conn.height <= viewportY + viewportHeight)) ||
                ((conn.y + conn.height >= viewportY && conn.y <= viewportY + viewportHeight) &&
                (conn.vLine === 'left' && conn.x >= viewportX && conn.x <= viewportX + viewportWidth) ||
                (conn.vLine === 'right' && conn.x + conn.width >= viewportX && conn.x + conn.width <= viewportX + viewportWidth));
            updateItem(conn, isVisible);
        }
    };

    viewportChanged();

    window.addEventListener('scroll', viewportChanged);
    window.addEventListener('resize', viewportChanged);
    return {
        refresh: viewportChanged
    };
}
