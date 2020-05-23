import { __table } from '../../i18n/en';

let table: Record<string, string> = {};

try {
    table = (window as any)['__i18ntable'];
    if (!table) {
        console.error('Table not filled.');
        table = {};
    }
} catch(e) {
    console.error(e);
}

export function feLocalize(key: keyof typeof __table, message: string, ...args: any[]): string {
    if (key in table) {
        message = table[key];
    }

    const regex = new RegExp('\\{(' + args.map((_, i) => i.toString()).join('|') + ')\\}', 'g');
    return message.replace(regex, (_, group1) => args[parseInt(group1)]?.toString());
}
