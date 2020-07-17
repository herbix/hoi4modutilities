import { sendException } from "./telemetry";
import { UserError } from "./common";

export function debug(message: any, ...args: any[]): void {
    if (process.env.NODE_ENV !== 'production') {
        console.log(message, ...args);
    }
}

export function error(error: Error | string): void {
    console.error(error);
    if (typeof error === 'string') {
        error = new Error(error);
    }

    if (!(error instanceof UserError)) {
        sendException(error);
    }
}
