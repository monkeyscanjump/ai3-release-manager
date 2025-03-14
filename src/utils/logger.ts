import * as fs from 'fs';
import * as path from 'path';
import { defaults } from '@/config';

/**
 * Logging levels for Logger class
 */
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3
}

/**
 * Simple logging system with level support and icons
 */
export class Logger {
  private static level: LogLevel = defaults.defaultLogLevel;
  private static logToFile: boolean = false;
  private static logFilePath: string = '';

  // Icons for each log level
  private static readonly icons = {
    [LogLevel.DEBUG]: '🔍 ',
    [LogLevel.INFO]: 'ℹ️ ',
    [LogLevel.WARN]: '⚠️ ',
    [LogLevel.ERROR]: '❌ '
  };

  public static configure(options: {
    level?: LogLevel;
    logToFile?: boolean;
    logFilePath?: string;
  }): void {
    if (options.level !== undefined) {
      this.level = options.level;
    }

    if (options.logToFile !== undefined) {
      this.logToFile = options.logToFile;
    }

    if (options.logFilePath) {
      this.logFilePath = options.logFilePath;

      // Create log directory if it doesn't exist
      const logDir = path.dirname(options.logFilePath);
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
      }
    }
  }

  private static log(level: LogLevel, message: string, ...args: any[]): void {
    if (level < this.level) return;

    const timestamp = new Date().toISOString();
    const levelName = LogLevel[level];
    const icon = this.icons[level];
    const formattedMessage = `[${timestamp}] ${icon} [${levelName}] ${message}`;
    const plainMessage = `[${timestamp}] [${levelName}] ${message}`; // For log file (no icons)

    // Log to console with icons
    switch (level) {
      case LogLevel.DEBUG:
      case LogLevel.INFO:
        console.log(formattedMessage, ...args);
        break;
      case LogLevel.WARN:
        console.warn(formattedMessage, ...args);
        break;
      case LogLevel.ERROR:
        console.error(formattedMessage, ...args);
        break;
    }

    // Log to file if enabled (without icons)
    if (this.logToFile && this.logFilePath) {
      try {
        const logEntry = `${plainMessage} ${args.map(arg =>
          typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
        ).join(' ')}\n`;

        fs.appendFileSync(this.logFilePath, logEntry);
      } catch (error) {
        console.error(`${this.icons[LogLevel.ERROR]} Failed to write to log file: ${error}`);
      }
    }
  }

  public static debug(message: string, ...args: any[]): void {
    this.log(LogLevel.DEBUG, message, ...args);
  }

  public static info(message: string, ...args: any[]): void {
    this.log(LogLevel.INFO, message, ...args);
  }

  public static warn(message: string, ...args: any[]): void {
    this.log(LogLevel.WARN, message, ...args);
  }

  public static error(message: string, ...args: any[]): void {
    this.log(LogLevel.ERROR, message, ...args);
  }
}
