const config = JSON.parse(process.env.VSCODE_NLS_CONFIG || '{}');
const locale = config.locale;

let table: Record<string, string> = {};

try {
    table = require('../../i18n/' + locale + '.ts');
} catch(e) {
    console.error(e);
}

export function localize(key: string, message: string, ...args: any[]): string {
    if (key in table) {
        message = table[key];
    }

    const regex = new RegExp('\\{(' + args.map((_, i) => i.toString()).join('|') + ')\\}', 'g');
    return message.replace(regex, (_, group1) => args[parseInt(group1)].toString());
}
