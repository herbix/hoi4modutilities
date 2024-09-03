import * as vscode from 'vscode';

enum LogLevel {
    DEBUG = 'DEBUG',
    INFO = 'INFO',
    WARN = 'WARN',
    ERROR = 'ERROR',
}

export class Logger {
    private static outputChannel: vscode.OutputChannel;

    public static initialize() {
        if (!Logger.outputChannel) {
            Logger.outputChannel = vscode.window.createOutputChannel('HOI4 Modding');
        }
    }

    private static logMessage(level: LogLevel, message: string) {
        if (!Logger.outputChannel) {
            Logger.initialize();
        }
        const timestamp = new Date().toISOString();
        Logger.outputChannel.appendLine(`[${timestamp}] [${level}] ${message}`);
    }

    public static debug(message: string) {
        Logger.logMessage(LogLevel.DEBUG, message);
    }

    public static info(message: string) {
        Logger.logMessage(LogLevel.INFO, message);
    }

    public static warn(message: string) {
        Logger.logMessage(LogLevel.WARN, message);
    }

    public static error(message: string) {
        Logger.logMessage(LogLevel.ERROR, message);
    }

    public static show() {
        if (Logger.outputChannel) {
            Logger.outputChannel.show();
        }
    }
}