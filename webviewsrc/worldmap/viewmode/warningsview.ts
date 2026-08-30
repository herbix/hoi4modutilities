import type { Loader } from '../loader';
import { ProvinceViewModeController } from './provinceview';
import { ViewMode } from './viewbase';
import type { ViewModeControllers } from './index';

export class WarningsViewModeController extends ProvinceViewModeController {
    public override readonly viewMode: ViewMode = 'warnings';

    constructor(viewModeControllers: ViewModeControllers, loader: Loader) {
        super(viewModeControllers, loader);
    }

    public override onClick(): void {
    }

    public override onDblClick(): void {
    }

    public override openMapItem(useHoverValue: boolean): void {
    }

    public override canOpenMapItem(): boolean {
        return false;
    }

    public override canViewSelected(): boolean {
        return false;
    }
}
