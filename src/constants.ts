// This file contains constants that may be used in package.json

export const ConfigurationKey = 'hoi4ModUtilities';
export const Hoi4FsSchema = 'hoi4installpath';

export namespace ViewType {
    export const DDS = 'hoi4modutilities.dds';
    export const TGA = 'hoi4modutilities.tga';
}

export namespace ContextName {
    export const ShouldHideHoi4Preview = 'shouldHideHoi4Preview';
    export const ShouldShowHoi4Preview = 'shouldShowHoi4Preview';
    export const Hoi4PreviewType = 'hoi4PreviewType';
    export const Hoi4MUInDev = 'hoi4MUInDev';
    export const Hoi4MULoaded = 'hoi4MULoaded';
}

export namespace Commands {
    export const Preview = 'hoi4modutilities.preview';
    export const PreviewWorld = 'hoi4modutilities.previewworld';
    export const ScanReferences = 'hoi4modutilities.scanreferences';
    export const SelectModFile = 'hoi4modutilities.selectmodfile';
    export const SelectHoiFolder = 'hoi4modutilities.selecthoifolder';
}

export namespace WebviewType {
    export const Preview = 'hoi4ftpreview';
    export const PreviewWorldMap = 'hoi4worldmappreview';
}
