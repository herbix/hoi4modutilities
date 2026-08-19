import { Subscriber, toBehaviorSubject } from '../util/event';
import { FEWorldMap, Loader } from './loader';
import { ViewPoint } from './viewpoint';
import { vscode } from '../util/vscode';
import { WorldMapMessage, WorldMapWarning } from '../../src/previewdef/worldmap/definitions';
import { feLocalize } from '../util/i18n';
import { DivDropdown } from '../util/dropdown';
import { BehaviorSubject, combineLatest, fromEvent } from 'rxjs';
import { Renderer } from './renderer';
import { sendEvent } from '../util/telemetry';
import { getState, setState } from '../util/common';
import { ConditionItem, conditionItemToStringValue, conditionToString, stringValueToConditionItem } from '../../src/hoiformat/condition';
import { distinctUntilChanged } from 'rxjs/operators';
import { ViewMode } from './viewmode';
import type { ViewModeControllers } from './viewmode';

export { ViewMode } from './viewmode';
export type ColorSet = 'provinceid' | 'provincetype' | 'terrain' | 'owner' | 'controller' | 'stateid' | 'manpower' |
    'victorypoint' | 'continent' | 'warnings' | 'strategicregionid' | 'supplyareaid' | 'supplyvalue' | 'resources' | 'statecategory';
type WarningFilter = 'province' | 'state' | 'strategicregion' | 'supplyarea' | 'river';
type DisplayOption = 'edge' | 'localisedlabel' | 'label' | 'countryname' | 'tooltip' | 'supply' | 'river' |
    'demilitarizedzone' | 'mousehighlight' | 'fastrending' | 'adaptzooming';

export const topBarHeight = 40;

const displayOptions: DisplayOption[] = [
    'edge', 'localisedlabel', 'label', 'countryname', 'tooltip', 'supply', 'river', 'demilitarizedzone', 'mousehighlight',
    'fastrending', 'adaptzooming'
];

interface WorkspaceState {
    viewMode?: ViewMode;
    colorSet?: ColorSet;
    display?: DisplayOption[]; // to be deprecated
    displayDict?: Record<DisplayOption, boolean>;
    selectedConditions?: string[];
    warningFilter?: WarningFilter[];
}

export class TopBar extends Subscriber {
    public readonly viewMode$: BehaviorSubject<ViewMode>;
    public readonly colorSet$: BehaviorSubject<ColorSet>;
    public readonly selectedConditions$: BehaviorSubject<ConditionItem[]>;
    public readonly warningFilter: DivDropdown<WarningFilter>;
    public readonly display: DivDropdown<DisplayOption>;
    public readonly conditions: DivDropdown;

    public warningsVisible: boolean = false;

    private searchBox: HTMLInputElement;
    private conditionSetupDone: boolean = false;

    constructor(
        canvas: HTMLCanvasElement,
        private readonly viewPoint: ViewPoint,
        private readonly loader: Loader,
        state: any,
        private readonly viewModeControllers: ViewModeControllers,
    ) {
        super();

        this.addSubscription(this.warningFilter = new DivDropdown(document.getElementById('warningfilter') as HTMLDivElement, true));
        this.addSubscription(this.display = new DivDropdown(document.getElementById('display') as HTMLDivElement, true));
        this.addSubscription(this.conditions = new DivDropdown(document.getElementById('conditions') as HTMLDivElement, true));
        const groupElement = this.conditions.select.closest<HTMLDivElement>('.group');
        if (groupElement) {
            groupElement.style.display = 'none';
        }
        this.addSubscription(loader.worldMap$.subscribe(this.setupConditions));

        const workspaceState: WorkspaceState = (window as any).__workspaceState ?? {};

        this.viewMode$ = toBehaviorSubject(document.getElementById('viewmode') as HTMLSelectElement, state.viewMode ?? workspaceState.viewMode ?? 'province');
        this.colorSet$ = toBehaviorSubject(document.getElementById('colorset') as HTMLSelectElement, state.colorSet ?? workspaceState.colorSet ?? 'provinceid');
        this.selectedConditions$ = new BehaviorSubject<ConditionItem[]>((state.selectedConditions ?? workspaceState.selectedConditions ?? []).map(stringValueToConditionItem));

        this.addSubscription(this.conditions.selectedValues$.subscribe(selection => {
            this.selectedConditions$.next(selection.map(stringValueToConditionItem));
            if (this.conditionSetupDone) {
                setState({ selectedConditions: selection });
            }
        }));

        if (state.warningFilter) {
            this.warningFilter.selectedValues$.next(state.warningFilter);
        } else if (workspaceState.warningFilter) {
            this.warningFilter.selectedValues$.next(workspaceState.warningFilter);
        } else {
            this.warningFilter.selectAll();
        }

        if (state.display) {
            if (!workspaceState.displayDict) {
                state.display = [...state.display, 'demilitarizedzone'];
            }
            this.display.selectedValues$.next(state.display);
        } else if (workspaceState.displayDict) {
            this.display.selectedValues$.next(displayOptions.filter(option =>
                workspaceState.displayDict![option] ?? option !== 'countryname'));
        } else if (workspaceState.display) {
            // patch for old workspace state that used array instead of dict
            this.display.selectedValues$.next([...workspaceState.display, 'demilitarizedzone']);
        } else {
            this.display.selectedValues$.next(displayOptions.filter(option => option !== 'countryname'));
        }

        this.addSubscription(
            combineLatest([
                this.viewMode$,
                this.colorSet$,
                this.warningFilter.selectedValues$,
                this.display.selectedValues$,
                this.conditions.selectedValues$,
            ]).pipe(
                distinctUntilChanged((x, y) => x.every((v, i) => v === y[i]))
            ).subscribe(this.updateWorkspaceState));

        this.searchBox = document.getElementById('searchbox') as HTMLInputElement;

        this.loadControls();
        this.registerEventListeners(canvas);
    }

