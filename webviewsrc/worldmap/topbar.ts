import { Observable, asEvent, Subscriber } from "../util/event";
import { Loader } from "./loader";
import { ViewPoint } from "./viewpoint";
import { vscode } from "../util/common";
import { WorldMapMessage } from "../../src/previewdef/worldmap/definitions";

export type ViewMode = 'province' | 'state';
export type ColorSet = 'provinceid' | 'provincetype' | 'terrain' | 'country' | 'stateid' | 'manpower' | 'warnings';

export const topBarHeight = 40;

export class TopBar extends Subscriber {
    public viewMode: Observable<ViewMode>;
    public colorSet: Observable<ColorSet>;
    public hoverProvinceId: Observable<number | undefined>;
    public selectedProvinceId: Observable<number | undefined>;
    public hoverStateId: Observable<number | undefined>;
    public selectedStateId: Observable<number | undefined>;

    public warningsVisible: boolean = false;

    private viewModeElement: HTMLSelectElement;
    private colorSetElement: HTMLSelectElement;

    constructor(canvas: HTMLCanvasElement, private viewPoint: ViewPoint, private loader: Loader, state: any) {
        super();

        this.viewMode = new Observable<ViewMode>(state.viewMode ?? 'province');
        this.colorSet = new Observable<ColorSet>(state.colorSet ?? 'provinceid');
        this.hoverProvinceId = new Observable<number | undefined>(undefined);
        this.selectedProvinceId = new Observable<number | undefined>(state.selectedProvinceId ?? undefined);
        this.hoverStateId = new Observable<number | undefined>(undefined);
        this.selectedStateId = new Observable<number | undefined>(state.selectedStateId ?? undefined);

        this.viewModeElement = document.getElementById('viewmode') as HTMLSelectElement;
        this.colorSetElement = document.getElementById('colorset') as HTMLSelectElement;
        this.loadControls();
        this.registerEventListeners(canvas);
    }

    private onViewModeChange() {
        document.querySelectorAll('#colorset > option').forEach(v => {
            (v as HTMLOptionElement).hidden = true;
        });
    
        let colorSetHidden = true;
        document.querySelectorAll('#colorset > option[viewmode~="' + this.viewMode.value + '"]').forEach(v => {
            (v as HTMLOptionElement).hidden = false;
            if ((v as HTMLOptionElement).value === this.colorSet.value) {
                colorSetHidden = false;
            }
        });

        document.querySelectorAll('button').forEach(v => {
            (v as HTMLButtonElement).style.display = 'none';
        });

        document.querySelectorAll('button[viewmode~="' + this.viewMode.value + '"]').forEach(v => {
            (v as HTMLButtonElement).style.display = 'inline-block';
        });
    
        if (colorSetHidden) {
            const newColorset = (document.querySelector('#colorset > option:not(*[hidden])') as HTMLOptionElement)?.value;
            this.colorSetElement.value = newColorset;
            this.colorSet.set(newColorset as any);
        }
    }
    
