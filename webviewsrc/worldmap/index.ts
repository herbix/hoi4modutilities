import { Loader } from './loader';
import { ViewPoint } from './viewpoint';
import { topBarHeight, TopBar } from './topbar';
import { getState, setState } from '../util/common';
import { Renderer } from './renderer';
import { asEvent } from '../util/event';

asEvent(window, 'load')(function() {
    const state = getState();
    const loader = new Loader();
    const mainCanvas = document.getElementById('main-canvas') as HTMLCanvasElement;
    const viewPoint = new ViewPoint(mainCanvas, loader, topBarHeight, state.viewPoint || { x: 0, y: -topBarHeight, scale: 1 });
    const topBar = new TopBar(mainCanvas, viewPoint, loader, state);
    const renderer = new Renderer(mainCanvas, viewPoint, loader, topBar);

    viewPoint.onChanged(() => {
        setState({ viewPoint: viewPoint.toJson() });
    });

    topBar.viewMode.onChange(setStateForKey('viewMode'));
    topBar.colorSet.onChange(setStateForKey('colorSet'));
    topBar.selectedProvinceId.onChange(setStateForKey('selectedProvinceId'));
    topBar.selectedStateId.onChange(setStateForKey('selectedStateId'));
});

function setStateForKey<T>(key: string): (newValue: T) => void {
    return newValue => {
        setState({ [key]: newValue });
    };
}
