export interface CacheOptions<V> {
    factory: (key: string) => V;
    life: number;
}

interface CacheEntry<V> {
    value: V;
    lastAccess: number;
}

export class Cache<V> {
    private _cache: Record<string, CacheEntry<V>> = {};
    private _intervalToken: NodeJS.Timeout | null = null;
    
    constructor(private readonly options: CacheOptions<V>) {
        if (options.life > 0) {
            this._intervalToken = setInterval(() => this.tryClean(), options.life / 5);
        }
    }

    public get(key: string = ''): V {
        const cacheEntry = this._cache[key];
        if (cacheEntry) {
            cacheEntry.lastAccess = Date.now();
            return cacheEntry.value;
        }

        const newEntry = {
            lastAccess: Date.now(),
            value: this.options.factory(key)
        };

        this._cache[key] = newEntry;
        return newEntry.value;
    }

    public remove(key: string = ''): void {
        delete this._cache[key];
    }

    public clear(): void {
        this._cache = {};
    }

    public dispose(): void {
        this._cache = {};
        if (this._intervalToken) {
            clearTimeout(this._intervalToken);
        }
    }
    
    private tryClean(): void {
        const now = Date.now();
        for (const entry of Object.entries(this._cache)) {
            if (entry[1].lastAccess + this.options.life < now) {
                delete this._cache[entry[0]];
            }
        }
    }
}

export class PromiseCache<V> extends Cache<Promise<V>> {
    constructor(options: CacheOptions<Promise<V>>) {
        super({
            ...options,
            factory: (key) => {
                return options.factory(key).then(
                    icon => {
                        if (icon === null) {
                            this.remove(key);
                        }
                        return icon;
                    },
                    error => {
                        this.remove(key);
                        return Promise.reject<V>(error);
                    });
            }
        });
    }
}
