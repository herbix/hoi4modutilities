# HOI4 Mod Utilities

This extension add tools for Heart of Iron IV modding. Some of the tools may work on other Paradox games.

## Features

* World map preview
* Focus tree preview
* Technology tree preview
* `.gfx` file preview (sprites used by HOI4 are defined here)
* `.dds` file preview (images files used by HOI4)

For feature details and user manual, please refer to [HOI4 Mod Utilities Wiki](https://github.com/herbix/hoi4modutilities/wiki).

## Steps to start

1. Install and enable this extension in VSCode.
2. Update setting `hoi4ModUtilities.installPath` to the folder that installed Heart of Iron IV.
3. Open your mod develop folder.
4. (*Optional*) Open command palette using `Ctrl+P`. Use command `Select mod file` to set working mod descriptor (the `.mod` file).
5. Use these entries:
    * Command palette (`Ctrl+Shift+P`) commands: `Preview World Map` and `Preview HOI4 file`*.
    * `Preview HOI4 file` (![Preview HOI4 file button](demo/preview-icon.png))* button on right-top tool bar of text editor.
    * Open a `.dds` file.

\* *`Preview HOI4 file` (![Preview HOI4 file button](demo/preview-icon.png)) button/command is invisible, except on `.gfx`, technology tree or national focus tree files.*

## Demos

### World map preview

![World map preview demo](demo/5.gif)

### Focus tree preview

![Focus tree preview demo](demo/1.gif)

### Technology tree preview

![Technology tree preview demo](demo/4.gif)

### GFX file preview

![GFX file preview demo](demo/2.gif)

## Extension Settings

|Setting|Type|Description|
|-------|----------|--------|
|`hoi4ModUtilities.installPath`|`string`|Hearts of Iron IV install path. Without this, most features are broken.|
|`hoi4ModUtilities.loadDlcContents`|`boolean`|Whether to load DLC images when previewing files. Enabling this will use more memory (All DLCs are around 600MB).|
|`hoi4ModUtilities.modFile`|`string`|Path to the working `.mod` file. This file is used to read replace_path. If not specified, will use first `.mod` file in first folder of the workspace.|
|`hoi4ModUtilities.featureFlags`|`array` of `string`|Feature flags are used to disable or enable features. Reloading is required after changing this. Please refer to [Wiki](https://github.com/herbix/hoi4modutilities/wiki/Feature-flags) on Github for details.|

## Known Issues

* GUI of focus tree can't be configured like technology tree.
* Edge lines on world map not alway fit edge of colors.

## Release Notes

### [0.3.7]

### Fixed
* Add check before all usage of fsPath to make sure error message popup.
* An issue that D01 not treated as country scope.
* An issue that `dynamic_tags` is treated as a country in country tags files.
* An issue that world map still loading even preview page closed.
