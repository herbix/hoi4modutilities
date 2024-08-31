import * as vscode from 'vscode';
import * as path from 'path';
import {debounceByInput} from './common';
import {localisationIndex} from './featureflags';
import {listFilesFromModOrHOI4, readFileFromModOrHOI4} from './fileloader';
import {localize} from './i18n';
import {sendEvent} from './telemetry';
import Logger from "./logger";
import * as yaml from 'js-yaml';
import {YAMLException} from "js-yaml"; // 使用 js-yaml 代替 yaml

type LocalisationData = Record<string, Record<string, string>>;

const globalLocalisationIndex: LocalisationData = {};
let workspaceLocalisationIndex: LocalisationData = {};

// 语言代码到yml文件语言后缀的映射
const localeMapping: Record<string, string> = {
    'en': 'l_english',
    'pt-br': 'l_braz_por',
    'de': 'l_german',
    'fr': 'l_french',
    'es': 'l_spanish',
    'pl': 'l_polish',
    'ru': 'l_russian',
    'ja': 'l_japanese',
    'zh-cn': 'l_simp_chinese',
};

// 配置语言到语言代码的映射
const localeISOMapping: Record<string, string> = {
    ['Brazilian Portuguese']: 'pt-br',
    English: 'en',
    French: 'fr',
    German: 'de',
    Japanese: 'ja',
    Polish: 'pl',
    Russian: 'ru',
    ['Simplified Chinese']: 'zh-cn',
    Spanish: 'es',
};

export function registerLocalisationIndex(): vscode.Disposable {
    const disposables: vscode.Disposable[] = [];
    if (localisationIndex) {
        const estimatedSize: [number] = [0];
        const task = Promise.all([
            buildGlobalLocalisationIndex(estimatedSize),
            buildWorkspaceLocalisationIndex(estimatedSize)
        ]);
        vscode.window.setStatusBarMessage('$(loading~spin) ' + localize('localisationIndex.building', 'Building Localisation index...'), task);
        task.then(() => {
            vscode.window.showInformationMessage(localize('localisationIndex.builddone', 'Building Localisation index done.'));
            sendEvent('localisationIndex', {size: estimatedSize[0].toString()});
        });
        disposables.push(vscode.workspace.onDidChangeWorkspaceFolders(onChangeWorkspaceFolders));
        disposables.push(vscode.workspace.onDidChangeTextDocument(onChangeTextDocument));
        disposables.push(vscode.workspace.onDidCloseTextDocument(onCloseTextDocument));
        disposables.push(vscode.workspace.onDidCreateFiles(onCreateFiles));
        disposables.push(vscode.workspace.onDidDeleteFiles(onDeleteFiles));
        disposables.push(vscode.workspace.onDidRenameFiles(onRenameFiles));
    }

    return vscode.Disposable.from(...disposables);
}

export async function getLocalisedTextQuick(localisationKey: string | undefined): Promise<string | undefined> {
    const previewLocalisation = vscode.workspace.getConfiguration('hoi4ModUtilities').previewLocalisation;
    if (previewLocalisation){
        return getLocalisedText(localisationKey, localeISOMapping[previewLocalisation]?? vscode.env.language);
    }
    return getLocalisedText(localisationKey, vscode.env.language);
}

export async function getLocalisedText(localisationKey: string | undefined, language: string): Promise<string | undefined> {
    if (!localisationKey) {
        return localisationKey;
    }

    if (!localisationIndex) {
        return localisationKey ?? '';
    }

    const langKey = localeMapping[language.toLowerCase()] || 'l_english'; // 使用映射获取语言后缀
    const defaultLangKey = 'l_english';

    let text = globalLocalisationIndex[langKey]?.[localisationKey] ||
        workspaceLocalisationIndex[langKey]?.[localisationKey];

    if (!text) {
        text = globalLocalisationIndex[defaultLangKey]?.[localisationKey] ||
            workspaceLocalisationIndex[defaultLangKey]?.[localisationKey];
    }

    return text ?? localisationKey;
}

