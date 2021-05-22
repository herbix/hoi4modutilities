import { GridBoxType } from '../../hoiformat/gui';
import { HOIPartial } from '../../hoiformat/schema';
import { ParentInfo } from './common';
import { renderGridBoxCommon, RenderGridBoxCommonOptions } from './gridboxcommon';
import { renderBackground, RenderNodeCommonOptions } from './nodecommon';

export * from './gridboxcommon';

type TypeMix = RenderGridBoxCommonOptions & RenderNodeCommonOptions;

export interface RenderGridBoxOptions extends TypeMix {
}

export async function renderGridBox(gridBox: HOIPartial<GridBoxType>, parentInfo: ParentInfo, options: RenderGridBoxOptions): Promise<string> {
    return await renderGridBoxCommon(gridBox, parentInfo, options, (bg, p) => renderBackground(bg, p, options));
}
