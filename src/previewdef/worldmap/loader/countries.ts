import { CustomMap, Attachment, Enum, SchemaDef, HOIPartial } from "../../../hoiformat/schema";
import { Country, ProgressReporter, Warning } from "../definitions";
import { readFileFromModOrHOI4AsJson } from "../../../util/fileloader";
import { error } from "../../../util/debug";
import { FolderLoader, FileLoader, Loader, LoadResult, mergeInLoadResult, convertColor } from "./common";

interface CountryTagsFile extends CustomMap<string> {
}

interface CountryFile {
    color: Attachment<Enum>;
}

interface ColorsFile extends CustomMap<ColorForCountry> {
}

interface ColorForCountry {
    color: Attachment<Enum>;
}

const countryTagsFileSchema: SchemaDef<CountryTagsFile> = {
    _innerType: "string",
    _type: "map",
};

const countryFileSchema: SchemaDef<CountryFile> = {
    color: {
        _innerType: "enum",
        _type: "attachment",
    },
};

const colorsFileSchema: SchemaDef<ColorsFile> = {
    _innerType: {
        color: {
            _innerType: "enum",
            _type: "attachment",
        },
    },
    _type: "map",
};

type Tag = { tag: string, file: string };

export class CountriesLoader extends Loader<Country[]> {
    private countryTagsLoader: CountryTagsLoader;
    private countryLoaders: Record<string, CountryLoader> = {};
    private colorsLoader: ColorsLoader;

    constructor(progressReporter: ProgressReporter) {
        super(progressReporter);
        this.countryTagsLoader = new CountryTagsLoader(progressReporter);
        this.colorsLoader = new ColorsLoader(progressReporter);
    }

    public async shouldReloadImpl(): Promise<boolean> {
        if (await this.countryTagsLoader.shouldReload() || await this.colorsLoader.shouldReload()) {
            return true;
        }

        return (await Promise.all(Object.values(this.countryLoaders).map(l => l.shouldReload()))).some(v => v);
    }

    protected async loadImpl(force: boolean): Promise<LoadResult<Country[]>> {
        const tagsResult = await this.countryTagsLoader.load(force);
        const countryTags = tagsResult.result;
        const countryResultPromises: Promise<LoadResult<Country | undefined>>[] = [];
        const newCountryLoaders: Record<string, CountryLoader> = {};

        for (const tag of countryTags) {
            let countryLoader = this.countryLoaders[tag.tag];
            if (!countryLoader) {
                countryLoader = new CountryLoader(tag.tag, 'common/' + tag.file, this.progressReporter);
            }

            countryResultPromises.push(countryLoader.load(force));
            newCountryLoaders[tag.tag] = countryLoader;
        }

        this.countryLoaders = newCountryLoaders;

        const countriesResult = await Promise.all(countryResultPromises);
        const colorsFileResult = await this.colorsLoader.load(force);

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
    constructor(private tag: string, file: string, progressReporter: ProgressReporter) {
        super(file, progressReporter);
    }

    protected loadFromFile(warnings: Warning[], force: boolean): Promise<Country | undefined> {
        return loadCountry(this.tag, this.file);
    }

    public toString() {
        return `[CountryLoader: ${this.file}]`;
    }
}

class CountryTagsLoader extends FolderLoader<Tag[], Tag[]> {
    constructor(progressReporter: ProgressReporter) {
        super('common/country_tags', CountryTagLoader, progressReporter);
    }

    protected mergeFiles(fileResults: LoadResult<Tag[]>[], force: boolean): Promise<LoadResult<Tag[]>> {
        return Promise.resolve<LoadResult<Tag[]>>({
            result: fileResults.map(r => r.result).reduce<Tag[]>((p, c) => p.concat(c), []),
            dependencies: [this.folder + '/*'],
            warnings: mergeInLoadResult(fileResults, 'warnings'),
        });
    }

    public toString() {
        return `[CountryTagsLoader]`;
    }
}

class CountryTagLoader extends FileLoader<Tag[]> {
    protected loadFromFile(warnings: Warning[], force: boolean): Promise<Tag[]> {
        return loadCountryTags(this.file);
    }

    public toString() {
        return `[CountryTagLoader: ${this.file}]`;
    }
}

class ColorsLoader extends FileLoader<HOIPartial<ColorsFile>> {
    constructor(progressReporter: ProgressReporter) {
        super('common/countries/colors.txt', progressReporter);
    }

    protected loadFromFile(warnings: Warning[], force: boolean): Promise<HOIPartial<ColorsFile>> {
        try {
            return readFileFromModOrHOI4AsJson<ColorsFile>(this.file, colorsFileSchema);
        } catch(e) {
            error(e);
            return Promise.resolve({ _map: {}, _token: undefined });
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
