import { Observable, asEvent, Subscriber } from "../util/event";
import { Loader, FEWorldMap } from "./loader";
import { ViewPoint } from "./viewpoint";
import { vscode } from "../util/common";
import { WorldMapMessage, Warning } from "../../src/previewdef/worldmap/definitions";
import { feLocalize } from "../util/i18n";
import { DivDropdown } from "../util/dropdown";

export type ViewMode = 'province' | 'state' | 'strategicregion' | 'supplyarea' | 'warnings';
export type ColorSet = 'provinceid' | 'provincetype' | 'terrain' | 'country' | 'stateid' | 'manpower' |
    'victorypoint' | 'continent' | 'warnings' | 'strategicregionid' | 'supplyareaid' | 'supplyvalue';

export const topBarHeight = 40;

export class TopBar extends Subscriber {
    public viewMode: Observable<ViewMode>;
    public colorSet: Observable<ColorSet>;
    public hoverProvinceId: Observable<number | undefined>;
    public selectedProvinceId: Observable<number | undefined>;
    public hoverStateId: Observable<number | undefined>;
    public selectedStateId: Observable<number | undefined>;
    public hoverStrategicRegionId: Observable<number | undefined>;
    public selectedStrategicRegionId: Observable<number | undefined>;
    public hoverSupplyAreaId: Observable<number | undefined>;
    public selectedSupplyAreaId: Observable<number | undefined>;
    public warningFilter: DivDropdown;

    public warningsVisible: boolean = false;

    private viewModeElement: HTMLSelectElement;
    private colorSetElement: HTMLSelectElement;
    private searchBox: HTMLInputElement;

    constructor(canvas: HTMLCanvasElement, private viewPoint: ViewPoint, private loader: Loader, state: any) {
        super();

        this.subscriptions.push(this.warningFilter = new DivDropdown(document.getElementById('warningfilter') as HTMLDivElement, true));

        this.viewMode = new Observable<ViewMode>(state.viewMode ?? 'province');
        this.colorSet = new Observable<ColorSet>(state.colorSet ?? 'provinceid');
        this.hoverProvinceId = new Observable<number | undefined>(undefined);
        this.selectedProvinceId = new Observable<number | undefined>(state.selectedProvinceId ?? undefined);
        this.hoverStateId = new Observable<number | undefined>(undefined);
        this.selectedStateId = new Observable<number | undefined>(state.selectedStateId ?? undefined);
        this.hoverStrategicRegionId = new Observable<number | undefined>(undefined);
        this.selectedStrategicRegionId = new Observable<number | undefined>(state.selectedStrategicRegionId ?? undefined);
        this.hoverSupplyAreaId = new Observable<number | undefined>(undefined);
        this.selectedSupplyAreaId = new Observable<number | undefined>(state.selectedSupplyAreaId ?? undefined);
        if (state.warningFilter) {
            this.warningFilter.setValue(state.warningFilter);
        } else {
            this.warningFilter.setAllValue();
        }

        this.viewModeElement = document.getElementById('viewmode') as HTMLSelectElement;
        this.colorSetElement = document.getElementById('colorset') as HTMLSelectElement;
        this.searchBox = document.getElementById("searchbox") as HTMLInputElement;

        this.loadControls();
        this.registerEventListeners(canvas);
    }

