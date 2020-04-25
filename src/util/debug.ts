export function debug(message: string): void {
    if (process.env.NODE_ENV !== 'production') {
        console.log(message);
    }
}

export function error(error: Error): void {
    console.error(error);
}
