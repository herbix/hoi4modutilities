export function debug(message: string, ...args: any[]): void {
    if (process.env.NODE_ENV !== 'production') {
        console.log(message, ...args);
    }
}

export function error(error: Error | string): void {
    console.error(error);
}

export function isNotProd(): boolean {
    return process.env.NODE_ENV !== 'production';
}
