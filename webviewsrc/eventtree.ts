import { tryRun, enableZoom, subscribeNavigators } from "./util/common";
import { virtualizeGridBox } from "./util/virtualization";

window.addEventListener('load', tryRun(async function() {
    // Zoom
    const contentElement = document.getElementById('eventtreecontent') as HTMLDivElement;
    enableZoom(contentElement, 0, 0);

    virtualizeGridBox((window as any).virtualizationData, showEventElement);
}));

function showEventElement(element: HTMLDivElement): void {
    const hosts = element.getElementsByClassName('event-picture-host') as HTMLCollectionOf<HTMLDivElement>;
    for (let i = 0; i < hosts.length; i++) {
        const host = hosts.item(i);
        if (host) {
            showPictureWhenHoverElement(host);
        }
    }

    subscribeNavigators(element);
}

function showPictureWhenHoverElement(eventNode: HTMLDivElement) {
    const pictureKey = eventNode.attributes.getNamedItem('picture-style-key')?.value;
    const pictureWidthStr = eventNode.attributes.getNamedItem('picture-width')?.value;
    if (!pictureKey || !pictureWidthStr) {
        return;
    }

    const pictureWidth = parseInt(pictureWidthStr);

    let hoverElement: HTMLDivElement | undefined = undefined;

    eventNode.addEventListener('mouseenter', () => {
        const position = eventNode.getBoundingClientRect();
        hoverElement = document.createElement('div');
        hoverElement.className = pictureKey;
        hoverElement.style.position = 'absolute';
        hoverElement.style.left = (position.left + window.scrollX - (pictureWidth - position.width) / 2) + 'px';
        hoverElement.style.top = (position.top + position.height + window.scrollY) + 'px';
        document.body.append(hoverElement);
    });

    eventNode.addEventListener('mouseleave', () => {
        hoverElement?.remove();
    });
}

