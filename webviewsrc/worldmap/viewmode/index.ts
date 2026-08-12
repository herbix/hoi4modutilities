import { Observable } from 'rxjs';
import type { FEWorldMap } from '../loader';
import { ViewModeControllerBase } from './viewbase';
import { CountryViewModeController } from './countryview';
import { ProvinceViewModeController } from './provinceview';
import { StateViewModeController } from './stateview';
import { StrategicRegionViewModeController } from './strategicregionview';
import { SupplyAreaViewModeController } from './supplyareaview';
import { ViewMode } from './viewbase';
import { WarningsViewModeController } from './warningsview';

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

    constructor(state: ViewModeControllerState, worldMap$?: Observable<FEWorldMap>) {
        this.province = new ProvinceViewModeController(state.selectedProvinceId);
        this.state = new StateViewModeController(state.selectedStateId, worldMap$);
        this.country = new CountryViewModeController(state.selectedCountryTag);
        this.strategicregion = new StrategicRegionViewModeController(state.selectedStrategicRegionId);
        this.supplyarea = new SupplyAreaViewModeController(state.selectedSupplyAreaId);
        this.warnings = new WarningsViewModeController();
    }

    public getHoverObservables(): Observable<unknown>[] {
        return [
            this.province.hover$,
            this.state.hover$,
            this.country.hover$,
            this.strategicregion.hover$,
            this.supplyarea.hover$,
            this.warnings.hover$,
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
