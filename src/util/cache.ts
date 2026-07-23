export interface CacheOptions<V, K = string> {
    factory(key: K): V;
    expireWhenChange?(key: K, cachedValue: V): any;
    keyToStr?(key: K): string;
    life: number;
    nonExpireLife?: number;
}

export interface PromiseCacheOptions<V, K = string> extends CacheOptions<Promise<V>, K> {
    expireWhenChange?(key: K, cachedValue: Promise<V>): Promise<any> | any;
}

interface CacheEntry<V> {
    value: V;
    expiryToken: any;
    lastAccess: number;
}

export class Cache<V, K = string> {
    protected _cache: Record<string, CacheEntry<V>> = {};
    private _intervalToken: NodeJS.Timeout | null = null;
    
    constructor(protected readonly options: CacheOptions<V, K>) {
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

    public get(key: K): V {
        const strKey = this.getStrKey(key);
        const cacheEntry = this._cache[strKey];
        const now = Date.now();
        let expireToken: any = undefined;
        if (cacheEntry &&
            (now - cacheEntry.lastAccess < this.options.nonExpireLife! ||
                (expireToken = this.options.expireWhenChange!(key, cacheEntry.value)) === cacheEntry.expiryToken
            )) {
            cacheEntry.lastAccess = now;
            return cacheEntry.value;
        }

        const value = this.options.factory(key);
        const newEntry = {
            lastAccess: now,
            expiryToken: expireToken ?? this.options.expireWhenChange!(key, value),
            value
        };

        this._cache[strKey] = newEntry;
        return newEntry.value;
    }

    public remove(key: K): void {
        delete this._cache[this.getStrKey(key)];
    }

    public clear(): void {
        this._cache = {};
    }

    public dispose(): void {
        this._cache = {};
        if (this._intervalToken) {
            clearInterval(this._intervalToken);
        }
    }

    protected getStrKey(key: K): string {
        return this.options.keyToStr ? this.options.keyToStr(key) : (key === undefined || key === null ? '' : String(key));
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

export class PromiseCache<V, K = string> extends Cache<Promise<V>, K> {
    constructor(options: PromiseCacheOptions<V, K>) {
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

    public async get(key: K): Promise<V> {
        const strKey = this.getStrKey(key);
        const cacheEntry = this._cache[strKey];
        const now = Date.now();
        let expireToken: any = undefined;
        if (cacheEntry &&
            (now - cacheEntry.lastAccess < this.options.nonExpireLife! ||
                await (expireToken = Promise.resolve(this.options.expireWhenChange!(key, cacheEntry.value))) === await cacheEntry.expiryToken)
            ) {
            cacheEntry.lastAccess = now;
            return await cacheEntry.value;
        }

        const value = this.options.factory(key);
        const newEntry = {
            lastAccess: now,
            expiryToken: expireToken ?? Promise.resolve(this.options.expireWhenChange!(key, value)),
            value
        };

        this._cache[strKey] = newEntry;
        return await newEntry.value;
    }
}
