import * as vscode from 'vscode';
import { matchPathEnd } from '../../util/nodecommon';
import { PreviewProviderDef } from '../previewmanager';
import { WorldMapContainer } from "./worldmapcontainer";

export const worldMap = new WorldMapContainer();

function canPreviewWorldmap(document: vscode.TextDocument) {
    const uri = document.uri;
    return matchPathEnd(uri.toString(), ['map', 'default.map']) ? 0 : undefined;
}

function onPreviewWorldmap(document: vscode.TextDocument): Promise<void> {
    return worldMap.openPreview();
}

export const worldMapPreviewDef: PreviewProviderDef = {
    type: 'worldmap',
    canPreview: canPreviewWorldmap,
    onPreview: onPreviewWorldmap,
};
