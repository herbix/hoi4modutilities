import { debug } from "./debug";

export interface CacheOptions<V> {
    factory(key: string): V;
    expireWhenChange?(key: string, cachedValue: V): any;
    life: number;
    nonExpireLife?: number;
}

export interface PromiseCacheOptions<V> extends CacheOptions<Promise<V>> {
    expireWhenChange?(key: string, cachedValue: Promise<V>): Promise<any> | any;
}

interface CacheEntry<V> {
    value: V;
    expiryToken: any;
    lastAccess: number;
}

export class Cache<V> {
    protected _cache: Record<string, CacheEntry<V>> = {};
    private _intervalToken: NodeJS.Timeout | null = null;
    
    constructor(protected readonly options: CacheOptions<V>) {
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
        let expireToken: any = undefined;
        if (cacheEntry &&
            (now - cacheEntry.lastAccess < this.options.nonExpireLife! ||
                (expireToken = this.options.expireWhenChange!(key, cacheEntry.value)) === cacheEntry.expiryToken
            )) {
            debug("Cache found. Key=%s, Token=%s", key, cacheEntry.expiryToken);
            cacheEntry.lastAccess = now;
            return cacheEntry.value;
        }

        const value = this.options.factory(key);
        const newEntry = {
            lastAccess: now,
            expiryToken: expireToken ?? this.options.expireWhenChange!(key, value),
            value
        };

        debug("Cache miss. Key=%s, Token=%s", key, newEntry.expiryToken);

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
    constructor(options: PromiseCacheOptions<V>) {
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

    public async get(key: string = ''): Promise<V> {
        const cacheEntry = this._cache[key];
        const now = Date.now();
        let expireToken: any = undefined;
        if (cacheEntry &&
            (now - cacheEntry.lastAccess < this.options.nonExpireLife! ||
                await (expireToken = Promise.resolve(this.options.expireWhenChange!(key, cacheEntry.value))) === await cacheEntry.expiryToken)
            ) {
            debug("PromiseCache found. Key=%s, Token=%s", key, await cacheEntry.expiryToken);
            cacheEntry.lastAccess = now;
            return await cacheEntry.value;
        }

        const value = this.options.factory(key);
        const newEntry = {
            lastAccess: now,
            expiryToken: expireToken ?? Promise.resolve(this.options.expireWhenChange!(key, value)),
            value
        };

        debug("PromiseCache miss. Key=%s", key);

        this._cache[key] = newEntry;
        return await newEntry.value;
    }
}
