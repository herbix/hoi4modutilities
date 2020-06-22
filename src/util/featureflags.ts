import { getConfiguration } from "./vsccommon";

const featureFlags = getConfiguration().featureFlags;

export const useConditionInFocus = !featureFlags.includes('!useConditionInFocus');