async function buildGlobalLocalisationIndex(estimatedSize: [number]): Promise<void> {
    const options = {mod: false, hoi4: true, recursively: true};
    const localisationFiles = (await listFilesFromModOrHOI4('localisation', options)).filter(f => /.*_(l_english|l_braz_por|l_german|l_french|l_spanish|l_polish|l_russian|l_japanese|l_simp_chinese)\.yml$/i.test(f));
    await Promise.all(localisationFiles.map(f => fillLocalisationItems('localisation/' + f, globalLocalisationIndex, options, estimatedSize)));
}

async function buildWorkspaceLocalisationIndex(estimatedSize: [number]): Promise<void> {
    const options = {mod: true, hoi4: false, recursively: true};
    const localisationFiles = (await listFilesFromModOrHOI4('localisation', options)).filter(f => /.*_(l_english|l_braz_por|l_german|l_french|l_spanish|l_polish|l_russian|l_japanese|l_simp_chinese)\.yml$/i.test(f));
    await Promise.all(localisationFiles.map(f => fillLocalisationItems('localisation/' + f, workspaceLocalisationIndex, options, estimatedSize)));
}

async function fillLocalisationItems(localisationFile: string, localisationIndex: LocalisationData, options: {
    mod?: boolean,
    hoi4?: boolean
}, estimatedSize?: [number]): Promise<void> {
    const [fileBuffer, uri] = await readFileFromModOrHOI4(localisationFile, options);
    const processedContent = preprocessYamlContent(fileBuffer.toString());
    try {
        const localisations = parseLocalisationFile(processedContent);
        for (const langKey in localisations) {
            if (!localisationIndex[langKey]) {
                localisationIndex[langKey] = {};
            }

            Object.assign(localisationIndex[langKey], localisations[langKey]);

            if (estimatedSize) {
                estimatedSize[0] += Object.keys(localisations[langKey]).reduce((sum, key) => sum + key.length + localisations[langKey][key].length, 0);
            }
        }
    } catch (e) {
        console.log(localisationFile);
        console.log(processedContent);
        console.error(e);

        const baseMessage = options.hoi4
            ? localize('localisationIndex.vanilla','[Vanilla]')
            : localize('localisationIndex.mod','[mod]');

        const failureMessage = localize('localisationIndex.parseFailure','parsing failed! Please check if the file has issues!');

        if (e instanceof YAMLException) {
            Logger.error(`${baseMessage} ${localisationFile} ${failureMessage}\n${e.message}`);
        } else {
            Logger.error(`${baseMessage} ${localisationFile} ${failureMessage}`);
        }
    }
}

