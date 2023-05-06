import { sendException } from "./telemetry";
import { forceError, UserError } from "./common";
import { YAMLException } from 'js-yaml';

export function debug(message: any, ...args: any[]): void {
    if (process.env.NODE_ENV !== 'production') {
        console.log(message, ...args);
    }
}

export function error(error: unknown): void {
    console.error(error);
    let realError = forceError(error);

    if (!(error instanceof UserError) && !(error instanceof YAMLException)) {
        sendException(realError, { callerStack: new Error().stack ?? '' });
    }
}
