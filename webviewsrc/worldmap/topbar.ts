import { Subscriber, toBehaviorSubject } from "../util/event";
import { Loader, FEWorldMap } from "./loader";
import { ViewPoint } from "./viewpoint";
import { vscode } from "../util/vscode";
import { WorldMapMessage, WorldMapWarning } from "../../src/previewdef/worldmap/definitions";
import { feLocalize } from "../util/i18n";
import { DivDropdown } from "../util/dropdown";
import { BehaviorSubject, combineLatest, fromEvent } from 'rxjs';

export type ViewMode = 'province' | 'state' | 'strategicregion' | 'supplyarea' | 'warnings';
export type ColorSet = 'provinceid' | 'provincetype' | 'terrain' | 'country' | 'stateid' | 'manpower' |
    'victorypoint' | 'continent' | 'warnings' | 'strategicregionid' | 'supplyareaid' | 'supplyvalue';

export const topBarHeight = 40;

export class TopBar extends Subscriber {
    public viewMode$: BehaviorSubject<ViewMode>;
    public colorSet$: BehaviorSubject<ColorSet>;
    public hoverProvinceId$: BehaviorSubject<number | undefined>;
    public selectedProvinceId$: BehaviorSubject<number | undefined>;
    public hoverStateId$: BehaviorSubject<number | undefined>;
    public selectedStateId$: BehaviorSubject<number | undefined>;
    public hoverStrategicRegionId$: BehaviorSubject<number | undefined>;
    public selectedStrategicRegionId$: BehaviorSubject<number | undefined>;
    public hoverSupplyAreaId$: BehaviorSubject<number | undefined>;
    public selectedSupplyAreaId$: BehaviorSubject<number | undefined>;
    public warningFilter: DivDropdown;
    public display: DivDropdown;

    public warningsVisible: boolean = false;

    private searchBox: HTMLInputElement;

    constructor(canvas: HTMLCanvasElement, private viewPoint: ViewPoint, private loader: Loader, state: any) {
        super();

        this.addSubscription(this.warningFilter = new DivDropdown(document.getElementById('warningfilter') as HTMLDivElement, true));
        this.addSubscription(this.display = new DivDropdown(document.getElementById('display') as HTMLDivElement, true));

        this.viewMode$ = toBehaviorSubject(document.getElementById('viewmode') as HTMLSelectElement, state.viewMode ?? 'province');
        this.colorSet$ = toBehaviorSubject(document.getElementById('colorset') as HTMLSelectElement, state.colorSet ?? 'provinceid');
        this.hoverProvinceId$ = new BehaviorSubject<number | undefined>(undefined);
        this.selectedProvinceId$ = new BehaviorSubject<number | undefined>(state.selectedProvinceId ?? undefined);
        this.hoverStateId$ = new BehaviorSubject<number | undefined>(undefined);
        this.selectedStateId$ = new BehaviorSubject<number | undefined>(state.selectedStateId ?? undefined);
        this.hoverStrategicRegionId$ = new BehaviorSubject<number | undefined>(undefined);
        this.selectedStrategicRegionId$ = new BehaviorSubject<number | undefined>(state.selectedStrategicRegionId ?? undefined);
        this.hoverSupplyAreaId$ = new BehaviorSubject<number | undefined>(undefined);
        this.selectedSupplyAreaId$ = new BehaviorSubject<number | undefined>(state.selectedSupplyAreaId ?? undefined);
        if (state.warningFilter) {
            this.warningFilter.selectedValues$.next(state.warningFilter);
        } else {
            this.warningFilter.selectAll();
        }
        if (state.display) {
            this.display.selectedValues$.next(state.display);
        } else {
            this.display.selectAll();
        }

        this.searchBox = document.getElementById("searchbox") as HTMLInputElement;

        this.loadControls();
        this.registerEventListeners(canvas);
    }

