export class StyleTable {
    private readonly records: Record<string, string> = {};
    private readonly rawRecords: Record<string, string> = {};
    private id: number = 0;

    public style(name: string, callback: () => string, fakeClass?: string): string
    public style(name: string, callback: () => Promise<string>, fakeClass?: string): Promise<string>
    public style(name: string, callback: (() => string) | (() => Promise<string>), pseudoClass: string = ''): string | Promise<string> {
        name = this.name(name);
        const key = name + pseudoClass;
        const result = this.records[key];
        if (result !== undefined) {
            return name;
        }
    
        const callbackResult = callback();
        if (typeof callbackResult === 'string') {
            this.records[key] = callbackResult;
            return name;
        } else {
            return callbackResult.then<string>(v => {
                this.records[key] = v;
                return name;
            });
        }
    }

    public oneTimeStyle(name: string, callback: () => string, fakeClass?: string): string
    public oneTimeStyle(name: string, callback: () => Promise<string>, fakeClass?: string): Promise<string>
    public oneTimeStyle(name: string, callback: (() => string) | (() => Promise<string>), fakeClass: string = ''): string | Promise<string> {
        const sid = this.id++;
        return this.style(name + '-' + sid, callback as any, fakeClass);
    }

    public toStyleElement(nonce: string): string {
        return `<style nonce="${nonce}">
            ${Object.entries(this.records).map(([k, v]) => `.${k} { ${v.replace(/^\s+/gm, '')} }\n`).join('')}
            ${Object.entries(this.rawRecords).map(([k, v]) => `${k} { ${v.replace(/^\s+/gm, '')} }\n`).join('')}
            </style>`;
    }

    public name(name: string) {
        return 'st-' + name;
    }

    public raw(selector: string, content: string) {
        this.rawRecords[selector] = content;
    }
}

export function normalizeForStyle(name: string): string {
    return name.replace(/[^\w_]/g, r => '_' + r.charCodeAt(0));
}
