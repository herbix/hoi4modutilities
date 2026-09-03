import * as assert from 'assert';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { contextContainer } from '../../../src/context';
import * as fileloader from '../../../src/util/fileloader';
import { IndexBase } from '../../../src/indexing/indexbase';
import { IndexType } from '../../../src/indexing/indexmanager';

class TestIndex extends IndexBase<string> {
    public type: IndexType = 'gfx';
    public buildCount = 0;
    public relatedFiles: string[] = [];

    public includesFile(_: vscode.Uri): boolean {
        return false;
    }

    public addWorkspaceIndex(_: vscode.Uri): void {
    }

    public removeWorkspaceIndex(_: vscode.Uri): void {
    }

    public getGlobalIndex(): Map<string, string> {
        return this.globalIndex;
    }

    protected async buildIndex(
        index: Map<string, string>,
        _: [number],
        options: { mod?: boolean; hoi4?: boolean; dlc?: boolean }): Promise<void> {
        this.buildCount++;
        const source = options.hoi4 === false ? 'dlc' : 'base';
        index.set(source, `${source}-value`);
    }

    protected async getFiles(_: { mod?: boolean; hoi4?: boolean; dlc?: boolean }): Promise<string[]> {
        return this.relatedFiles;
    }

    protected validateIndexValue(value: unknown): value is string {
        return typeof value === 'string';
    }
}

suite('IndexBase', () => {
    let previousContext: vscode.ExtensionContext | null;
    let storagePath: string;

    setup(async () => {
        previousContext = contextContainer.current;
        storagePath = await fs.mkdtemp(path.join(os.tmpdir(), 'hoi4modutilities-index-'));
        contextContainer.current = { globalStorageUri: vscode.Uri.file(storagePath) } as vscode.ExtensionContext;
    });

    teardown(async () => {
        sinon.restore();
        contextContainer.current = previousContext;
        await fs.rm(storagePath, { recursive: true, force: true });
    });

    test('saves and loads the global index from extension global storage', async () => {
        const builtIndex = new TestIndex();
        await builtIndex.buildGlobalIndex();

        assert.strictEqual(builtIndex.buildCount, 2);
        const cachedIndexPath = path.join(storagePath, 'index', 'gfx.json');
        assert.deepStrictEqual(
            JSON.parse(await fs.readFile(cachedIndexPath, 'utf-8')),
            [['base', 'base-value'], ['dlc', 'dlc-value']]);

        const cachedIndex = new TestIndex();
        const globalIndex = cachedIndex.getGlobalIndex();
        await cachedIndex.buildGlobalIndex();

        assert.strictEqual(cachedIndex.buildCount, 0);
        assert.strictEqual(cachedIndex.getGlobalIndex(), globalIndex);
        assert.strictEqual(cachedIndex.get('base'), 'base-value');
        assert.strictEqual(cachedIndex.get('dlc'), 'dlc-value');
    });

    test('rebuilds an invalid cached global index', async () => {
        const indexDirectoryPath = path.join(storagePath, 'index');
        await fs.mkdir(indexDirectoryPath);
        await fs.writeFile(path.join(indexDirectoryPath, 'gfx.json'), 'invalid');

        const index = new TestIndex();
        await index.buildGlobalIndex();

        assert.strictEqual(index.buildCount, 2);
        assert.strictEqual(index.get('base'), 'base-value');
        assert.strictEqual(index.get('dlc'), 'dlc-value');
    });

    test('rebuilds a cached global index containing an invalid value', async () => {
        const indexDirectoryPath = path.join(storagePath, 'index');
        await fs.mkdir(indexDirectoryPath);
        await fs.writeFile(path.join(indexDirectoryPath, 'gfx.json'), JSON.stringify([['key', 1]]));

        const index = new TestIndex();
        await index.buildGlobalIndex();

        assert.strictEqual(index.buildCount, 2);
        assert.strictEqual(index.get('base'), 'base-value');
        assert.strictEqual(index.get('dlc'), 'dlc-value');
    });

    test('rebuilds when a global index source file is newer than the cache', async () => {
        await new TestIndex().buildGlobalIndex();

        const sourcePath = path.join(storagePath, 'source.gfx');
        await fs.writeFile(sourcePath, 'source');
        const newerTime = new Date(Date.now() + 10000);
        await fs.utimes(sourcePath, newerTime, newerTime);
        sinon.stub(fileloader, 'getFilePathFromModOrHOI4').resolves(vscode.Uri.file(sourcePath));

        const index = new TestIndex();
        index.relatedFiles = ['interface/source.gfx'];
        await index.buildGlobalIndex();

        assert.strictEqual(index.buildCount, 2);
    });
});