function preprocessYamlContent(fileContent: string): string {
    const lines = fileContent.split(/\r?\n/);

    // Filter out any lines that start with #, regardless of leading spaces
    const filteredLines = lines.filter(line =>
        !/^\s*#/.test(line)
    );

    const header = filteredLines.length > 0 ? filteredLines[0].replace(/^\s+/, '') : '';
    // Can't the god damn Paradox employees and modders just write standard localization yml files?
    const processedLines = filteredLines.slice(1).map(line => {
        return ' ' + line
            .replace(/\n/g, 'YAMLParsingLFReplacement')
            .replace(
                /^\s*([^:]+):\s*\d*\s*"((?:[^"#\\]|\\.)*)".*?(?=#|$)/,
                (match, p1, p2) => {
                    // Replace unescaped quotes with escaped ones
                    const escapedContent = p2.replace(/(?<!\\)"/g, '\\"');
                    return `${p1}: "${escapedContent}"`;
                }
            )
            .replace(/:(\d+)(?=[^"]*")/, ':')
            .replace(/^\s+/, '');
    }).filter(line =>
        line.trim() !== ''
    );

    return [header, ...processedLines].join('\n');
}

function parseLocalisationFile(fileContent: string): Record<string, Record<string, string>> {
    const result: Record<string, Record<string, string>> = {};

    const parsed = yaml.load(fileContent, {schema: yaml.JSON_SCHEMA, json: true}) as Record<string, any>;

    for (const langKey in parsed) {
        if (langKey.startsWith('l_')) {
            result[langKey] = result[langKey] || {};
            const entries = parsed[langKey] as Record<string, string>;

            for (const key in entries) {
                // 将自定义字符串替换回换行符
                result[langKey][key] = entries[key].replace(/YAMLParsingLFReplacement/g, '\n');
            }
        }
    }

    return result;
}

function onChangeWorkspaceFolders(_: vscode.WorkspaceFoldersChangeEvent) {
    workspaceLocalisationIndex = {};
    const estimatedSize: [number] = [0];
    const task = buildWorkspaceLocalisationIndex(estimatedSize);
    vscode.window.setStatusBarMessage('$(loading~spin) ' + localize('localisationIndex.workspace.building', 'Building workspace Localisation index...'), task);
    task.then(() => {
        vscode.window.showInformationMessage(localize('localisationIndex.workspace.builddone', 'Building workspace Localisation index done.'));
        sendEvent('localisationIndex.workspace', {size: estimatedSize[0].toString()});
    });
}

function onChangeTextDocument(e: vscode.TextDocumentChangeEvent) {
    const file = e.document.uri;
    if (file.path.endsWith('.yml')) {
        onChangeTextDocumentImpl(file);
    }
}

const onChangeTextDocumentImpl = debounceByInput(
    (file: vscode.Uri) => {
        removeWorkspaceLocalisationIndex(file);
        addWorkspaceLocalisationIndex(file);
    },
    file => file.toString(),
    1000,
    {trailing: true}
);

function onCloseTextDocument(document: vscode.TextDocument) {
    const file = document.uri;
    if (file.path.endsWith('.yml')) {
        removeWorkspaceLocalisationIndex(file);
        addWorkspaceLocalisationIndex(file);
    }
}

function onCreateFiles(e: vscode.FileCreateEvent) {
    for (const file of e.files) {
        if (file.path.endsWith('.yml')) {
            addWorkspaceLocalisationIndex(file);
        }
    }
}

function onDeleteFiles(e: vscode.FileDeleteEvent) {
    for (const file of e.files) {
        if (file.path.endsWith('.yml')) {
            removeWorkspaceLocalisationIndex(file);
        }
    }
}

function onRenameFiles(e: vscode.FileRenameEvent) {
    onDeleteFiles({files: e.files.map(f => f.oldUri)});
    onCreateFiles({files: e.files.map(f => f.newUri)});
}

function removeWorkspaceLocalisationIndex(file: vscode.Uri) {
    const wsFolder = vscode.workspace.getWorkspaceFolder(file);
    if (wsFolder) {
        const relative = path.relative(wsFolder.uri.path, file.path).replace(/\\+/g, '/');
        if (relative && relative.startsWith('localisation/')) {
            const langKey = getLangKeyFromPath(relative);
            delete workspaceLocalisationIndex[langKey];
        }
    }
}

function addWorkspaceLocalisationIndex(file: vscode.Uri) {
    const wsFolder = vscode.workspace.getWorkspaceFolder(file);
    if (wsFolder) {
        const relative = path.relative(wsFolder.uri.path, file.path).replace(/\\+/g, '/');
        if (relative && relative.startsWith('localisation/')) {
            fillLocalisationItems(relative, workspaceLocalisationIndex, {hoi4: false});
        }
    }
}

function getLangKeyFromPath(filePath: string): string {
    const match = filePath.match(/.*_(l_english|l_braz_por|l_german|l_french|l_spanish|l_polish|l_russian|l_japanese|l_simp_chinese)\.yml$/i);
    return match ? match[1] : 'l_english';
}