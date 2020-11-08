import { Loader } from './loader';
import { ViewPoint } from './viewpoint';
import { topBarHeight, TopBar } from './topbar';
import { getState, setState } from '../util/common';
import { Renderer } from './renderer';
import { fromEvent } from 'rxjs';

fromEvent(window, 'load').subscribe(function() {
    const state = getState();
    const loader = new Loader();
    const mainCanvas = document.getElementById('main-canvas') as HTMLCanvasElement;
    const viewPoint = new ViewPoint(mainCanvas, loader, topBarHeight, state.viewPoint || { x: 0, y: -topBarHeight, scale: 1 });
    const topBar = new TopBar(mainCanvas, viewPoint, loader, state);
    const renderer = new Renderer(mainCanvas, viewPoint, loader, topBar);

    viewPoint.observable$.subscribe(setStateForKey('viewPoint'));
    topBar.viewMode$.subscribe(setStateForKey('viewMode'));
    topBar.colorSet$.subscribe(setStateForKey('colorSet'));
    topBar.selectedProvinceId$.subscribe(setStateForKey('selectedProvinceId'));
    topBar.selectedStateId$.subscribe(setStateForKey('selectedStateId'));
    topBar.selectedStrategicRegionId$.subscribe(setStateForKey('selectedStrategicRegionId'));
    topBar.selectedSupplyAreaId$.subscribe(setStateForKey('selectedSupplyAreaId'));
    topBar.warningFilter.selectedValues$.subscribe(setStateForKey('warningFilter'));
    topBar.display.selectedValues$.subscribe(setStateForKey('display'));
});

function setStateForKey<T>(key: string): (newValue: T) => void {
    return newValue => {
        setState({ [key]: newValue });
    };
}
