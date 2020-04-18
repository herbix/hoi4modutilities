# HOI4 Mod Utilities

This extension add tools for Heart of Iron IV modding. Some of the tools may work on other Paradox games.

## Features

### Focus tree preview

* Render focus tree as graph.
* Navigate to `focus` tag in document by clicking a focus in graph.
* Show/hide focus branches (available for focuses has `allow_branch` tag).
* Auto update preview when document updates.
* Preview focus tree file that contains `shared_focus` tree.

![Focus tree preview demo](demo/1.gif)

### GFX file preview

* Preview all `spritetype` tags in `.gfx` files.
* Filter sprites by name.
* Navigate to `spritetype` tag in document by clicking a sprite in list.

![GFX file preview demo](demo/2.gif)

### DDS preview

* Preview `.dds` file (partially support).

![DDS preview demo](demo/3.gif)

## Extension Settings

|Setting|Type|Description|
|-------|----------|--------|
|`hoi4ModUtilities.installPath`|`string`|Hearts of Iron IV install path. Without this all icons will be invisible.|
|`hoi4ModUtilities.loadDlcContents`|`boolean`|Whether to load DLC images when previewing files. Enabling this will use more memory (All DLCs are around 600MB).|

## Known Issues

* DDS preview supports RGB or RGBA format only. Most of DDS files in Heart of Iron IV are in this format. DDS files in other format can't be previewed yet.
* Focus tree preview uses sprites from `interface/goals.gfx`. If you defined custom sprite and use it in focus, it will be shown as unknown focus icon.

## Release Notes

### 0.1.0

Initial version of the extension.

* Focus tree preview
  * Render focus tree as graph.
  * Navigate to `focus` tag in document by clicking a focus in graph.
  * Show/hide focus branches (available for focuses has `allow_branch` tag).
  * Auto update preview when document updates.
  * Preview focus tree file that contains `shared_focus` tree.
* GFX file preview
  * Preview all `spritetype` tags in `.gfx` files.
  * Filter sprites by name.
  * Navigate to `spritetype` tag in document by clicking a sprite in list.
* DDS preview
  * Supports RGB and RGBA format.
