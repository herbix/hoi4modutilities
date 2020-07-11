import { debounce, DebounceSettings } from 'lodash';

export interface NumberSize {
    width: number;
    height: number;
}

export interface NumberPosition {
    x: number;
    y: number;
}

export interface Warning<T> {
    text: string;
    source: T;
}

export function arrayToMap<T, K extends keyof T>(items: T[], key: K):
    T[K] extends string ? Record<string, T> : T[K] extends number ? Record<number, T> : never;
export function arrayToMap<T, K extends keyof T, V>(items: T[], key: K, valueSelector: (value: T) => V):
    T[K] extends string ? Record<string, V> : T[K] extends number ? Record<number, V> : never;
export function arrayToMap<T, K extends keyof T, V = T>(items: T[], key: K, valueSelector?: (value: T) => V):
    T[K] extends string ? Record<string, V | T> : T[K] extends number ? Record<number, V | T> : never {
    const result: Record<string | number, V | T> = {};
    for (const item of items) {
        const id = item[key];
        if (typeof id !== 'string' && typeof id !== 'number') {
            throw new Error('key of arrayToMap must be a string type');
        }
        result[id] = valueSelector ? valueSelector(item) : item;
    }

    return result as any;
}

export function hsvToRgb(h: number, s: number, v: number): Record<'r'|'g'|'b', number> {
    var r: number, g: number, b: number, i: number, f: number, p: number, q: number, t: number;
    i = Math.floor(h * 6);
    f = h * 6 - i;
    p = v * (1 - s);
    q = v * (1 - f * s);
    t = v * (1 - (1 - f) * s);
    switch (i % 6) {
        case 0: r = v, g = t, b = p; break;
        case 1: r = q, g = v, b = p; break;
        case 2: r = p, g = v, b = t; break;
        case 3: r = p, g = q, b = v; break;
        case 4: r = t, g = p, b = v; break;
        case 5: r = v, g = p, b = q; break;
    }
    return {
        r: Math.round(r! * 255),
        g: Math.round(g! * 255),
        b: Math.round(b! * 255)
    };
}

export function slice<T>(array: T[] | undefined, start: number, end: number): T[] {
    if (!array) {
        return [];
    }

    if (start >= 0) {
        return array.slice(start, end);
    } else {
        if (end <= start) {
            return [];
        }

        const result = new Array<T>(end - start);
        for (let i = start, j = 0; i < end; i++, j++) {
            result[j] = array[i];
        }
        return result;
    }
}

export function debounceByInput<TI extends any[], TO>(func: (...input: TI) => TO, keySelector: (...input: TI) => string, wait?: number, debounceSettings?: DebounceSettings): (...input: TI) => TO {
    const cachedMethods: Record<string, (input: TI) => TO> = {};
    
    function result(...input: TI): TO {
        const key = keySelector(...input);
        const method = cachedMethods[key];
        if (method) {
            return method(input);
        }

        const newMethod = debounce((input2) => {
            delete cachedMethods[key];
            return func(...input2);
        }, wait, debounceSettings);
        cachedMethods[key] = newMethod;
        return newMethod(input);
    }

    return result;
}

export function randomString(length: number, charset: string | undefined = undefined): string {
    var result = '';
    var characters = charset ?? 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    var charactersLength = characters.length;
    for (let i = 0; i < length; i++ ) {
       result += characters.charAt(Math.floor(Math.random() * charactersLength));
    }
    return result;
}