    private onViewModeChange() {
        document.querySelectorAll('#colorset > option[viewmode]').forEach(v => {
            (v as HTMLOptionElement).hidden = true;
        });
    
        let colorSetHidden = true;
        document.querySelectorAll('#colorset > option[viewmode~="' + this.viewMode$.value + '"]').forEach(v => {
            (v as HTMLOptionElement).hidden = false;
            if ((v as HTMLOptionElement).value === this.colorSet$.value) {
                colorSetHidden = false;
            }
        });
        
        document.querySelectorAll('#colorset > option:not([viewmode])').forEach(v => {
            if ((v as HTMLOptionElement).value === this.colorSet$.value) {
                colorSetHidden = false;
            }
        });

        document.querySelectorAll('button[viewmode]').forEach(v => {
            (v as HTMLButtonElement).style.display = 'none';
        });

        document.querySelectorAll('button[viewmode~="' + this.viewMode$.value + '"]').forEach(v => {
            (v as HTMLButtonElement).style.display = 'inline-block';
        });

        document.querySelectorAll('.group[viewmode]').forEach(v => {
            (v as HTMLDivElement).style.display = 'none';
        });

        document.querySelectorAll('.group[viewmode~="' + this.viewMode$.value + '"]').forEach(v => {
            (v as HTMLDivElement).style.display = 'inline-block';
        });
    
        if (colorSetHidden) {
            const newColorset = (document.querySelector('#colorset > option:not(*[hidden])') as HTMLOptionElement)?.value;
            this.colorSet$.next(newColorset as any);
        }

        this.setSearchBoxPlaceHolder();
    }
    
    private loadControls() {
        const topBar = this;

        const warningsContainer = document.getElementById('warnings-container')!;
        const showWarnings = document.getElementById('show-warnings')!;
        this.addSubscription(fromEvent(showWarnings, 'click').subscribe(() => {
            this.warningsVisible = !this.warningsVisible;
            if (this.warningsVisible) {
                warningsContainer.style.display = 'block';
            } else {
                warningsContainer.style.display = 'none';
            }
        }));

        const searchBox = this.searchBox;
        const search = document.getElementById("search")!;
        this.addSubscription(fromEvent<KeyboardEvent>(searchBox, 'keypress').subscribe((e) => {
            if (e.code === 'Enter') {
                topBar.search(searchBox.value);
            }
        }));
        this.addSubscription(fromEvent(search, 'click').subscribe(() => {
            topBar.search(searchBox.value);
        }));
        
        const refresh = document.getElementById("refresh") as HTMLButtonElement;
        this.addSubscription(fromEvent(refresh, 'click').subscribe(() => {
            if (!refresh.disabled) {
                this.loader.refresh();
            }
        }));
        refresh.disabled = this.loader.loading$.value;
        this.addSubscription(this.loader.loading$.subscribe(v => {
            refresh.disabled = v;
        }));

        const open = document.getElementById("open") as HTMLButtonElement;
        this.addSubscription(fromEvent(open, 'click').subscribe((e) => {
            e.stopPropagation();
            if (this.viewMode$.value === 'state') {
                if (this.selectedStateId$.value) {
                    const state = this.loader.worldMap.getStateById(this.selectedStateId$.value);
                    if (state) {
                        vscode.postMessage<WorldMapMessage>({ command: 'openfile', type: 'state', file: state.file, start: state.token?.start, end: state.token?.end });
                    }
                }
            } else if (this.viewMode$.value === 'strategicregion') {
                if (this.selectedStrategicRegionId$.value) {
                    const strategicRegion = this.loader.worldMap.getStrategicRegionById(this.selectedStrategicRegionId$.value);
                    if (strategicRegion) {
                        vscode.postMessage<WorldMapMessage>({ command: 'openfile', type: 'strategicregion', file: strategicRegion.file,
                            start: strategicRegion.token?.start, end: strategicRegion.token?.end });
                    }
                }
            } else if (this.viewMode$.value === 'supplyarea') {
                if (this.selectedSupplyAreaId$.value) {
                    const supplyArea = this.loader.worldMap.getSupplyAreaById(this.selectedSupplyAreaId$.value);
                    if (supplyArea) {
                        vscode.postMessage<WorldMapMessage>({ command: 'openfile', type: 'supplyarea', file: supplyArea.file,
                            start: supplyArea.token?.start, end: supplyArea.token?.end });
                    }
                }
            }
        }));

        this.addSubscription(combineLatest([this.viewMode$, this.selectedStateId$, this.selectedStrategicRegionId$, this.selectedSupplyAreaId$]).subscribe(
            ([viewMode, selectedStateId, selectedStrategicRegionId, selectedSupplyAreaId]) => {
                open.disabled = !((viewMode === 'state' && selectedStateId !== undefined) ||
                    (viewMode === 'strategicregion' && selectedStrategicRegionId !== undefined) ||
                    (viewMode === 'supplyarea' && selectedSupplyAreaId !== undefined));
            }
        ));
    }
    
