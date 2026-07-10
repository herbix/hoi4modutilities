import { getConfiguration } from "./vsccommon";

const featureFlags = getConfiguration().featureFlags;

export const useConditionInFocus = !featureFlags.includes('!useConditionInFocus');
export const eventTreePreview = !featureFlags.includes('!eventTreePreview');
export const sharedFocusIndex = !featureFlags.includes('!sharedFocusIndex');
export const gfxIndex = !featureFlags.includes('!gfxIndex');
export const localisationIndex = featureFlags.includes('localisationIndex');
export const rightButtonDrag = !featureFlags.includes('!rightButtonDrag');

export function featureFlagsAsScript(): string {
    return 'window.__featureflags = ' + JSON.stringify({
        useConditionInFocus,
        eventTreePreview,
        sharedFocusIndex,
        gfxIndex,
        localisationIndex,
        rightButtonDrag,
    }) + ';';
}
