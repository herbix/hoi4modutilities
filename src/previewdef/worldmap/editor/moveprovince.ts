import * as vscode from 'vscode';
import { getFilePathFromMod, getHoiOpenedFileOriginalUri, readFileFromModOrHOI4 } from '../../../util/fileloader';
import { localize } from '../../../util/i18n';
import { dirUri, mkdirs, writeFile } from '../../../util/vsccommon';
import { MoveProvinceMessage, WorldMapData, WorldMapMessage } from '../definitions';
import { forceError } from '../../../util/common';
import { parseHoi4File, Token } from '../../../hoiformat/hoiparser';
import { convertNodeToJson, Enum, SchemaDef } from '../../../hoiformat/schema';

export async function moveProvince(msg: MoveProvinceMessage, cachedWorldMap: WorldMapData): Promise<WorldMapMessage[]> {
    const result: WorldMapMessage[] = [];
    const { type, province, to, from, toFile, fromFile } = msg;
    const files = [toFile];
    if (fromFile && fromFile !== toFile) {
        files.push(fromFile);
    }

    const filePathsInMod = await Promise.all(files.map(async (f) => {
        const path = await getFilePathFromMod(f);
        return path ? getHoiOpenedFileOriginalUri(path) : undefined;
    }));
    const filePathsNotInMod = filePathsInMod.map((v, i) => !v ? files[i] : undefined);
    const filteredFilePathsNotInMod = filePathsNotInMod.filter((v): v is string => v !== undefined);
    if (filteredFilePathsNotInMod.length > 0) {
        const typeName = localize('worldmap.openfiletype.' + type as any, type);

        if (!vscode.workspace.workspaceFolders?.length) {
            await vscode.window.showErrorMessage(localize('worldmap.mustopenafolder.edit', 'Must open a folder before editing {0} file.', typeName));
            return result;
        }

        let targetFolderUri = vscode.workspace.workspaceFolders[0].uri;
        if (vscode.workspace.workspaceFolders.length >= 1) {
            const folder = await vscode.window.showWorkspaceFolderPick({ placeHolder: localize('worldmap.selectafolder', 'Select a folder to copy {0} file', typeName) });
            if (!folder) {
                return result;
            }

            targetFolderUri = folder.uri;
        }

        const success = (await Promise.all(filePathsNotInMod.map(async (v, i) => {
            const file = v;
            if (file === undefined) {
                return true;
            }

            try {
                const [buffer] = await readFileFromModOrHOI4(file);
                const targetPath = vscode.Uri.joinPath(targetFolderUri, file);
                await mkdirs(dirUri(targetPath));
                await writeFile(targetPath, buffer);
                filePathsInMod[i] = targetPath;
                return true;
            } catch (e) {
                await vscode.window.showErrorMessage(localize('worldmap.failedtoopenstate', 'Failed to open {0} file: {1}.', typeName, forceError(e).toString()));
                return false;
            }
        }))).every(v => v);

        if (!success) {
            return result;
        }
    }

    // TODO move victory points.
    const toDocumentUri = filePathsInMod[0]!;
    const toDocument = await vscode.workspace.openTextDocument(toDocumentUri);
    const regionArray = type === 'state' ? cachedWorldMap.states : cachedWorldMap.strategicRegions;
    const toRegion = regionArray[to];
    const toProvinces = toRegion ? [...toRegion.provinces] : [];
    const workspaceEdit = new vscode.WorkspaceEdit();
    if (to !== from) {
        // Move province from one to another
        const fromDocumentUri = fromFile === toFile ? toDocumentUri : filePathsInMod[1];
        const fromDocument = fromDocumentUri ? await vscode.workspace.openTextDocument(fromDocumentUri) : undefined;
        if (from !== undefined && fromFile !== undefined && fromDocument) {
            const fromRegion = regionArray[from];
            if (fromRegion) {
                const provinceIndex = fromRegion.provinces.indexOf(province);
                if (provinceIndex >= 0) {
                    const fromProvinces = [...fromRegion.provinces];
                    fromProvinces.splice(provinceIndex, 1);
                    if (await setProvinces(workspaceEdit, type, from, fromFile, fromDocument, fromProvinces, fromRegion.token)) {
                        fromRegion.provinces = fromProvinces;
                        result.push({
                            command: type === 'state' ? 'states' : 'strategicregions',
                            data: JSON.stringify([fromRegion]),
                            start: from,
                            end: from + 1,
                        });
                    }
                }
            }
        }

        if (toRegion && !toProvinces.includes(province)) {
            toProvinces.push(province);
        }
    } else {
        // Remove province
        if (toRegion) {
            const provinceIndex = toProvinces.indexOf(province);
            if (provinceIndex >= 0) {
                toProvinces.splice(provinceIndex, 1);
            }
        }
    }

    if (toRegion) {
        if (await setProvinces(workspaceEdit, type, to, toFile, toDocument, toProvinces, toRegion.token)) {
            toRegion.provinces = toProvinces;
            result.push({
                command: type === 'state' ? 'states' : 'strategicregions',
                data: JSON.stringify([toRegion]),
                start: to,
                end: to + 1,
            });
        }
    }

    await vscode.workspace.applyEdit(workspaceEdit);
    return result;
}

