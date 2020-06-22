export class StyleTable {
    readonly records: Record<string, string> = {};
    private id: number = 0;

    public style(name: string, callback: () => string): string
    public style(name: string, callback: () => Promise<string>): Promise<string>
    public style(name: string, callback: (() => string) | (() => Promise<string>)): string | Promise<string> {
        name = 'st-' + name;
        const result = this.records[name];
        if (result !== undefined) {
            return name;
        }
    
        const callbackResult = callback();
        if (typeof callbackResult === 'string') {
            this.records[name] = callbackResult;
            return name;
        } else {
            return callbackResult.then<string>(v => {
                this.records[name] = v;
                return name;
            });
        }
    }

    public oneTimeStyle(name: string, callback: () => string): string
    public oneTimeStyle(name: string, callback: () => Promise<string>): Promise<string>
    public oneTimeStyle(name: string, callback: (() => string) | (() => Promise<string>)): string | Promise<string> {
        const sid = this.id++;
        return this.style(name + '-' + sid, callback as any);
    }

    public toStyleElement(nonce: string): string {
        return `<style nonce="${nonce}">${Object.entries(this.records).map(([k, v]) => `.${k} { ${v.replace(/^\s+/gm, '')} }\n`).join('')}</style>`;
    }
}
