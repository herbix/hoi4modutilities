export function getCountryLocalisationKeys(tag: string, rulingParty?: string, cosmeticTag?: string,
    autonomy?: { overlord: string, autonomousState: string }): string[] {
    const keys: string[] = [];
    if (cosmeticTag) {
        if (rulingParty) {
            keys.push(`${cosmeticTag}_${rulingParty}`);
        }
        keys.push(cosmeticTag);
    }
    if (autonomy) {
        keys.push(`${tag}_${autonomy.overlord}_${autonomy.autonomousState}`);
    }
    if (rulingParty) {
        keys.push(`${tag}_${rulingParty}`);
    }
    keys.push(tag);
    return keys;
}

export function findCountryLocalisedName(keys: string[], getLocalisedText: (key: string) => string | undefined): string | undefined {
    for (const key of keys) {
        const localisedName = getLocalisedText(key);
        if (localisedName && localisedName !== key) {
            return localisedName;
        }
    }
    return undefined;
}