interface ProvincesContainer {
    id: number;
    provinces: Enum[];
    _token: Token;
    _valueStartToken: Token;
    _valueEndToken: Token;
}

interface ProvincesContainerFile {
    state: ProvincesContainer[];
    strategic_region: ProvincesContainer[];
}

const provincesContainerFileSchema: SchemaDef<ProvincesContainerFile> = {
    state: {
        _innerType: {
            id: 'number',
            provinces: {
                _innerType: 'enum',
                _type: 'array',
            },
        },
        _type: 'array',
    },
    strategic_region: {
        _innerType: {
            id: 'number',
            provinces: {
                _innerType: 'enum',
                _type: 'array',
            },
        },
        _type: 'array',
    },
};

async function setProvinces(
    workspaceEdit: vscode.WorkspaceEdit,
    type: 'state' | 'strategicregion',
    id: number,
    relativePath: string,
    document: vscode.TextDocument,
    provinces: number[],
    token: Token | null
): Promise<boolean> {
    const nodes = parseHoi4File(document.getText(), localize('infile', 'In file {0}:\n', relativePath));
    const file = convertNodeToJson<ProvincesContainerFile>(nodes, provincesContainerFileSchema);
    const list = type === 'state' ? file.state : file.strategic_region;

    let item = list.find(i => i.id === id);
    if (!item) {
        item = list.find(i => i._token && i._token?.start === token?.start && i._token?.end === token?.end);
    }

    if (!item) {
        return false;
    }

    if (item.provinces.length === 0) {
        if (item._valueEndToken?.start !== undefined) {
            provinces.sort((a, b) => a - b);
            workspaceEdit.insert(document.uri, document.positionAt(item._valueEndToken.start), `\n\tprovinces={\n\t\t${provinces.join(' ')}\n\t}\n`);
            return true;
        } else {
            return false;
        }
    }

    const firstProvince = item.provinces[0];
    if (firstProvince._valueStartToken?.start === undefined || firstProvince._valueEndToken?.end === undefined) {
        return false;
    }

    if (item.provinces.length > 1) {
        for (let i = 1; i < item.provinces.length; i++) {
            const province = item.provinces[i];
            if (province._token?.start === undefined || province._valueEndToken?.end === undefined) {
                return false;
            }
        }
        
        for (let i = 1; i < item.provinces.length; i++) {
            const province = item.provinces[i];
            const start = document.positionAt(province._token!.start);
            const end = document.positionAt(province._valueEndToken!.end);
            const range = new vscode.Range(start, end);
            workspaceEdit.delete(document.uri, range);
        }
    }

    const start = document.positionAt(firstProvince._valueStartToken.start);
    const end = document.positionAt(firstProvince._valueEndToken.end);
    const range = new vscode.Range(start, end);
    provinces.sort((a, b) => a - b);
    workspaceEdit.replace(document.uri, range, '{\n\t\t' + provinces.join(' ') + '\n\t}');
    return true;
}
