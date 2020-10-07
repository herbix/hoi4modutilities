import TelemetryReporter from 'vscode-extension-telemetry';

interface TelemetryReporterInterface {
    sendTelemetryEvent(eventName: string, properties?: {
        [key: string]: string;
    }, measurements?: {
        [key: string]: number;
    }): void;
    sendTelemetryErrorEvent(eventName: string, properties?: {
        [key: string]: string;
    }, measurements?: {
        [key: string]: number;
    }, errorProps?: string[]): void;
    sendTelemetryException(error: Error, properties?: {
        [key: string]: string;
    }, measurements?: {
        [key: string]: number;
    }): void;
    dispose(): Promise<any>;
}

let telemetryReporter: TelemetryReporterInterface | undefined = undefined;

export interface TelemetryMessage {
    command: 'telemetry';
    telemetryType: 'event' | 'error' | 'exception';
    args: any[];
}

export function registerTelemetryReporter() {
    const isDev = process.env.NODE_ENV !== 'production';
    if (!isDev) {
        telemetryReporter = new TelemetryReporter(EXTENSION_ID, VERSION, '41a5f5b6-f4f0-4707-96ba-c895a2dabf17');
    } else {
        telemetryReporter = new DevTelemetryReporter();
    }

    return {
        dispose: () => {
            telemetryReporter?.dispose();
            telemetryReporter = undefined;
        }
    };
}

export const sendEvent: TelemetryReporter['sendTelemetryEvent'] = (eventName, properties, mesurements) => {
    telemetryReporter?.sendTelemetryEvent(eventName, properties, mesurements);
};

export const sendError: TelemetryReporter['sendTelemetryErrorEvent'] = (eventName, properties, mesurements, errorProps) => {
    telemetryReporter?.sendTelemetryErrorEvent(eventName, properties, mesurements, errorProps);
};

export const sendException: TelemetryReporter['sendTelemetryException'] = (error, properties, mesurements) => {
    telemetryReporter?.sendTelemetryException(error, properties, mesurements);
};

export function sendByMessage(message: TelemetryMessage) {
    switch (message.telemetryType) {
        case 'event':
            sendEvent(...(message.args as Parameters<typeof sendEvent>));
            break;
        case 'error':
            sendError(...(message.args as Parameters<typeof sendError>));
            break;
        case 'exception':
            const args = [...message.args];
            const error = new Error();
            error.message = args[0].message;
            error.name = args[0].name;
            error.stack = args[0].stack;
            args[0] = error;
            sendException(...(args as Parameters<typeof sendException>));
            break;
    }
}

class DevTelemetryReporter implements TelemetryReporterInterface {
    sendTelemetryEvent(eventName: string, properties?: { [key: string]: string; } | undefined, measurements?: { [key: string]: number; } | undefined): void {
        console.log('TelemetryEvent', eventName, JSON.stringify(properties), JSON.stringify(measurements));
    }

    sendTelemetryErrorEvent(eventName: string, properties?: { [key: string]: string; } | undefined, measurements?: { [key: string]: number; } | undefined, errorProps?: string[] | undefined): void {
        console.error('TelemetryErrorEvent', eventName, JSON.stringify(properties), JSON.stringify(measurements), JSON.stringify(errorProps));
    }

    sendTelemetryException(error: Error, properties?: { [key: string]: string; } | undefined, measurements?: { [key: string]: number; } | undefined): void {
        console.error('TelemetryException', error, JSON.stringify(properties), JSON.stringify(measurements));
    }

    async dispose(): Promise<any> {
    }
}
