import { CustomMap, Attachment, Enum, SchemaDef } from "../../../hoiformat/schema";
import { Country } from "../definitions";
import { listFilesFromModOrHOI4, readFileFromModOrHOI4AsJson } from "../../../util/fileloader";
import { hsvToRgb } from "../../../util/common";
import { error } from "../../../util/debug";

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

export async function loadCountries(progressReporter: (progress: string) => Promise<void>): Promise<Country[]> {
    await progressReporter('Loading countries...');
    const countryTagsFiles = await listFilesFromModOrHOI4('common/country_tags');
    const countryTags = (await Promise.all(countryTagsFiles.map(file => loadCountryTags('common/country_tags/' + file)))).reduce((p, c) => p.concat(c), []);
    const countries = (await Promise.all(countryTags.map(countryTag => loadCountry(countryTag.tag, 'common/' + countryTag.file)))).filter((c): c is Country => c !== undefined);
    await applyColorFromColorTxt(countries);
    return countries;
}

async function loadCountryTags(countryTagsFile: string): Promise<{ tag: string, file: string }[]> {
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

async function applyColorFromColorTxt(countries: Country[]): Promise<void> {
    try {
        const data = await readFileFromModOrHOI4AsJson<ColorsFile>('common/countries/colors.txt', colorsFileSchema);
        for (const country of countries) {
            const colorIncolors = data._map[country.tag];
            if (colorIncolors?._value.color) {
                country.color = convertColor(colorIncolors?._value.color);
            }
        }
    } catch (e) {
        error(e);
    }
}

function convertColor(color: Attachment<Enum> | undefined): number {
    if (!color) {
        return 0;
    }

    const vec = color._value._values.map(e => parseFloat(e));
    if (vec.length < 3) {
        return 0;
    }

    if (!color._attachment || color._attachment.toLowerCase() === 'rgb') {
        return (vec[0] << 16) | (vec[1] << 8) | vec[2];
    }

    if (color._attachment.toLowerCase() === 'hsv') {
        const { r, g, b } = hsvToRgb(vec[0], vec[1], vec[2]);
        return (r << 16) | (g << 8) | b;
    }

    return 0;
}
