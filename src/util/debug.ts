import { sendException } from "./telemetry";
import { forceError, UserError } from "./common";
import { YAMLException } from 'js-yaml';

export function debug(message: any, ...args: any[]): void {
    if (process.env.NODE_ENV !== 'production') {
        const timestamp = new Date().toISOString();
        console.log(`[${timestamp}]`, message, ...args);
    }
}

export function error(error: unknown): void {
    console.error(error);
    let realError = forceError(error);

    if (!(error instanceof UserError) && !(error instanceof YAMLException)) {
        sendException(realError, { callerStack: new Error().stack ?? '' });
    }
}

export function createStopwatch(): {
    getElapsed: () => number;
    split: () => number;
} {
    const start = Date.now();
    let lastSplit = start;
    return {
        getElapsed: () => Date.now() - start,
        split: () => {
            const now = Date.now();
            const elapsed = now - lastSplit;
            lastSplit = now;
            return elapsed;
        }
    };
}
