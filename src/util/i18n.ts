import { error } from "./debug";
import { __table } from '../../i18n/en';

const config = JSON.parse(process.env.VSCODE_NLS_CONFIG || '{}');
export const locale: string = config.locale ?? 'en';
const splitLocale = locale.split('-');

const table: Record<string, string> = tryLoadTable(locale) ??
    (splitLocale.length > 1 ? tryLoadTable(splitLocale[0]) : undefined) ??
    {};

function tryLoadTable(locale: string): Record<string, string> | undefined {
    try {
        const requireContext = require.context('../../i18n', false, /\/(?!template)[\w-]*\.ts$/);
        return requireContext('./' + locale + '.ts').default;
    } catch(e) {
        error(e);
    }
    return undefined;
}

export function localize(key: keyof typeof __table | 'TODO', message: string, ...args: any[]): string {
    if (key in table) {
        message = table[key];
    }

    const regex = new RegExp('\\{(' + args.map((_, i) => i.toString()).join('|') + ')\\}', 'g');
    return message.replace(regex, (_, group1) => args[parseInt(group1)]?.toString());
}

export function localizeText(text: string): string {
    return text.replace(/%(.*?)(?:\|(.*?))?%/g, (substr, key, message) => {
        if (substr === '%%') {
            return '%';
        }

        if (!key) {
            return substr;
        }

        if (!message) {
            message = key;
        }

        return localize(key, message);
    });
}

export function i18nTableAsScript(): string {
    return 'window.__i18ntable = ' + JSON.stringify(table) + ';';
}
