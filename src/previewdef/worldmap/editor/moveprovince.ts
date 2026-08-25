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
    const regionArray = type === 'state' ? cachedWorldMap.states : cachedWorldMap.strategicRegions;
    const toRegion = regionArray[to];
    const fromRegion = from !== undefined ? regionArray[from] : undefined;
    if (from === to && fromRegion && 'victoryPoints' in fromRegion && province in fromRegion.victoryPoints) {
        await vscode.window.showErrorMessage(localize('worldmap.edit.failed.cannotremovevp', 'You cannot remove a province with victory point.'));
        return result;
    }

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

    const toDocumentUri = filePathsInMod[0]!;
    const toDocument = await vscode.workspace.openTextDocument(toDocumentUri);
    const toProvinces = toRegion ? [...toRegion.provinces] : [];
    const workspaceEdit = new vscode.WorkspaceEdit();
    const vp = fromRegion && 'victoryPoints' in fromRegion ? fromRegion.victoryPoints[province] : undefined;
    const vpObject = vp !== undefined ? { province, remove: true } : undefined;
    if (to !== from) {
        // Move province from one to another
        const fromDocumentUri = fromFile === toFile ? toDocumentUri : filePathsInMod[1];
        const fromDocument = fromDocumentUri ? await vscode.workspace.openTextDocument(fromDocumentUri) : undefined;
        if (from !== undefined && fromFile !== undefined && fromDocument) {
            if (fromRegion) {
                const provinceIndex = fromRegion.provinces.indexOf(province);
                if (provinceIndex >= 0) {
                    const fromProvinces = [...fromRegion.provinces];
                    fromProvinces.splice(provinceIndex, 1);
                    if (await setProvinces(workspaceEdit, type, from, fromFile, fromDocument, fromProvinces, vpObject, fromRegion.token)) {
                        fromRegion.provinces = fromProvinces;
                        if (vp !== undefined && 'victoryPoints' in fromRegion) {
                            delete fromRegion.victoryPoints[province];
                        }
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
        if (vpObject) {
            vpObject.remove = false;
        }
        if (await setProvinces(workspaceEdit, type, to, toFile, toDocument, toProvinces, vpObject, toRegion.token)) {
            toRegion.provinces = toProvinces;
            if (vp !== undefined && 'victoryPoints' in toRegion) {
                toRegion.victoryPoints[province] = vp;
            }
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
    history: {
        victory_points: Enum[];
        _valueEndToken: Token;
    };
    _token: Token;
    _valueStartToken: Token;
    _valueEndToken: Token;
}

interface ProvincesContainerFile {
    state: ProvincesContainer[];
    strategic_region: ProvincesContainer[];
}

const provincesContainerSchema: SchemaDef<ProvincesContainer> = {
    id: 'number',
    provinces: {
        _innerType: 'enum',
        _type: 'array',
    },
    history: {
        victory_points: {
            _innerType: 'enum',
            _type: 'array',
        },
    },
};

const provincesContainerFileSchema: SchemaDef<ProvincesContainerFile> = {
    state: {
        _innerType: provincesContainerSchema,
        _type: 'array',
    },
    strategic_region: {
        _innerType: provincesContainerSchema,
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
    vp: { province: number; remove?: boolean; text?: string; } | undefined,
    token: Token | null
): Promise<boolean> {
    const text = document.getText();
    const nodes = parseHoi4File(text, localize('infile', 'In file {0}:\n', relativePath));
    const file = convertNodeToJson<ProvincesContainerFile>(nodes, provincesContainerFileSchema);
    const list = type === 'state' ? file.state : file.strategic_region;

    let item = list.find(i => i.id === id);
    if (!item) {
        item = list.find(i => i._token && i._token?.start === token?.start && i._token?.end === token?.end);
    }

    if (!item) {
        return false;
    }

    const indent = detectIndent(text);
    const endTokenStartPosition = document.positionAt(item._valueEndToken?.start ?? text.length).with({ character: 0 });

    provinces.sort((a, b) => a - b);
    if (item.provinces.length === 0) {
        workspaceEdit.insert(document.uri, endTokenStartPosition, `${indent}provinces = {\n${indent}${indent}${provinces.join(' ')}\n${indent}}\n`);
        return true;
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
    workspaceEdit.replace(document.uri, range, `{\n${indent}${indent}${provinces.join(' ')}\n${indent}}`);

    if (type === 'state' && vp) {
        const { province, remove, text: vpText } = vp;
        if (remove) {
            // Remove victory point
            if (item.history) {
                const vpList = item.history.victory_points;
                const vpIndex = vpList.findIndex(vp => vp._values.length >= 1 && vp._values[0] === province.toString());
                if (vpIndex !== -1) {
                    const vpItem = vpList[vpIndex];
                    if (vpItem._token?.start !== undefined && vpItem._valueEndToken?.end !== undefined) {
                        vp.text = text.substring(vpItem._token.start, vpItem._valueEndToken.end);
                        const start = document.positionAt(vpItem._token.start);
                        const end = document.positionAt(vpItem._valueEndToken.end + (text.charAt(vpItem._valueEndToken.end) === '\n' ? 1 : 0));
                        const range = new vscode.Range(start, end);
                        workspaceEdit.delete(document.uri, range);
                    }
                }
            }
        } else {
            // Add victory point
            if (!item.history) {
                workspaceEdit.insert(document.uri, endTokenStartPosition,
                    `${indent}history = {\n` +
                    `${indent}${indent}${vpText}\n` +
                    `${indent}}\n`);
            } else {
                const history = item.history;
                const lastVp = history.victory_points.length > 0 ? history.victory_points[history.victory_points.length - 1] : undefined;
                const insertPosition = lastVp?._valueEndToken?.end;
                if (insertPosition !== undefined) {
                    workspaceEdit.insert(document.uri, document.positionAt(insertPosition), `\n${indent}${indent}${vpText}`);
                } else {
                    const historyEndPosition = history._valueEndToken?.start !== undefined ? document.positionAt(history._valueEndToken.start).with({ character: 0 }) : undefined;
                    const insertPosition = historyEndPosition ?? endTokenStartPosition;
                    workspaceEdit.insert(document.uri, insertPosition, `${indent}${indent}${vpText}\n`);
                }
            }
        }
    }

    return true;
}

function detectIndent(text: string): string {
    const regex = /^([ \t]+)/gm;
    const detectedIndents: Record<string, number> = {};
    let match = regex.exec(text);
    while (match) {
        const indent = match[1];
        detectedIndents[indent] = (detectedIndents[indent] ?? 0) + 1;
        match = regex.exec(text);
    }

    for (const indent in detectedIndents) {
        for (const otherIndent in detectedIndents) {
            if (indent !== otherIndent && isMultipleOf(indent, otherIndent)) {
                detectedIndents[indent] += detectedIndents[otherIndent];
            }
        }
    }

    const sortedIndents = Object.entries(detectedIndents).sort((a, b) => b[1] - a[1]);
    if (sortedIndents.length > 0) {
        return sortedIndents[0][0];
    }

    return '\t';
}

function isMultipleOf(base: string, multiplied: string): boolean {
    if (base.length === 0) {
        return multiplied.length === 0;
    }

    if (multiplied.length % base.length !== 0) {
        return false;
    }

    const times = multiplied.length / base.length;
    for (let i = 0; i < times; i++) {
        if (multiplied.substring(i * base.length, (i + 1) * base.length) !== base) {
            return false;
        }
    }

    return true;
}
