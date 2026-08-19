import { CustomMap, DetailValue, Enum, HOIPartial, SchemaDef } from '../../../hoiformat/schema';
import { Country, CountryLabelsData } from '../definitions';
import { readFileFromModOrHOI4AsJson } from '../../../util/fileloader';
import { error } from '../../../util/debug';
import { convertColor, FileLoader, FolderLoader, Loader, LoadResult, LoadResultOD, mergeInLoadResult } from './common';
import { localize } from '../../../util/i18n';
import { LoaderSession } from '../../../util/loader/loader';
import { flatMap } from 'lodash';
import { localisationIndex } from '../../../indexing/localisationindex';
import * as path from 'path';
import { findCountryLocalisedName, getCountryLocalisationKeys } from './countrylocalisation';
import { loadMapFont } from './mapfont';

interface CountryTagsFile extends CustomMap<string> {
}

interface CountryFile {
    color: DetailValue<Enum>;
}

interface ColorsFile extends CustomMap<ColorForCountry> {
}

interface ColorForCountry {
    color: DetailValue<Enum>;
}

interface CountryHistoryFile {
    set_politics: CountryPolitics[];
    set_cosmetic_tag: string;
    set_autonomy: CountryAutonomy[];
}

interface CountryPolitics {
    ruling_party: string;
}

interface CountryAutonomy {
    target?: string;
    autonomous_state?: string;
}

const countryTagsFileSchema: SchemaDef<CountryTagsFile> = {
    _innerType: 'string',
    _type: 'map',
};

const countryFileSchema: SchemaDef<CountryFile> = {
    color: {
        _innerType: 'enum',
        _type: 'detailvalue',
    },
};

const colorsFileSchema: SchemaDef<ColorsFile> = {
    _innerType: {
        color: {
            _innerType: 'enum',
            _type: 'detailvalue',
        },
    },
    _type: 'map',
};

const countryHistoryFileSchema: SchemaDef<CountryHistoryFile> = {
    set_politics: {
        _innerType: {
            ruling_party: "string",
        },
        _type: "array",
    },
    set_cosmetic_tag: "string",
    set_autonomy: {
        _innerType: {
            target: "string",
            autonomous_state: "string",
        },
        _type: "array",
    },
};

type Tag = { tag: string, file: string };
type CountryHistory = {
    tag: string,
    rulingParty?: string,
    cosmeticTag?: string,
    autonomies: CountryAutonomy[],
};

export class CountriesLoader extends Loader<Country[]> {
    private countryTagsLoader: CountryTagsLoader;
    private countryLoaders: Record<string, CountryLoader> = {};
    private colorsLoader: ColorsLoader;

    constructor() {
        super();
        this.countryTagsLoader = new CountryTagsLoader();
        this.colorsLoader = new ColorsLoader();
        this.countryTagsLoader.onProgress(e => this.onProgressEmitter.fire(e));
        this.colorsLoader.onProgress(e => this.onProgressEmitter.fire(e));
    }

    public async shouldReloadImpl(session: LoaderSession): Promise<boolean> {
        if (await this.countryTagsLoader.shouldReload(session) || await this.colorsLoader.shouldReload(session)) {
            return true;
        }

        return (await Promise.all(Object.values(this.countryLoaders).map(l => l.shouldReload(session)))).some(v => v);
    }

    protected async loadImpl(session: LoaderSession): Promise<LoadResult<Country[]>> {
        this.fireOnProgressEvent(localize('worldmap.progress.loadingcountries', 'Loading countries...'));

        const tagsResult = await this.countryTagsLoader.load(session);
        const countryTags = tagsResult.result;
        const countryResultPromises: Promise<LoadResult<Country | undefined>>[] = [];
        const newCountryLoaders: Record<string, CountryLoader> = {};

        for (const tag of countryTags) {
            let countryLoader = this.countryLoaders[tag.tag];
            if (!countryLoader) {
                countryLoader = new CountryLoader(tag.tag, 'common/' + tag.file);
                countryLoader.disableTelemetry = true;
                countryLoader.onProgress(e => this.onProgressEmitter.fire(e));
            }

            countryResultPromises.push(countryLoader.load(session));
            newCountryLoaders[tag.tag] = countryLoader;
        }

        this.countryLoaders = newCountryLoaders;

        const countriesResult = await Promise.all(countryResultPromises);
        const colorsFileResult = await this.colorsLoader.load(session);

        const countries = countriesResult.map(r => r.result).filter((c): c is Country => c !== undefined);

        applyColorFromColorTxt(countries, colorsFileResult.result);

        const allResults = [tagsResult, colorsFileResult, ...countriesResult];

        return {
            result: countries,
            dependencies: mergeInLoadResult(allResults, 'dependencies'),
            warnings: mergeInLoadResult(allResults, 'warnings'),
        };
    }

