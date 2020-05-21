import { State, Province, Warning, Zone, ProvinceMap } from "../definitions";
import { CustomSymbol, Enum, SchemaDef } from "../../../hoiformat/schema";
import { listFilesFromModOrHOI4, readFileFromModOrHOI4AsJson } from "../../../util/fileloader";
import { error } from "../../../util/debug";
import { mergeBoundingBox } from "./common";
import { Token } from "../../../hoiformat/hoiparser";

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
    impassable: boolean;
    _token: Token;
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
            impassable: 'boolean',
        },
        _type: "array",
    },
};

type StateNoBoundingBox = Omit<State, 'boundingBox'>;

export async function loadStates(progressReporter: (progress: string) => Promise<void>, { provinces, width, height, warnings }: ProvinceMap): Promise<{ states: State[], badStatesCount: number }> {
    await progressReporter('Loading states...');
    const stateFiles = await listFilesFromModOrHOI4('history/states');

    const states = (await Promise.all(stateFiles.map(file => loadState('history/states/' + file, warnings)))).reduce((p, c) => p.concat(c), []);
    const { sortedStates, badStateId } = sortStates(states, warnings);

    const filledStates: State[] = new Array(sortedStates.length);
    for (let i = badStateId + 1; i < sortedStates.length; i++) {
        if (sortedStates[i]) {
            filledStates[i] = calculateBoundingBox(sortedStates[i], provinces, width, height, warnings);
        }
    }

    const badStatesCount = badStateId + 1;
    validateProvinceInState(provinces, filledStates, badStatesCount);

    return {
        states: filledStates,
        badStatesCount,
    };
}

function validateProvinceInState(provinces: (Province | undefined | null)[], states: (State | undefined | null)[], badStatesCount: number) {
    const provinceToState: Record<number, number> = {};

    for (let i = badStatesCount; i < states.length; i++) {
        const state = states[i];
        if (state) {
            state.provinces.forEach(p => {
                if (provinceToState[p] !== undefined) {
                    provinces[p]?.warnings.push(`Province ${p} exists in multiple states: ${provinceToState[p]}, ${state.id}`);
                } else {
                    provinceToState[p] = state.id;
                }
            });
        }
    }
}

async function loadState(stateFile: string, globalWarnings: Warning[]): Promise<StateNoBoundingBox[]> {
    try {
        const data = await readFileFromModOrHOI4AsJson<StateFile>(stateFile, stateFileSchema);
        const result: StateNoBoundingBox[] = [];

        for (const state of data.state) {
            const warnings: string[] = [];
            const id = state.id ? state.id : (
                globalWarnings.push({
                    type: 'state',
                    sourceId: -1,
                    text: `A state in ${stateFile} doesn't have id field.`,
                }),
                warnings.push(`The state doesn't have id field.`),
                -1
            );
            const name = state.name ? state.name : (warnings.push(`The state doesn't have name field.`), 'NO_NAME');
            const manpower = state.manpower ?? 0;
            const category = state.state_category?._name ? state.state_category._name : (warnings.push(`The state doesn't have category field.`), 'unknown');
            const owner = state.history?.owner?._name;
            const provinces = state.provinces._values.map(v => parseInt(v));
            const cores = state.history?.add_core_of.map(v => v?._name).filter((v): v is string => v !== undefined) ?? [];
            const impassable = state.impassable ?? false;

            if (provinces.length === 0) {
                globalWarnings.push({
                    type: 'state',
                    sourceId: id,
                    text: `State ${id} in ${stateFile} doesn't have provinces.`,
                });
            }
            
            result.push({
                id, name, manpower, category, owner, provinces, cores, impassable, warnings, file: stateFile, token: state._token
            });
        }

        return result;
    } catch (e) {
        error(e);
        return [];
    }
}

function sortStates(states: StateNoBoundingBox[], warnings: Warning[]): { sortedStates: StateNoBoundingBox[], badStateId: number } {
    const maxStateId = states.reduce((p, c) => c.id > p ? c.id : p, 0);
    if (maxStateId > 10000) {
        throw new Error(`Max state id is too large: ${maxStateId}.`);
    }

    let badStateId = -1;
    const result: StateNoBoundingBox[] = new Array(maxStateId + 1);
    states.forEach(p => {
        if (p.id === -1) {
            p.id = badStateId--;
        }
        if (result[p.id]) {
            warnings.push({
                type: 'state',
                sourceId: badStateId,
                text: `There're more than one states using state id ${p.id}.`,
            });
            p.warnings.push(`Original state id ${p.id} conflict with other states.`);
            p.id = badStateId--;
        }
        result[p.id] = p;
    });
    for (let i = 1; i < maxStateId; i++) {
        if (!result[i]) {
            warnings.push({
                type: 'state',
                sourceId: i,
                text: `State with id ${i} doesn't exist.`,
            });
        }
    };

    return {
        sortedStates: result,
        badStateId,
    };
}

function calculateBoundingBox(noBoundingBoxState: StateNoBoundingBox, provinces: (Province | undefined | null)[], width: number, height: number, warnings: Warning[]): State {
    const state = noBoundingBoxState as State;
    const zones = state.provinces
        .map(p => {
            const province = provinces[p];
            if (!province) {
                state.warnings.push(`Province ${p} doesn't exist.`);
            }
            return province?.boundingBox;
        })
        .filter((p): p is Zone => !!p);

    if (zones.length > 0) {
        state.boundingBox = zones.reduce((p, c) => mergeBoundingBox(p, c, width));
        if (state.boundingBox.w > width / 2 || state.boundingBox.h > height / 2) {
            state.warnings.push(`The state is too large: ${state.boundingBox.w}x${state.boundingBox.h}`);
        }
    } else {
        warnings.push({
            type: 'state',
            sourceId: state.id,
            text: `State ${state.id} in doesn't have valid provinces.`,
        });
        state.boundingBox = { x: 0, y: 0, w: 0, h: 0 };
    }

    return state;
}
