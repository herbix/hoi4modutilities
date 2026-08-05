import { State } from "../../src/previewdef/worldmap/definitions";

export interface CountryTag {
    owner: string;
    state: State;
}

export function selectCountryTagStates(
    states: { forEachState(callback: (state: State) => boolean | void): void },
    getStateOwner: (stateId: number) => string | undefined,
): CountryTag[] {
    const largestStateByOwner = new Map<string, State>();
    states.forEachState(state => {
        const owner = getStateOwner(state.id);
        const largestState = owner ? largestStateByOwner.get(owner) : undefined;
        if (owner && (!largestState || state.mass > largestState.mass)) {
            largestStateByOwner.set(owner, state);
        }
    });

    return Array.from(largestStateByOwner, ([owner, state]) => ({ owner, state }));
}

export function isCountryBorder(ownerFrom: string | undefined, ownerTo: string | undefined): boolean {
    return ownerFrom !== ownerTo;
}
