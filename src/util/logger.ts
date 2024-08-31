import * as vscode from 'vscode';

enum LogLevel {
    INFO = 'INFO',
    WARN = 'WARN',
    ERROR = 'ERROR',
}

class Logger {
    private static outputChannel: vscode.OutputChannel;

    // 初始化输出通道
    public static initialize() {
        if (!Logger.outputChannel) {
            Logger.outputChannel = vscode.window.createOutputChannel('HOI4 Modding');
        }
    }

    // 通用日志输出方法
    private static logMessage(level: LogLevel, message: string) {
        if (!Logger.outputChannel) {
            Logger.initialize();
        }
        const timestamp = new Date().toISOString();
        Logger.outputChannel.appendLine(`[${timestamp}] [${level}] ${message}`);
    }

    // 输出信息
    public static info(message: string) {
        Logger.logMessage(LogLevel.INFO, message);
    }

    // 输出警告
    public static warn(message: string) {
        Logger.logMessage(LogLevel.WARN, message);
    }

    // 输出错误
    public static error(message: string) {
        Logger.logMessage(LogLevel.ERROR, message);
    }

    // 显示输出通道（可选）
    public static show() {
        if (Logger.outputChannel) {
            Logger.outputChannel.show();
        }
    }
}

export default Logger;