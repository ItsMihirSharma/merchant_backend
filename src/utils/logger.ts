/**
 * Simple logger utility
 * In production, replace with Winston or Pino
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

class Logger {
    private logLevel: LogLevel;

    constructor() {
        const level = process.env.LOG_LEVEL || 'info';
        this.logLevel = level as LogLevel;
    }

    private shouldLog(level: LogLevel): boolean {
        const levels: LogLevel[] = ['debug', 'info', 'warn', 'error'];
        const currentLevelIndex = levels.indexOf(this.logLevel);
        const messageLevelIndex = levels.indexOf(level);
        return messageLevelIndex >= currentLevelIndex;
    }

    private formatMessage(level: LogLevel, message: string, meta?: any): string {
        const timestamp = new Date().toISOString();
        const metaStr = meta ? ` ${JSON.stringify(meta)}` : '';
        return `[${timestamp}] ${level.toUpperCase()}: ${message}${metaStr}`;
    }

    debug(message: string, meta?: any): void {
        if (this.shouldLog('debug')) {
            console.log(this.formatMessage('debug', message, meta));
        }
    }

    info(message: string, meta?: any): void {
        if (this.shouldLog('info')) {
            console.log(this.formatMessage('info', message, meta));
        }
    }

    warn(message: string, meta?: any): void {
        if (this.shouldLog('warn')) {
            console.warn(this.formatMessage('warn', message, meta));
        }
    }

    error(message: string, meta?: any): void {
        if (this.shouldLog('error')) {
            console.error(this.formatMessage('error', message, meta));
        }
    }
}

export default new Logger();
