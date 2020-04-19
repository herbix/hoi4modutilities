# Change Log

All notable changes to the "hoi4modutilities" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [Unreleased]

* Empty

## [0.1.1] - 2020/04/19 - Latest

### Fixed
* Fix bug that the tokenizer will read `={` as one token.

## [0.1.0] - 2020/04/18

### Added
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