    private onViewModeChange() {
        document.querySelectorAll('#colorset > option[viewmode]').forEach(v => {
            (v as HTMLOptionElement).hidden = true;
        });
    
        let colorSetHidden = true;
        document.querySelectorAll('#colorset > option[viewmode~="' + this.viewMode.value + '"]').forEach(v => {
            (v as HTMLOptionElement).hidden = false;
            if ((v as HTMLOptionElement).value === this.colorSet.value) {
                colorSetHidden = false;
            }
        });
        
        document.querySelectorAll('#colorset > option:not([viewmode])').forEach(v => {
            if ((v as HTMLOptionElement).value === this.colorSet.value) {
                colorSetHidden = false;
            }
        });

        document.querySelectorAll('button[viewmode]').forEach(v => {
            (v as HTMLButtonElement).style.display = 'none';
        });

        document.querySelectorAll('button[viewmode~="' + this.viewMode.value + '"]').forEach(v => {
            (v as HTMLButtonElement).style.display = 'inline-block';
        });

        document.querySelectorAll('.group[viewmode]').forEach(v => {
            (v as HTMLDivElement).style.display = 'none';
        });

        document.querySelectorAll('.group[viewmode~="' + this.viewMode.value + '"]').forEach(v => {
            (v as HTMLDivElement).style.display = 'inline-block';
        });
    
        if (colorSetHidden) {
            const newColorset = (document.querySelector('#colorset > option:not(*[hidden])') as HTMLOptionElement)?.value;
            this.colorSetElement.value = newColorset;
            this.colorSet.set(newColorset as any);
        }

        this.setSearchBoxPlaceHolder();
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

        const searchBox = this.searchBox;
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
            if (this.viewMode.value === 'state') {
                if (this.selectedStateId.value) {
                    const state = this.loader.worldMap.getStateById(this.selectedStateId.value);
                    if (state) {
                        vscode.postMessage<WorldMapMessage>({ command: 'openfile', type: 'state', file: state.file, start: state.token?.start, end: state.token?.end });
                    }
                }
            } else if (this.viewMode.value === 'strategicregion') {
                if (this.selectedStrategicRegionId.value) {
                    const strategicRegion = this.loader.worldMap.getStrategicRegionById(this.selectedStrategicRegionId.value);
                    if (strategicRegion) {
                        vscode.postMessage<WorldMapMessage>({ command: 'openfile', type: 'strategicregion', file: strategicRegion.file,
                            start: strategicRegion.token?.start, end: strategicRegion.token?.end });
                    }
                }
            } else if (this.viewMode.value === 'supplyarea') {
                if (this.selectedSupplyAreaId.value) {
                    const supplyArea = this.loader.worldMap.getSupplyAreaById(this.selectedSupplyAreaId.value);
                    if (supplyArea) {
                        vscode.postMessage<WorldMapMessage>({ command: 'openfile', type: 'supplyarea', file: supplyArea.file,
                            start: supplyArea.token?.start, end: supplyArea.token?.end });
                    }
                }
            }
        }));
        const setOpenDisabled = () => {
            open.disabled = !((this.viewMode.value === 'state' && this.selectedStateId.value !== undefined) ||
                (this.viewMode.value === 'strategicregion' && this.selectedStrategicRegionId.value !== undefined) ||
                (this.viewMode.value === 'supplyarea' && this.selectedSupplyAreaId.value !== undefined));
        };
        setOpenDisabled();
        this.subscriptions.push(this.selectedStateId.onChange(setOpenDisabled));
        this.subscriptions.push(this.selectedStrategicRegionId.onChange(setOpenDisabled));
        this.subscriptions.push(this.selectedSupplyAreaId.onChange(setOpenDisabled));
        this.subscriptions.push(this.viewMode.onChange(setOpenDisabled));
    }
    
    private registerEventListeners(canvas: HTMLCanvasElement) {
        this.subscriptions.push(asEvent(canvas, 'mousemove')((e) => {
            if (!this.loader.worldMap) {
                this.hoverProvinceId.set(undefined);
                this.hoverStateId.set(undefined);
                this.hoverStrategicRegionId.set(undefined);
                this.hoverSupplyAreaId.set(undefined);
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
            this.hoverStrategicRegionId.set(this.hoverProvinceId.value === undefined ? undefined : worldMap.getStrategicRegionByProvinceId(this.hoverProvinceId.value)?.id);
            this.hoverSupplyAreaId.set(this.hoverStateId.value === undefined ? undefined : worldMap.getSupplyAreaByStateId(this.hoverStateId.value)?.id);
        }));
    
        this.subscriptions.push(asEvent(canvas, 'mouseleave')(() => {
            this.hoverProvinceId.set(undefined);
            this.hoverStateId.set(undefined);
            this.hoverStrategicRegionId.set(undefined);
            this.hoverSupplyAreaId.set(undefined);
        }));
    
        this.subscriptions.push(asEvent(canvas, 'click')(() => {
            switch (this.viewMode.value) {
                case 'province':
                    this.selectedProvinceId.set(this.selectedProvinceId.value === this.hoverProvinceId.value ? undefined : this.hoverProvinceId.value);
                    break;
                case 'state':
                    this.selectedStateId.set(this.selectedStateId.value === this.hoverStateId.value ? undefined : this.hoverStateId.value);
                    break;
                case 'strategicregion':
                    this.selectedStrategicRegionId.set(this.selectedStrategicRegionId.value === this.hoverStrategicRegionId.value ? undefined : this.hoverStrategicRegionId.value);
                    break;
                case 'supplyarea':
                    this.selectedSupplyAreaId.set(this.selectedSupplyAreaId.value === this.hoverSupplyAreaId.value ? undefined : this.hoverSupplyAreaId.value);
                    break;
            }
        }));

        this.subscriptions.push(this.viewMode.onChange(() => this.onViewModeChange()));

        this.subscriptions.push(this.loader.onMapChanged(wm => {
            const warnings = document.getElementById('warnings') as HTMLTextAreaElement;
            if (wm.warnings.length === 0) {
                warnings.value = feLocalize('worldmap.warnings.nowarnings', 'No warnings.');
            } else {
                warnings.value = feLocalize('worldmap.warnings', 'World map warnings: \n\n{0}', wm.warnings.map(warningToString).join('\n'));
            }

            this.setSearchBoxPlaceHolder(wm);
        }));
    }

    private search(text: string) {
        const number = parseInt(text);
        if (isNaN(number)) {
            return;
        }

        const [getRegionById, selectedId] =
            this.viewMode.value === 'province' ? [this.loader.worldMap.getProvinceById, this.selectedProvinceId] :
            this.viewMode.value === 'state' ? [this.loader.worldMap.getStateById, this.selectedStateId] :
            this.viewMode.value === 'strategicregion' ? [this.loader.worldMap.getStrategicRegionById, this.selectedStrategicRegionId] :
            this.viewMode.value === 'supplyarea' ? [this.loader.worldMap.getSupplyAreaById, this.selectedSupplyAreaId] :
            [() => undefined, undefined];
            
        const region = getRegionById(number);
        if (region) {
            selectedId?.set(number);
            this.viewPoint.centerZone(region.boundingBox);
        }
    }

    private setSearchBoxPlaceHolder(worldMap?: FEWorldMap) {
        if (!worldMap) {
            worldMap = this.loader.worldMap;
        }

        let placeholder = '';
        switch (this.viewMode.value) {
            case 'province':
                placeholder = worldMap.provincesCount > 1 ? `1-${worldMap.provincesCount - 1}` : '';
                break;
            case 'state':
                placeholder = worldMap.statesCount > 1 ? `1-${worldMap.statesCount - 1}` : '';
                break;
            case 'strategicregion':
                placeholder = worldMap.strategicRegionsCount > 1 ? `1-${worldMap.strategicRegionsCount - 1}` : '';
                break;
            case 'supplyarea':
                placeholder = worldMap.supplyAreasCount > 1 ? `1-${worldMap.supplyAreasCount - 1}` : '';
                break;
            default:
                break;
        }

        if (placeholder) {
            this.searchBox.placeholder = feLocalize('worldmap.topbar.search.placeholder', 'Range: {0}', placeholder);
        } else {
            this.searchBox.placeholder = '';
        }
    }
}

function warningToString(warning: Warning): string {
    return `[${warning.source.map(s => `${s.type[0].toUpperCase()}${s.type.substr(1)} ${'id' in s ? s.id : s.name}`).join(', ')}] ${warning.text}`;
}
