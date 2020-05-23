# HOI4 Mod Utilities

This extension add tools for Heart of Iron IV modding. Some of the tools may work on other Paradox games.

**Please set extension setting `hoi4ModUtilities.installPath` to correct HOI4 install path (and reload VSCode if possible) before using any preview features below. Or they won't be properly rendered.**

## Features

### World map preview
* Possible view modes: province and state.
* Copy (if not in mod) and open state file from world map.
* Show warnings and informations about provinces and states.
* Various of color sets.
* Search province or state by ID.
* Auto reload world map when related file updates.
* Force reload world map from tool bar.

![World map preview demo](demo/5.gif)

### Focus tree preview

* Render focus tree as graph.
* Navigate to `focus` tag in document by clicking a focus in graph.
* Show/hide focus branches (available for focuses has `allow_branch` tag).
* Auto update preview when document updates.
* Preview focus tree file that contains `shared_focus` tree.
* Can be dragged to scroll.

![Focus tree preview demo](demo/1.gif)

### Technology tree preview

* Render technology tree as GUI defined in `interface\countrytechtreeview.gui` (icons, texts defined in this file will also be rendered).
* Navigate to related technology tag by clicking technology or subtechnology.
* Auto update preview when technology file changed.
* Switch technology folder if a technology tree contains technology from different folder.
* Can be dragged to scroll.

![Technology tree preview demo](demo/4.gif)

### GFX file preview

* Preview all `spritetype` and `corneredTileSpriteType` tags in `.gfx` files.
* Filter sprites by name.
* Navigate to related tag in document by clicking a sprite in list.
* Show image size and path on tooltip.

![GFX file preview demo](demo/2.gif)

### DDS preview

* Preview `.dds` file (partially support).

![DDS preview demo](demo/3.gif)

## Extension Settings

|Setting|Type|Description|
|-------|----------|--------|
|`hoi4ModUtilities.installPath`|`string`|Hearts of Iron IV install path. Without this all icons will be invisible.|
|`hoi4ModUtilities.loadDlcContents`|`boolean`|Whether to load DLC images when previewing files. Enabling this will use more memory (All DLCs are around 600MB).|
|`hoi4ModUtilities.modFile`|`string`|Path to the working .mod file. This file is used to read replace_path. If not specified, will use first .mod file in first folder of the workspace.|

## Known Issues

* GUI of focus tree can't be configured like technology tree.

## Release Notes

### 0.2.1

### Added
* Command
  * `HOI4 Mod Utilities: Preview World Map` to open world map preview window.
* World map preview
  * Possible view modes: province and state.
  * Copy (if not in mod) and open state file from world map.
  * Show warnings and informations about provinces and states.
  * Various of color sets.
  * Search province or state by ID.
  * Auto reload world map when related file updates.
  * Force reload world map from tool bar.

### Changed
* Update UI in preview page to match VSCode style.

### Fixed
* Fixed parsing rules of HOI4 file parser.
