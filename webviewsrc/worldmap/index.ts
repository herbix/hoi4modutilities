import { Loader } from './loader';
import { ViewPoint } from './viewpoint';
import { TopBar, topBarHeight } from './topbar';
import { getState, setState } from '../util/common';
import { Renderer } from './renderer';
import { fromEvent } from 'rxjs';
import { ViewModeControllers } from './viewmode';

fromEvent(window, 'load').subscribe(function() {
    hideBySupplyAreaFlag((window as any)['__enableSupplyArea']);

    const state = getState();
    const loader = new Loader();
    const mainCanvas = document.getElementById('main-canvas') as HTMLCanvasElement;
    const viewPoint = new ViewPoint(mainCanvas, loader, topBarHeight, state.viewPoint || { x: 0, y: -topBarHeight, scale: 1 });
    const viewModeControllers = new ViewModeControllers(state, loader);
    const topBar = new TopBar(mainCanvas, viewPoint, loader, state, viewModeControllers);
    const renderer = new Renderer(mainCanvas, viewPoint, loader, topBar, viewModeControllers);

    fromEvent(mainCanvas, 'contextmenu').subscribe(event => event.preventDefault());

    viewPoint.observable$.subscribe(setStateForKey('viewPoint'));
    topBar.viewMode$.subscribe(setStateForKey('viewMode'));
    topBar.colorSet$.subscribe(setStateForKey('colorSet'));
    viewModeControllers.province.selected$.subscribe(setStateForKey('selectedProvinceId'));
    viewModeControllers.state.selected$.subscribe(setStateForKey('selectedStateId'));
    viewModeControllers.strategicregion.selected$.subscribe(setStateForKey('selectedStrategicRegionId'));
    viewModeControllers.supplyarea.selected$.subscribe(setStateForKey('selectedSupplyAreaId'));
    topBar.warningFilter.selectedValues$.subscribe(setStateForKey('warningFilter'));
    topBar.display.selectedValues$.subscribe(setStateForKey('display'));
    topBar.linkStateStrategicRegion.subscribe(setStateForKey('linkStateStrategicRegion'));
    // Don't set selectedConditions here because it's not initialized yet. It will be set in topBar.setupConditions() after the world map is loaded.
    // topBar.conditions.selectedValues$.subscribe(setStateForKey('selectedConditions'));
});

function setStateForKey<T>(key: string): (newValue: T) => void {
    return newValue => {
        setState({ [key]: newValue });
    };
}

function hideBySupplyAreaFlag(enableSupplyArea: boolean) {
    const viewModes = document.getElementById('viewmode')!.getElementsByTagName('option');
    for (let i = 0; i < viewModes.length; i++) {
        const viewMode = viewModes[i];
        const attribute = viewMode.getAttribute('enablesupplyarea');
        if (attribute && attribute !== enableSupplyArea.toString()) {
            viewMode.remove();
        }
    }

    const colorSets = document.getElementById('colorset')!.getElementsByTagName('option');
    for (let i = 0; i < colorSets.length; i++) {
        const colorSet = colorSets[i];
        const attribute = colorSet.getAttribute('enablesupplyarea');
        if (attribute && attribute !== enableSupplyArea.toString()) {
            colorSet.remove();
        }
    }

    const displayOptions = document.getElementById('display')!.getElementsByTagName('div');
    for (let i = 0; i < displayOptions.length; i++) {
        const displayOption = displayOptions[i];
        const attribute = displayOption.getAttribute('enablesupplyarea');
        if (attribute && attribute !== enableSupplyArea.toString()) {
            displayOption.remove();
        }
    }

    const warningFilterOptions = document.getElementById('warningfilter')!.getElementsByTagName('div');
    for (let i = 0; i < warningFilterOptions.length; i++) {
        const warningFilterOption = warningFilterOptions[i];
        const attribute = warningFilterOption.getAttribute('enablesupplyarea');
        if (attribute && attribute !== enableSupplyArea.toString()) {
            warningFilterOption.remove();
        }
    }
}
