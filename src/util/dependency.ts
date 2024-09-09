import * as vscode from "vscode";
import { Commands, ContextName } from "../constants";
import { sendEvent } from "./telemetry";
import { localize } from "./i18n";
import { contextContainer } from "../context";
import { error } from "./debug";
import { getHoiOpenedFileOriginalUri, listFilesFromModOrHOI4, readFileFromModOrHOI4 } from "./fileloader";
import { parseHoi4File } from "../hoiformat/hoiparser";
import { getEvents, HOIEvents, HOIEvent } from "../previewdef/event/schema";
import { getLanguageIdInYml, getRelativePathInWorkspace, isSameUri } from "./vsccommon";
import { flatMap, flatten } from "lodash";
import { parseYaml } from "./yaml";

export type Dependency = { type: string, path: string };

export function getDependenciesFromText(text: string): Dependency[] {
    const dependencies: Dependency[] = [];
    const regex = /^\s*#!(?<type>.*?):(?<path>.*\.(?<ext>.*?))$/gm;
    let match = regex.exec(text);
    while (match) {
        const type = match.groups?.type;
        const ext = match.groups?.ext!;
        if (type && (type === ext || ext === 'txt' || ext === 'yml')) {   
            const path = match.groups?.path!;
            const pathValue = path.trim().replace(/\/\/+|\\+/g, '/');

            dependencies.push({ type, path: pathValue });
        }

        match = regex.exec(text);
    }

    return dependencies;
}

export function registerScanReferencesCommand(): vscode.Disposable {
    return vscode.commands.registerCommand(Commands.ScanReferences, scanReferences);
}

async function scanReferences(): Promise<void> {
    sendEvent('scanReferences');

    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showErrorMessage(localize('scanref.noeditor', 'No opened editor.'));
        return;
    }

    try {
        if (contextContainer.contextValue[ContextName.Hoi4PreviewType] === 'event') {
            await scanReferencesForEvents(editor);
            vscode.window.showInformationMessage(localize('scanref.done', 'Scan reference done.'));
        } else {
            vscode.window.showErrorMessage(localize('scanref.unsupportedtype', 'Unsupported file type to scan references.'));
        }
    } catch (e) {
        error(e);
    }
}

async function scanReferencesForEvents(editor: vscode.TextEditor) {
    const eventFiles = await listFilesFromModOrHOI4('events');
    const document = editor.document;
    const events = (await Promise.all(eventFiles.map(async (file) => {
        try {
            const filePath = 'events/' + file;
            const [buffer, realPath] = await readFileFromModOrHOI4(filePath);
            const realPathUri = getHoiOpenedFileOriginalUri(realPath);
            if (isSameUri(document.uri, realPathUri)) {
                return undefined;
            }
            return getEvents(parseHoi4File(buffer.toString()), filePath);
        } catch (e) {
            return undefined;
        }
    }))).filter((e): e is HOIEvents => e !== undefined);
    
    if (document.isClosed) {
        return;
    }

    const eventItems = flatMap(events, e => flatten(Object.values(e.eventItemsByNamespace)));
    const includedEventFiles: string[] = [];

    const relativePath = getRelativePathInWorkspace(document.uri);
    const content = document.getText();
    const mainEvents = flatten(Object.values(getEvents(parseHoi4File(content), relativePath).eventItemsByNamespace));
    const searchingEvents: HOIEvent[] = [...mainEvents];

    const searched: Record<string, boolean> = {};
    const searchedEvents: HOIEvent[] = [];
    const childrenById: Record<string, string[]> = {};
    [...eventItems, ...mainEvents].forEach(event => {
        childrenById[event.id] = flatMap([event.immediate, ...event.options], o => o.childEvents).map(ce => ce.eventName);
    });

    while (searchingEvents.length > 0) {
        const event = searchingEvents.pop()!;
        const children = childrenById[event.id];
        eventItems.forEach(ei => {
            if (searched[ei.id]) {
                return;
            }
            if (children.includes(ei.id)) {
                searchingEvents.push(ei);
                if (!includedEventFiles.includes(ei.file)) {
                    includedEventFiles.push(ei.file);
                }
            }
            const eiChildren = childrenById[ei.id];
            if (eiChildren.includes(event.id)) {
                searchingEvents.push(ei);
                if (!includedEventFiles.includes(ei.file)) {
                    includedEventFiles.push(ei.file);
                }
            }
        });

        searched[event.id] = true;
        searchedEvents.push(event);
    }
    
    if (document.isClosed) {
        return;
    }

    const existingDependency = getDependenciesFromText(document.getText());
    const existingEventDependency = existingDependency.filter(d => d.type === 'event').map(d => d.path.replace(/\\+/g, '/'));
    existingEventDependency.push(relativePath);
    const moreEventDependencyContent = includedEventFiles.filter(f => !existingEventDependency.includes(f)).map(f => `#!event:${f}\n`).join('');

    const localizationFiles = await listFilesFromModOrHOI4('localisation');
    const language = getLanguageIdInYml();
    const localizations = (await Promise.all(localizationFiles.map(async (file) => {
        try {
            const filePath = 'localisation/' + file;
            const [buffer, realPath] = await readFileFromModOrHOI4(filePath);
            const realPathUri = getHoiOpenedFileOriginalUri(realPath);
            if (isSameUri(document.uri, realPathUri)) {
                return undefined;
            }
            return { file: filePath, result: parseYaml(buffer.toString()) };
        } catch (e) {
            return undefined;
        }
    }))).filter((e): e is { file: string, result: Record<string, Record<string, string>> } =>
        e !== undefined && e.result !== undefined && typeof e.result[language] === 'object' && !Array.isArray(e.result[language])
    );
    
    const existingLocalizationDependency = existingDependency.filter(d => d.type.match(/^locali[zs]ation$/)).map(d => d.path.replace(/\\+/g, '/'));
    const moreLocalizationDependencyContent = localizations.filter(lf => {
        if (existingLocalizationDependency.includes(lf.file)) {
            return false;
        }
        for (const event of searchedEvents) {
            if ([event.title, ...event.options.map(o => o.name)].some(n => n && n in lf.result[language])) {
                return true;
            }
        }
        return false;
    }).map(lf => `#!localisation:${lf.file}\n`).join('');

    if (document.isClosed) {
        return;
    }

    await editor.edit(eb => {
        eb.insert(new vscode.Position(0, 0), moreEventDependencyContent + moreLocalizationDependencyContent);
    });
}
