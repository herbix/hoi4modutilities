import { Observable } from 'rxjs';
import type { Loader } from '../loader';
import { ViewModeControllerBase } from './viewbase';
import { CountryViewModeController } from './countryview';
import { ProvinceViewModeController } from './provinceview';
import { StateViewModeController } from './stateview';
import { StrategicRegionViewModeController } from './strategicregionview';
import { SupplyAreaViewModeController } from './supplyareaview';
import { ViewMode } from './viewbase';
import { WarningsViewModeController } from './warningsview';
import { TopBar } from '../topbar';

export type { ViewMode };

export interface ViewModeControllerState {
    selectedProvinceId?: number;
    selectedStateId?: number;
    selectedCountryTag?: string;
    selectedStrategicRegionId?: number;
    selectedSupplyAreaId?: number;
}

export class ViewModeControllers {
    public readonly province: ProvinceViewModeController;
    public readonly state: StateViewModeController;
    public readonly country: CountryViewModeController;
    public readonly strategicregion: StrategicRegionViewModeController;
    public readonly supplyarea: SupplyAreaViewModeController;
    public readonly warnings: WarningsViewModeController;

    public linkStateStrategicRegion: boolean = true;

    constructor(state: ViewModeControllerState, loader: Loader) {
        this.province = new ProvinceViewModeController(this, loader, state.selectedProvinceId);
        this.state = new StateViewModeController(this, loader, state.selectedStateId);
        this.country = new CountryViewModeController(this, loader, state.selectedCountryTag);
        this.strategicregion = new StrategicRegionViewModeController(this, loader, state.selectedStrategicRegionId);
        this.supplyarea = new SupplyAreaViewModeController(this, loader, state.selectedSupplyAreaId);
        this.warnings = new WarningsViewModeController(this, loader);
    }
    
    public initialize(topBar: TopBar): void {
        this.linkStateStrategicRegion = topBar.linkStateStrategicRegion.value;
        topBar.addSubscription(topBar.linkStateStrategicRegion.subscribe(linkStateStrategicRegion => {
            this.linkStateStrategicRegion = linkStateStrategicRegion;
        }));
    }

    public getHoverObservables(): Observable<unknown>[] {
        return [
            this.province.hover$,
            this.state.hover$,
            this.country.hover$,
            this.strategicregion.hover$,
            this.supplyarea.hover$,
            this.warnings.hover$,
            this.state.editModeHover$,
            this.strategicregion.editModeHover$,
        ];
    }

    public getSelectedObservables(): Observable<unknown>[] {
        return [
            this.province.selected$,
            this.state.selected$,
            this.country.selected$,
            this.strategicregion.selected$,
            this.supplyarea.selected$,
            // No warnings.selected$ because warnings view mode can't have a selected item
        ];
    }

    public getControllers(): Omit<ViewModeControllerBase<unknown>, 'hover$' | 'selected$'>[] {
        return [
            this.province,
            this.state,
            this.country,
            this.strategicregion,
            this.supplyarea,
            this.warnings,
        ];
    }
}
