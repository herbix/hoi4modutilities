import type { FEWorldMap } from '../loader';
import { ProvinceViewModeController } from './provinceview';
import { ViewMode } from './viewbase';

export class WarningsViewModeController extends ProvinceViewModeController {
    public override readonly viewMode: ViewMode = 'warnings';

    constructor() {
        super(undefined);
    }

    public override toggleSelection(): void {
    }

    public override openMapItem(worldMap: FEWorldMap, useHoverValue: boolean): void {
    }

    public override canOpenMapItem(worldMap: FEWorldMap): boolean {
        return false;
    }
}