    protected extraMesurements(result: LoadResult<Country[]>) {
        return { ...super.extraMesurements(result), fileCount: Object.keys(this.countryLoaders).length };
    }

    public toString() {
        return '[CountriesLoader]';
    }
}

export class CountryLabelsLoader extends Loader<CountryLabelsData> {
    private countryHistoryLoader = new CountryHistoryLoader();

    constructor(private countriesLoader: CountriesLoader) {
        super();
        this.countryHistoryLoader.onProgress(e => this.onProgressEmitter.fire(e));
    }

    public async shouldReloadImpl(session: LoaderSession): Promise<boolean> {
        return await this.countriesLoader.shouldReload(session) || await this.countryHistoryLoader.shouldReload(session);
    }

    protected async loadImpl(session: LoaderSession): Promise<LoadResult<CountryLabelsData>> {
        const countriesResult = await this.countriesLoader.load(session);
        session.throwIfCancelled();
        const countryHistoryResult = await this.countryHistoryLoader.load(session);
        session.throwIfCancelled();

        const countries = countriesResult.result.map(country => ({ ...country }));
        applyLocalisedNames(countries, countryHistoryResult.result);
        const mapFontResult = await loadMapFont(countries.map(country => country.localisedName)
            .filter((name): name is string => !!name));
        session.throwIfCancelled();

        const results = [countriesResult, countryHistoryResult, mapFontResult];
        return {
            result: {
                countryNames: Object.fromEntries(countries
                    .filter((country): country is Country & { localisedName: string } => !!country.localisedName)
                    .map(country => [country.tag, country.localisedName])),
                mapFont: mapFontResult.result,
            },
            dependencies: mergeInLoadResult(results, 'dependencies'),
            warnings: mergeInLoadResult(results, 'warnings'),
        };
    }

    public toString() {
        return '[CountryLabelsLoader]';
    }
}

class CountryLoader extends FileLoader<Country | undefined> {
    constructor(private tag: string, file: string) {
        super(file);
    }

    protected async loadFromFile(): Promise<LoadResultOD<Country | undefined>> {
        return { result: await loadCountry(this.tag, this.file), warnings: [] };
    }

    public toString() {
        return `[CountryLoader: ${this.file}]`;
    }
}

class CountryTagsLoader extends FolderLoader<Tag[], Tag[]> {
    constructor() {
        super('common/country_tags', CountryTagLoader);
    }

    protected mergeFiles(fileResults: LoadResult<Tag[]>[]): Promise<LoadResult<Tag[]>> {
        return Promise.resolve<LoadResult<Tag[]>>({
            result: flatMap(fileResults, r => r.result),
            dependencies: [this.folder + '/*'],
            warnings: mergeInLoadResult(fileResults, 'warnings'),
        });
    }

    public toString() {
        return `[CountryTagsLoader]`;
    }
}

class CountryTagLoader extends FileLoader<Tag[]> {
    protected async loadFromFile(): Promise<LoadResultOD<Tag[]>> {
        return { result: await loadCountryTags(this.file), warnings: [] };
    }

    public toString() {
        return `[CountryTagLoader: ${this.file}]`;
    }
}

class ColorsLoader extends FileLoader<HOIPartial<ColorsFile>> {
    constructor() {
        super('common/countries/colors.txt');
    }

    protected async loadFromFile(): Promise<LoadResultOD<HOIPartial<ColorsFile>>> {
        try {
            return {
                result: await readFileFromModOrHOI4AsJson<ColorsFile>(this.file, colorsFileSchema),
                warnings: [],
            };
        } catch(e) {
            error(e);
            return {
                result: { _map: {}, _token: undefined },
                warnings: [],
            };
        }
    }

