import { getConfiguration } from "./vsccommon";

const byDefaultEnabledFlags = [
    'useConditionInFocus',
    'eventTreePreview',
    'sharedFocusIndex',
    'gfxIndex',
    'rightButtonDrag',
];

type FeatureFlag = 'useConditionInFocus' | 'eventTreePreview' | 'sharedFocusIndex' | 'gfxIndex' | 'localisationIndex' | 'rightButtonDrag';

export function isFeatureEnabled(feature: FeatureFlag, featureFlags?: string[]): boolean {
    const ff = featureFlags ?? getConfiguration().featureFlags;
    if (byDefaultEnabledFlags.includes(feature)) {
        return !ff.includes('!' + feature);
    } else {
        return ff.includes(feature);
    }
}

export function featureFlagsAsScript(): string {
    const featureFlags = getConfiguration().featureFlags;
    const featureFlagState: Record<FeatureFlag, boolean> = {
        useConditionInFocus: isFeatureEnabled('useConditionInFocus', featureFlags),
        eventTreePreview: isFeatureEnabled('eventTreePreview', featureFlags),
        sharedFocusIndex: isFeatureEnabled('sharedFocusIndex', featureFlags),
        gfxIndex: isFeatureEnabled('gfxIndex', featureFlags),
        localisationIndex: isFeatureEnabled('localisationIndex', featureFlags),
        rightButtonDrag: isFeatureEnabled('rightButtonDrag', featureFlags),
    };
    return 'window.__featureflags = ' + JSON.stringify(featureFlagState) + ';';
}