    public get viewModeController() {
        return this.viewModeControllers[this.viewMode$.value];
    }

    private setupConditions = (worldMap: FEWorldMap) => {
        if (worldMap.conditionExprs.length === 0 && !this.conditionSetupDone) {
            return;
        }

        this.conditions.setupOptions(worldMap.conditionExprs.map(option => ({ value: conditionItemToStringValue(option), text: conditionToString(option) })));
        const workspaceState: WorkspaceState = (window as any).__workspaceState ?? {};
        const selectedConditions: string[] = getState().selectedConditions ?? workspaceState.selectedConditions ?? [];
        this.conditions.selectedValues$.next(selectedConditions);
        const groupElement = this.conditions.select.closest<HTMLDivElement>('.group');
        if (groupElement) {
            groupElement.style.display = worldMap.conditionExprs.length > 0 ? 'inline-block' : 'none';
        }

        this.conditionSetupDone = true;
    };

    private updateWorkspaceState = ([viewMode, colorSet, warningFilter, display, selectedConditions]: [ViewMode, ColorSet, readonly WarningFilter[], readonly DisplayOption[], readonly string[]]) => {
        const workspaceState: WorkspaceState = {
            viewMode,
            colorSet,
            warningFilter: [...warningFilter],
            displayDict: displayOptions.reduce((dict, option) => {
                dict[option] = display.includes(option);
                return dict;
            }, {} as Record<DisplayOption, boolean>),
            selectedConditions: this.conditionSetupDone ? [...selectedConditions] : ((window as any).__workspaceState ?? {}).selectedConditions,
        };
        vscode.postMessage<WorldMapMessage>({ command: 'savestate', value: workspaceState });
    };

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
        this.loadWarningButton();
        this.loadSearchBox();
        this.loadRefreshButton();
        this.loadOpenButton();
        this.loadExportButton();
    }

    private loadWarningButton() {
        const warningsContainer = document.getElementById('warnings-container')!;
        const showWarnings = document.getElementById('show-warnings')!;
        this.addSubscription(fromEvent(showWarnings, 'click').subscribe(() => {
            this.warningsVisible = !this.warningsVisible;
            if (this.warningsVisible) {
                sendEvent('worldmap.openwarnings');
                warningsContainer.style.display = 'block';
            } else {
                warningsContainer.style.display = 'none';
            }
        }));
    }

    private loadSearchBox() {
        const searchBox = this.searchBox;
        const search = document.getElementById('search')!;
        this.addSubscription(fromEvent<KeyboardEvent>(searchBox, 'keypress').subscribe((e) => {
            if (e.code === 'Enter') {
                sendEvent('worldmap.search', { keypress: 'true' });
                this.search(searchBox.value);
            }
        }));
        this.addSubscription(fromEvent(search, 'click').subscribe(() => {
            sendEvent('worldmap.search', { keypress: 'false' });
            this.search(searchBox.value);
        }));
    }

    private loadRefreshButton() {
        const refresh = document.getElementById('refresh') as HTMLButtonElement;
        this.addSubscription(fromEvent(refresh, 'click').subscribe(() => {
            if (!refresh.disabled) {
                sendEvent('worldmap.refresh');
                this.loader.refresh();
            }
        }));
        this.addSubscription(this.loader.loading$.subscribe(v => {
            refresh.disabled = v;
        }));
    }

    private openMapItem(useHoverValue = false) {
        sendEvent('worldmap.open.' + this.viewMode$.value + (useHoverValue ? '.dblclick' : ''));
        this.viewModeController.openMapItem(this.loader.worldMap, useHoverValue);
    }

    private loadOpenButton() {
        const open = document.getElementById('open') as HTMLButtonElement;
        this.addSubscription(fromEvent(open, 'click').subscribe((e) => {
            e.stopPropagation();
            this.openMapItem();
        }));

        this.addSubscription(combineLatest([
            this.viewMode$,
            ...this.viewModeControllers.getSelectedObservables(),
        ]).subscribe(() => {
            open.disabled = !this.viewModeController.canOpenMapItem(this.loader.worldMap);
        }));
    }

    private loadExportButton() {
        const exportButton = document.getElementById('export') as HTMLButtonElement;
        exportButton.disabled = true;
        this.addSubscription(this.loader.worldMap$.subscribe(wm => {
            exportButton.disabled = !wm;
        }));
        this.addSubscription(fromEvent(exportButton, 'click').subscribe(e => {
            e.stopPropagation();
            vscode.postMessage<WorldMapMessage>({ command: 'requestexportmap' });
        }));
        this.addSubscription(fromEvent<MessageEvent>(window, 'message').subscribe(async event => {
            const message = event.data as WorldMapMessage;
            if (message.command !== 'requestexportmap') {
                return;
            }

            const worldMap = this.loader.worldMap;
            if (!worldMap) {
                return;
            }

            sendEvent('worldmap.export');
            const exportImageScale = message.scale ?? 1;
            const canvas = document.createElement('canvas');
            canvas.width = Math.max(1, worldMap.width * exportImageScale);
            canvas.height = Math.max(1, worldMap.height * exportImageScale);
            const viewPoint = new ViewPoint(canvas, this.loader, 0, { x: 0, y: 0, scale: exportImageScale });
            if (this.colorSet$.value === 'owner' && this.display.selectedValues$.value.includes('countryname')) {
                await this.loader.requestCountryLabels();
                await Renderer.prepareCountryLabels(this.loader.worldMap.mapFont);
            }
            Renderer.renderMapImpl(canvas, this, viewPoint, worldMap, { preciseEdge: true, overwriteRenderPrecision: 1 });
            vscode.postMessage<WorldMapMessage>({ command: 'exportmap', dataUrl: canvas.toDataURL() });
        }));
    }
    
    private registerEventListeners(canvas: HTMLCanvasElement) {
        this.addSubscription(fromEvent<MouseEvent>(canvas, 'mousemove').subscribe((e) => {
            if (!this.loader.worldMap) {
                this.clearControllerHovers();
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

            this.viewModeController.updateHover(worldMap, x, y, this.selectedConditions$.value);
        }));
    
        this.addSubscription(fromEvent(canvas, 'mouseleave').subscribe(() => {
            this.clearControllerHovers();
        }));
    
        this.addSubscription(fromEvent(canvas, 'click').subscribe(() => {
            this.viewModeController.toggleSelection();
        }));

        this.addSubscription(fromEvent(canvas, 'dblclick').subscribe(e => {
            e.stopPropagation();
            this.openMapItem(true);
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

    private clearControllerHovers(): void {
        for (const view of this.viewModeControllers.getControllers()) {
            view.clearHover();
        }
    }

    private search(text: string) {
        const number = parseInt(text);
        if (isNaN(number)) {
            return;
        }

        this.viewModeController.search(this.loader.worldMap, this.viewPoint, number);
    }

    private setSearchBoxPlaceHolder(worldMap?: FEWorldMap) {
        if (!worldMap) {
            worldMap = this.loader.worldMap;
        }

        const placeholder = this.viewModeController.getSearchPlaceholder(worldMap);

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