    public toString() {
        return `[Colors]`;
    }
}

class CountryHistoryLoader extends FolderLoader<CountryHistory[], CountryHistory | undefined> {
    constructor() {
        super('history/countries', CountryHistoryFileLoader);
    }

    protected mergeFiles(fileResults: LoadResult<CountryHistory | undefined>[]): Promise<LoadResult<CountryHistory[]>> {
        return Promise.resolve({
            result: fileResults.map(result => result.result).filter((history): history is CountryHistory => history !== undefined),
            dependencies: [this.folder + '/*'],
            warnings: mergeInLoadResult(fileResults, 'warnings'),
        });
    }

    public toString() {
        return `[CountryHistoryLoader]`;
    }
}

class CountryHistoryFileLoader extends FileLoader<CountryHistory | undefined> {
    protected async loadFromFile(): Promise<LoadResultOD<CountryHistory | undefined>> {
        return { result: await loadCountryHistory(this.file), warnings: [] };
    }

    public toString() {
        return `[CountryHistoryFileLoader: ${this.file}]`;
    }
}

async function loadCountryTags(countryTagsFile: string): Promise<Tag[]> {
    try {
        const data = await readFileFromModOrHOI4AsJson<CountryTagsFile>(countryTagsFile, countryTagsFileSchema);
        const result: { tag: string, file: string }[] = [];

        for (const tag of Object.values(data._map)) {
            if (!tag._value || tag._key === 'dynamic_tags') {
                continue;
            }
            result.push({
                tag: tag._key,
                file: tag._value,
            });
        }

        return result;
    } catch (e) {
        error(e);
        return [];
    }
}

async function loadCountry(tag: string, countryFile: string): Promise<Country | undefined> {
    try {
        const data = await readFileFromModOrHOI4AsJson<CountryFile>(countryFile, countryFileSchema);

        return {
            tag,
            color: convertColor(data.color),
            localisedName: localisationIndex.get(tag)?.value,
            file: countryFile,
        };
    } catch (e) {
        error(e);
        return undefined;
    }
}

async function loadCountryHistory(file: string): Promise<CountryHistory | undefined> {
    try {
        const tag = path.basename(file, path.extname(file)).match(/^[A-Za-z0-9_]+/)?.[0];
        if (!tag) {
            return undefined;
        }

        const data = await readFileFromModOrHOI4AsJson<CountryHistoryFile>(file, countryHistoryFileSchema);
        const politics = data.set_politics?.filter(value => !!value.ruling_party).pop();
        return {
            tag,
            rulingParty: politics?.ruling_party,
            cosmeticTag: data.set_cosmetic_tag || undefined,
            autonomies: data.set_autonomy ?? [],
        };
    } catch (e) {
        error(e);
        return undefined;
    }
}

function applyLocalisedNames(countries: Country[], countryHistories: CountryHistory[]): void {
    const histories = new Map(countryHistories.map(history => [history.tag, history]));
    const autonomies = new Map<string, { overlord: string, autonomousState: string }>();
    for (const history of countryHistories) {
        for (const autonomy of history.autonomies) {
            if (autonomy.target && autonomy.autonomous_state) {
                autonomies.set(autonomy.target, { overlord: history.tag, autonomousState: autonomy.autonomous_state });
            }
        }
    }

    for (const country of countries) {
        const history = histories.get(country.tag);
        const keys = getCountryLocalisationKeys(country.tag, history?.rulingParty, history?.cosmeticTag, autonomies.get(country.tag));
        country.localisedName = findCountryLocalisedName(keys, key => localisationIndex.getLocalisedText(key)) ?? country.localisedName;
    }
}

async function applyColorFromColorTxt(countries: Country[], colorsFile: HOIPartial<ColorsFile>): Promise<void> {
    for (const country of countries) {
        const colorIncolors = colorsFile._map[country.tag];
        if (colorIncolors?._value.color) {
            country.color = convertColor(colorIncolors?._value.color);
        }
    }
}
