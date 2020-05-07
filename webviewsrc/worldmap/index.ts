import * as renderer from './renderer';
import * as loader from './loader';
import * as topBar from './topBar';
import * as dragger from "./dragger";

window.addEventListener('load', function() {
    renderer.init(loader, topBar);
    loader.load(renderer);
    dragger.enableDragger(renderer.mainCanvas, renderer.viewPoint, loader, renderer, topBar);
    topBar.init(renderer);
});
