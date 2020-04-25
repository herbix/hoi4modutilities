export interface CacheOptions<V> {
    factory(key: string): V;
    expireWhenChange?(key: string): any;
    life: number;
    nonExpireLife?: number;
}

interface CacheEntry<V> {
    value: V;
    expiryToken: any;
    lastAccess: number;
}

export class Cache<V> {
    private _cache: Record<string, CacheEntry<V>> = {};
    private _intervalToken: NodeJS.Timeout | null = null;
    
    constructor(private readonly options: CacheOptions<V>) {
        if (options.life > 0) {
            this._intervalToken = setInterval(() => this.tryClean(), options.life / 5);
        }
        if (!options.expireWhenChange) {
            options.expireWhenChange = () => undefined;
        }
        if (options.nonExpireLife === undefined) {
            options.nonExpireLife = 200;
        }
    }

    public get(key: string = ''): V {
        const cacheEntry = this._cache[key];
        const now = Date.now();
        if (cacheEntry && (now - cacheEntry.lastAccess < this.options.nonExpireLife! || this.options.expireWhenChange!(key) === cacheEntry.expiryToken)) {
            cacheEntry.lastAccess = now;
            return cacheEntry.value;
        }

        const newEntry = {
            lastAccess: now,
            expiryToken: this.options.expireWhenChange!(key),
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
                    value => {
                        if (value === null || value === undefined) {
                            this.remove(key);
                        }
                        return value;
                    },
                    error => {
                        this.remove(key);
                        return Promise.reject<V>(error);
                    });
            }
        });
    }
}