    private registerEventListeners(canvas: HTMLCanvasElement) {
        this.addSubscription(fromEvent<MouseEvent>(canvas, 'mousemove').subscribe((e) => {
            if (!this.loader.worldMap) {
                this.hoverProvinceId$.next(undefined);
                this.hoverStateId$.next(undefined);
                this.hoverStrategicRegionId$.next(undefined);
                this.hoverSupplyAreaId$.next(undefined);
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

            this.hoverProvinceId$.next(worldMap.getProvinceByPosition(x, y)?.id);
            this.hoverStateId$.next(this.hoverProvinceId$.value === undefined ? undefined : worldMap.getStateByProvinceId(this.hoverProvinceId$.value)?.id);
            this.hoverStrategicRegionId$.next(this.hoverProvinceId$.value === undefined ? undefined : worldMap.getStrategicRegionByProvinceId(this.hoverProvinceId$.value)?.id);
            this.hoverSupplyAreaId$.next(this.hoverStateId$.value === undefined ? undefined : worldMap.getSupplyAreaByStateId(this.hoverStateId$.value)?.id);
        }));
    
        this.addSubscription(fromEvent(canvas, 'mouseleave').subscribe(() => {
            this.hoverProvinceId$.next(undefined);
            this.hoverStateId$.next(undefined);
            this.hoverStrategicRegionId$.next(undefined);
            this.hoverSupplyAreaId$.next(undefined);
        }));
    
        this.addSubscription(fromEvent(canvas, 'click').subscribe(() => {
            switch (this.viewMode$.value) {
                case 'province':
                    this.selectedProvinceId$.next(this.selectedProvinceId$.value === this.hoverProvinceId$.value ? undefined : this.hoverProvinceId$.value);
                    break;
                case 'state':
                    this.selectedStateId$.next(this.selectedStateId$.value === this.hoverStateId$.value ? undefined : this.hoverStateId$.value);
                    break;
                case 'strategicregion':
                    this.selectedStrategicRegionId$.next(this.selectedStrategicRegionId$.value === this.hoverStrategicRegionId$.value ? undefined : this.hoverStrategicRegionId$.value);
                    break;
                case 'supplyarea':
                    this.selectedSupplyAreaId$.next(this.selectedSupplyAreaId$.value === this.hoverSupplyAreaId$.value ? undefined : this.hoverSupplyAreaId$.value);
                    break;
            }
        }));

        this.addSubscription(this.viewMode$.subscribe(() => this.onViewModeChange()));

        this.addSubscription(this.loader.worldMap$.subscribe(wm => {
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

        const viewMode = this.viewMode$.value;
        const [getRegionById, selectedId] =
            viewMode === 'province' ? [this.loader.worldMap.getProvinceById, this.selectedProvinceId$] :
            viewMode === 'state' ? [this.loader.worldMap.getStateById, this.selectedStateId$] :
            viewMode === 'strategicregion' ? [this.loader.worldMap.getStrategicRegionById, this.selectedStrategicRegionId$] :
            viewMode === 'supplyarea' ? [this.loader.worldMap.getSupplyAreaById, this.selectedSupplyAreaId$] :
            [() => undefined, undefined];
            
        const region = getRegionById(number);
        if (region) {
            selectedId?.next(number);
            this.viewPoint.centerZone(region.boundingBox);
        }
    }

    private setSearchBoxPlaceHolder(worldMap?: FEWorldMap) {
        if (!worldMap) {
            worldMap = this.loader.worldMap;
        }

        let placeholder = '';
        switch (this.viewMode$.value) {
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

function warningToString(warning: WorldMapWarning): string {
    return `[${warning.source.map(s => `${s.type[0].toUpperCase()}${s.type.substr(1)} ${'id' in s ? s.id : s.name}`).join(', ')}] ${warning.text}`;
}
