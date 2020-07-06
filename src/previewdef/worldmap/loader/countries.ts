import { CustomMap, DetailValue, Enum, SchemaDef, HOIPartial } from "../../../hoiformat/schema";
import { Country } from "../definitions";
import { readFileFromModOrHOI4AsJson } from "../../../util/fileloader";
import { error } from "../../../util/debug";
import { FolderLoader, FileLoader, Loader, LoadResult, LoadResultOD, mergeInLoadResult, convertColor } from "./common";
import { localize } from "../../../util/i18n";
import { LoaderSession } from "../../../util/loader/loader";
import { flatMap } from "lodash";

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

const countryTagsFileSchema: SchemaDef<CountryTagsFile> = {
    _innerType: "string",
    _type: "map",
};

const countryFileSchema: SchemaDef<CountryFile> = {
    color: {
        _innerType: "enum",
        _type: "detailvalue",
    },
};

const colorsFileSchema: SchemaDef<ColorsFile> = {
    _innerType: {
        color: {
            _innerType: "enum",
            _type: "detailvalue",
        },
    },
    _type: "map",
};

type Tag = { tag: string, file: string };

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

    public toString() {
        return '[CountriesLoader]';
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

async function loadCountryTags(countryTagsFile: string): Promise<Tag[]> {
    try {
        const data = await readFileFromModOrHOI4AsJson<CountryTagsFile>(countryTagsFile, countryTagsFileSchema);
        const result: { tag: string, file: string }[] = [];

        for (const tag of Object.values(data._map)) {
            if (!tag._value) {
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
        };
    } catch (e) {
        error(e);
        return undefined;
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
