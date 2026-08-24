import type { Loader } from '../loader';
import { ProvinceViewModeController } from './provinceview';
import { ViewMode } from './viewbase';

export class WarningsViewModeController extends ProvinceViewModeController {
    public override readonly viewMode: ViewMode = 'warnings';

    constructor(loader: Loader) {
        super(loader);
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
}
