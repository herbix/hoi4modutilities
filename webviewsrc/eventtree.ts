import { GridBoxVirtualizationData } from '../src/util/hoi4gui/gridboxcommon';
import { enableZoom, getState, setState, subscribeNavigators, subscribeRefreshButton, tryRun } from './util/common';
import { virtualizeGridBox } from './util/virtualization';

interface EventSearchMatch {
    htmlId: string;
    x: number;
    y: number;
    width: number;
    height: number;
}

const eventIdPattern = /^(?:event|option):[^:]+:\d+$/;

let searchMatches: EventSearchMatch[] = [];
let searchMatchIndex = 0;
let searchText = '';
let refreshVirtualization = () => {};
const virtualizationData = (window as any).virtualizationData as GridBoxVirtualizationData;
const searchTextByItemId = (window as any).eventSearchText as Record<string, string>;
const eventDetailsByItemId = (window as any).eventDetails as Record<string, string>;

function showEventElement(
    element: HTMLDivElement,
    eventDetailsPanel: HTMLDivElement,
    eventDetailsContent: HTMLPreElement,
): void {
    const hosts = element.getElementsByClassName('event-picture-host') as HTMLCollectionOf<HTMLDivElement>;
    for (let i = 0; i < hosts.length; i++) {
        const host = hosts.item(i);
        if (host) {
            showPictureWhenHoverElement(host);
        }
    }

    const detailsButton = element.querySelector<HTMLButtonElement>('.event-details-button');
    if (detailsButton) {
        detailsButton.addEventListener('click', event => {
            event.preventDefault();
            event.stopPropagation();
            const details = eventDetailsByItemId[element.id];
            eventDetailsContent.textContent = details;
            eventDetailsPanel.hidden = false;
        });
    }

    subscribeNavigators(element);
    updateRenderedSearchHighlights();
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

function setupSearchbox(): void {
    const searchbox = document.getElementById('searchbox') as HTMLInputElement | null;
    if (!searchbox) {
        return;
    }

    const storedSearchText = ((getState().eventtreeSearchboxValue as string | undefined) ?? '').toLowerCase();
    searchText = storedSearchText;
    searchbox.value = storedSearchText;

    const onSearchChanged = function(this: HTMLInputElement) {
        const nextText = this.value.toLowerCase();
        if (nextText === searchText) {
            return;
        }

        searchText = nextText;
        setState({ eventtreeSearchboxValue: searchText });
        refreshSearchResults();
        navigateToCurrentMatch();
    };

    searchbox.addEventListener('change', onSearchChanged);
    searchbox.addEventListener('keyup', onSearchChanged);
    searchbox.addEventListener('paste', onSearchChanged);
    searchbox.addEventListener('cut', onSearchChanged);
    searchbox.addEventListener('keypress', function(e) {
        if (e.key !== 'Enter') {
            return;
        }

        if (searchMatches.length === 0) {
            return;
        }

        searchMatchIndex = (searchMatchIndex + (e.shiftKey ? searchMatches.length - 1 : 1)) % searchMatches.length;
        navigateToCurrentMatch();
    });
}

function refreshSearchResults(): void {
    if (!searchText) {
        searchMatches = [];
        searchMatchIndex = 0;
        updateRenderedSearchHighlights();
        return;
    }

    searchMatches = virtualizationData.items
        .map(item => {
            if (!eventIdPattern.test(item.id)) {
                return undefined;
            }

            if (!searchTextByItemId[item.id].includes(searchText)) {
                return undefined;
            }

            return {
                htmlId: item.htmlId,
                x: Number(item.x),
                y: Number(item.y),
                width: Number(item.width),
                height: Number(item.height),
            } as EventSearchMatch;
        })
        .filter((v): v is EventSearchMatch => v !== undefined)
        .sort((a, b) => a.y === b.y ? a.x - b.x : a.y - b.y);

    searchMatchIndex = 0;
    updateRenderedSearchHighlights();
}

function navigateToCurrentMatch(): void {
    if (searchMatches.length === 0) {
        return;
    }

    const current = searchMatches[searchMatchIndex];
    const scale = getState().scale ?? 1;
    const gridBoxX = virtualizationData.gridBoxX ?? 0;
    const gridBoxY = virtualizationData.gridBoxY ?? 0;

    const centerX = gridBoxX + current.x + current.width / 2;
    const centerY = gridBoxY + current.y + current.height / 2;
    const targetScrollX = centerX * scale - window.innerWidth / 2;
    const targetScrollY = centerY * scale - window.innerHeight / 2;

    window.scrollTo(targetScrollX, targetScrollY);
    updateRenderedSearchHighlights();
}

function updateRenderedSearchHighlights(): void {
    const gridBox = document.getElementsByClassName(virtualizationData.className)[0];
    if (!gridBox) {
        return;
    }

    for (let i = 0; i < gridBox.children.length; i++) {
        const element = gridBox.children[i] as HTMLElement;
        element.style.outlineWidth = '0';
        element.style.background = '';
    }

    for (const match of searchMatches) {
        const itemElement = document.getElementById(match.htmlId);
        if (!itemElement) {
            continue;
        }

        itemElement.style.outline = '1px solid #E33';
        itemElement.style.background = 'rgba(255, 0, 0, 0.5)';
    }
}

window.addEventListener('load', tryRun(async function() {
    const contentElement = document.getElementById('eventtreecontent') as HTMLDivElement;
    const eventDetailsPanel = document.getElementById('event-details') as HTMLDivElement;
    const eventDetailsContent = document.getElementById('event-details-content') as HTMLPreElement;
    const eventDetailsClose = document.getElementById('event-details-close') as HTMLButtonElement;
    eventDetailsClose.addEventListener('click', () => eventDetailsPanel.hidden = true);
    refreshVirtualization = virtualizeGridBox(
        virtualizationData,
        element => showEventElement(element, eventDetailsPanel, eventDetailsContent),
    ).refresh;

    // Search
    setupSearchbox();
    refreshSearchResults();

    // Zoom
    enableZoom(contentElement, 0, 40, refreshVirtualization);
    subscribeRefreshButton();
}));
