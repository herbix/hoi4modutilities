import { error } from "./debug";
import { __table } from '../../i18n/en';

const config = JSON.parse(process.env.VSCODE_NLS_CONFIG || '{}');
const locale = config.locale ?? 'en';

let table: Record<string, string> = {};

try {
    table = require('../../i18n/' + locale + '.ts');
} catch(e) {
    error(e);
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
