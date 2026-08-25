import * as vscode from 'vscode';
import stateTemplate from './statetemplate.txt';
import strategicRegionTemplate from './strategicregiontemplate.txt';
import { AddMapItemMessage, State, StrategicRegion, WorldMapData, WorldMapMessage } from '../definitions';
import { loadStateFromContent } from '../loader/states';
import { localize } from '../../../util/i18n';
import { dirUri, getPreferedIndent, mkdirs, writeFile } from '../../../util/vsccommon';
import { loadStrategicRegionFromContent } from '../loader/strategicregion';

export async function addMapItem(msg: AddMapItemMessage, cachedWorldMap: WorldMapData): Promise<WorldMapMessage[]> {
    const type = msg.type;
    const typeName = localize('worldmap.openfiletype.' + type as any, type);

    if (!vscode.workspace.workspaceFolders?.length) {
        await vscode.window.showErrorMessage(localize('worldmap.mustopenafolder.add', 'Must open a folder before adding {0} file.', typeName));
        return [];
    }

    let targetFolderUri = vscode.workspace.workspaceFolders[0].uri;
    if (vscode.workspace.workspaceFolders.length >= 1) {
        const folder = await vscode.window.showWorkspaceFolderPick({ placeHolder: localize('worldmap.selectafolder.create', 'Select a folder to create {0} file', typeName) });
        if (!folder) {
            return [];
        }

        targetFolderUri = folder.uri;
    }

    if (type === 'state') {
        return addState(targetFolderUri, cachedWorldMap);
    } else if (type === 'strategicregion') {
        return addStrategicRegion(targetFolderUri, cachedWorldMap);
    }

    return [];
}

async function addState(targetFolderUri: vscode.Uri, cachedWorldMap: WorldMapData): Promise<WorldMapMessage[]> {
    const result: WorldMapMessage[] = [];
    const newStateId = cachedWorldMap.statesCount;
    cachedWorldMap.statesCount++;

    const indent = getPreferedIndent();
    const content = stateTemplate.replace(/\{id\}/g, newStateId.toString()).replace(/\t/g, indent);
    const file = 'history/states/' + newStateId.toString() + '.txt';
    const targetUri = vscode.Uri.joinPath(targetFolderUri, file);
    
    await mkdirs(dirUri(targetUri));
    await writeFile(targetUri, Buffer.from(content));

    const newState: State = {
        ...loadStateFromContent(content, file, targetUri, [], [], [])[0],
        boundingBox: { x: 0, y: 0, w: 0, h: 0 },
        centerOfMass: { x: 0, y: 0 },
        mass: 0,
    };

    result.push({
        command: 'states',
        data: JSON.stringify([newState]),
        start: newStateId,
        end: newStateId + 1,
        count: cachedWorldMap.statesCount,
    });

    result.push({
        command: 'selectmapitem',
        type: 'state',
        id: newStateId,
        enterEditMode: true,
    });

    // mark dirty
    const workspaceEdit = new vscode.WorkspaceEdit();
    workspaceEdit.replace(targetUri, new vscode.Range(0, 0, 0, 5), 'state');
    await vscode.workspace.applyEdit(workspaceEdit);
    return result;
}

async function addStrategicRegion(targetFolderUri: vscode.Uri, cachedWorldMap: WorldMapData): Promise<WorldMapMessage[]> {
    const result: WorldMapMessage[] = [];
    const newStrategicRegionId = cachedWorldMap.strategicRegionsCount;
    cachedWorldMap.strategicRegionsCount++;

    const indent = getPreferedIndent();
    const content = strategicRegionTemplate.replace(/\{id\}/g, newStrategicRegionId.toString()).replace(/\t/g, indent);
    const file = 'map/strategicregions/' + newStrategicRegionId.toString() + '.txt';
    const targetUri = vscode.Uri.joinPath(targetFolderUri, file);
    
    await mkdirs(dirUri(targetUri));
    await writeFile(targetUri, Buffer.from(content));

    const newStrategicRegion: StrategicRegion = {
        ...loadStrategicRegionFromContent(content, file, targetUri, [])[0],
        boundingBox: { x: 0, y: 0, w: 0, h: 0 },
        centerOfMass: { x: 0, y: 0 },
        mass: 0,
    };

    result.push({
        command: 'strategicregions',
        data: JSON.stringify([newStrategicRegion]),
        start: newStrategicRegionId,
        end: newStrategicRegionId + 1,
        count: cachedWorldMap.strategicRegionsCount,
    });

    result.push({
        command: 'selectmapitem',
        type: 'strategicregion',
        id: newStrategicRegionId,
        enterEditMode: true,
    });

    // mark dirty
    const workspaceEdit = new vscode.WorkspaceEdit();
    workspaceEdit.replace(targetUri, new vscode.Range(0, 0, 0, 16), 'strategic_region');
    await vscode.workspace.applyEdit(workspaceEdit);
    return result;
}
