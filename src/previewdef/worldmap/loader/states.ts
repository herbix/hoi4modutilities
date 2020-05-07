import { State } from "../definitions";
import { CustomSymbol, Enum, SchemaDef } from "../../../hoiformat/schema";
import { listFilesFromModOrHOI4, readFileFromModOrHOI4AsJson } from "../../../util/fileloader";

interface StateFile {
    state: StateDefinition[];
}

interface StateDefinition {
	id: number;
	name: string;
	manpower: number;
	state_category: CustomSymbol;
	history: StateHistory;
	provinces: Enum;
}

interface StateHistory {
    owner: CustomSymbol;
    victory_points: Enum[];
    add_core_of: CustomSymbol[];
}

const stateFileSchema: SchemaDef<StateFile> = {
    state: {
        _innerType: {
            id: "number",
            name: "string",
            manpower: "number",
            state_category: "symbol",
            history: {
                owner: "symbol",
                victory_points: {
                    _innerType: "enum",
                    _type: "array",
                },
                add_core_of: {
                    _innerType: "symbol",
                    _type: "array",
                },
            },
            provinces: "enum",
        },
        _type: "array",
    },
};

export async function loadStates(progressReporter: (progress: string) => Promise<void>): Promise<State[]> {
    await progressReporter('Loading states...');
    const stateFiles = await listFilesFromModOrHOI4('history/states');

    return (await Promise.all(stateFiles.map(file => loadState('history/states/' + file)))).reduce((p, c) => p.concat(c), []);
}

export async function loadState(stateFile: string): Promise<State[]> {
    const data = await readFileFromModOrHOI4AsJson<StateFile>(stateFile, stateFileSchema);
    const result: State[] = [];

    for (const state of data.state) {
        const warnings: string[] = [];
        const id = state.id ?? -1;
        const name = state.name ?? 'NO_NAME';
        const manpower = state.manpower ?? 0;
        const category = state.state_category?._name ?? 'unknown';
        const owner = state.history?.owner?._name ?? 'unknown';
        const provinces = state.provinces._values.map(v => parseInt(v));
        const cores = state.history?.add_core_of.map(v => v?._name).filter((v): v is string => v !== undefined) ?? [];
        
        result.push({
            id, name, manpower, category, owner, provinces, cores, warnings
        });
    }

    return result;
}
