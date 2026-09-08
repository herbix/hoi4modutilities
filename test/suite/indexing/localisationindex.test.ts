import * as assert from 'assert';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { contextContainer } from '../../../src/context';
import * as fileloader from '../../../src/util/fileloader';
import * as vsccommon from '../../../src/util/vsccommon';
import { localisationIndex } from '../../../src/indexing/localisationindex';

suite('LocalisationIndex', () => {
    let previousContext: vscode.ExtensionContext | null;
    let storagePath: string;

    setup(async () => {
        previousContext = contextContainer.current;
        storagePath = await fs.mkdtemp(path.join(os.tmpdir(), 'hoi4modutilities-localisation-index-'));
        contextContainer.current = { globalStorageUri: vscode.Uri.file(storagePath) } as vscode.ExtensionContext;
        localisationIndex.clearIndex();
        sinon.stub(fileloader, 'listFilesFromModOrHOI4').resolves([]);
    });

    teardown(async () => {
        sinon.restore();
        localisationIndex.clearIndex();
        contextContainer.current = previousContext;
        await fs.rm(storagePath, { recursive: true, force: true });
    });

    test('writes localisation metadata alongside the cached global index', async () => {
        sinon.stub(vsccommon, 'getLanguageIdInYml').returns('l_english');

        await localisationIndex.buildGlobalIndex();

        const metadataPath = path.join(storagePath, 'index', 'localisation-metadata.json');
        assert.deepStrictEqual(
            JSON.parse(await fs.readFile(metadataPath, 'utf-8')),
            { languageId: 'l_english' });
    });

    test('rebuilds the cached global index when the language ID differs', async () => {
        const indexDirectoryPath = path.join(storagePath, 'index');
        await fs.mkdir(indexDirectoryPath);
        await fs.writeFile(
            path.join(indexDirectoryPath, 'localisation.json'),
            JSON.stringify([['cached', { file: 'localisation/english.yml', value: 'English' }]]));
        await fs.writeFile(
            path.join(indexDirectoryPath, 'localisation-metadata.json'),
            JSON.stringify({ languageId: 'l_english' }));
        sinon.stub(vsccommon, 'getLanguageIdInYml').returns('l_german');

        await localisationIndex.buildGlobalIndex();

        assert.strictEqual(localisationIndex.get('cached'), undefined);
        assert.deepStrictEqual(
            JSON.parse(await fs.readFile(path.join(indexDirectoryPath, 'localisation.json'), 'utf-8')),
            []);
        assert.strictEqual(
            JSON.parse(await fs.readFile(path.join(indexDirectoryPath, 'localisation-metadata.json'), 'utf-8')).languageId,
            'l_german');
    });
});