    private loadControls() {
        const topBar = this;

        this.subscriptions.push(asEvent(this.viewModeElement, 'change')(function() {
            topBar.viewMode.set(this.value as any);
        }));
    
        this.subscriptions.push(asEvent(this.colorSetElement, 'change')(function() {
            topBar.colorSet.set(this.value as any);
        }));
    
        this.viewModeElement.value = this.viewMode.value;
        this.onViewModeChange();
    
        this.colorSetElement.value = this.colorSet.value;

        const warningsContainer = document.getElementById('warnings-container')!;
        const showWarnings = document.getElementById('show-warnings')!;
        this.subscriptions.push(asEvent(showWarnings, 'click')(() => {
            this.warningsVisible = !this.warningsVisible;
            if (this.warningsVisible) {
                warningsContainer.style.display = 'block';
            } else {
                warningsContainer.style.display = 'none';
            }
        }));

        const searchBox = document.getElementById("searchbox") as HTMLInputElement;
        const search = document.getElementById("search")!;
        this.subscriptions.push(asEvent(searchBox, 'keypress')(function(e) {
            if (e.code === 'Enter') {
                topBar.search(this.value);
            }
        }));
        this.subscriptions.push(asEvent(search, 'click')(() => {
            topBar.search(searchBox.value);
        }));
        
        const refresh = document.getElementById("refresh") as HTMLButtonElement;
        this.subscriptions.push(asEvent(refresh, 'click')(() => {
            if (!refresh.disabled) {
                this.loader.refresh();
            }
        }));
        refresh.disabled = this.loader.loading.value;
        this.subscriptions.push(this.loader.loading.onChange(v => {
            refresh.disabled = v;
        }));

        const open = document.getElementById("open") as HTMLButtonElement;
        this.subscriptions.push(asEvent(open, 'click')((e) => {
            e.stopPropagation();
            if (this.selectedStateId.value) {
                const state = this.loader.worldMap.getStateById(this.selectedStateId.value);
                if (state) {
                    vscode.postMessage<WorldMapMessage>({ command: 'openstate', file: state.file, start: state.token?.start, end: state.token?.end });
                }
            }
        }));
        open.disabled = this.selectedStateId.value === undefined;
        this.subscriptions.push(this.selectedStateId.onChange(v => {
            open.disabled = this.selectedStateId.value === undefined;
        }));
    }
    
    private registerEventListeners(canvas: HTMLCanvasElement) {
        this.subscriptions.push(asEvent(canvas, 'mousemove')((e) => {
            if (!this.loader.worldMap) {
                this.hoverProvinceId.set(undefined);
                return;
            }
    
            const worldMap = this.loader.worldMap;
            let x = this.viewPoint.convertBackX(e.pageX);
            let y = this.viewPoint.convertBackY(e.pageY);
            if (x < 0) {
                x += worldMap.width;
            }
            while (x >= worldMap.width && worldMap.width > 0) {
                x -= worldMap.width;
            }

            this.hoverProvinceId.set(worldMap.getProvinceByPosition(x, y)?.id);
            this.hoverStateId.set(this.hoverProvinceId.value === undefined ? undefined : worldMap.getStateByProvinceId(this.hoverProvinceId.value)?.id);
        }));
    
        this.subscriptions.push(asEvent(canvas, 'mouseleave')(() => {
            this.hoverProvinceId.set(undefined);
            this.hoverStateId.set(undefined);
        }));
    
        this.subscriptions.push(asEvent(canvas, 'click')(() => {
            this.selectedProvinceId.set(this.selectedProvinceId.value === this.hoverProvinceId.value ? undefined : this.hoverProvinceId.value);
            this.selectedStateId.set(this.selectedStateId.value === this.hoverStateId.value ? undefined : this.hoverStateId.value);
        }));

        this.subscriptions.push(this.viewMode.onChange(() => this.onViewModeChange()));

        this.subscriptions.push(this.loader.onMapChanged(wm => {
            const warnings = document.getElementById('warnings') as HTMLTextAreaElement;
            if (wm.warnings.length === 0) {
                warnings.value = 'No warnings.';
            } else {
                warnings.value = 'World map warnings: \n\n' + wm.warnings.map(v => v.text).join('\n');
            }
        }));
    }

    private search(text: string) {
        const number = parseInt(text);
        if (isNaN(number)) {
            return;
        }

        if (this.viewMode.value === 'province') {
            const province = this.loader.worldMap.getProvinceById(number);
            if (province) {
                this.selectedProvinceId.set(number);
                this.viewPoint.centerZone(province.boundingBox);
            }
        } else if (this.viewMode.value === 'state') {
            const state = this.loader.worldMap.getStateById(number);
            if (state) {
                this.selectedStateId.set(number);
                this.viewPoint.centerZone(state.boundingBox);
            }
        }
    }
}
