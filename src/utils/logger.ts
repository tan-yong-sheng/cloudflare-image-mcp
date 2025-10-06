export type LogLevel = 'error' | 'warn' | 'info' | 'debug';

export interface LoggerConfig {
  level: LogLevel;
  prefix?: string;
  enableTimestamps?: boolean;
  enableColors?: boolean;
}

export class Logger {
  private config: LoggerConfig;
  private isDebugMode: boolean;
  private levelOrder: Record<LogLevel, number> = {
    error: 0,
    warn: 1,
    info: 2,
    debug: 3
  };

  constructor(config?: LoggerConfig) {
    this.config = {
      level: 'info',
      enableTimestamps: true,
      enableColors: true,
      ...config
    };

    // Determine debug mode from environment
    this.isDebugMode = process.env.NODE_ENV === 'development' ||
                     this.config.level === 'debug';

    // Auto-adjust level based on environment
    if (this.isDebugMode && this.config.level === 'info') {
      this.config.level = 'debug';
    }

    // Parse log level from environment if specified
    const envLevel = process.env.LOG_LEVEL as LogLevel;
    if (envLevel && this.isValidLogLevel(envLevel)) {
      this.config.level = envLevel;
    }
  }

  private isValidLogLevel(level: string): level is LogLevel {
    return ['error', 'warn', 'info', 'debug'].includes(level);
  }

  private shouldLog(level: LogLevel): boolean {
    return this.levelOrder[level] <= this.levelOrder[this.config.level];
  }

  private formatMessage(level: LogLevel, message: string, ...args: unknown[]): [string, ...unknown[]] {
    const parts: string[] = [];

    // Add timestamp
    if (this.config.enableTimestamps) {
      const timestamp = new Date().toISOString();
      parts.push(`[${timestamp}]`);
    }

    // Add level
    const levelEmoji = {
      debug: '🐛',
      info: 'ℹ️',
      warn: '⚠️',
      error: '❌'
    };
    parts.push(`${levelEmoji[level]}[${level.toUpperCase()}]`);

    // Add prefix
    if (this.config.prefix) {
      parts.push(`[${this.config.prefix}]`);
    }

    // Add message
    parts.push(message);

    return [parts.join(' '), ...args];
  }

  private log(level: LogLevel, message: string, ...args: any[]): void {
    if (!this.shouldLog(level)) {
      return;
    }

    const [formattedMessage, ...formattedArgs] = this.formatMessage(level, message, ...args);

    switch (level) {
      case 'debug':
        console.debug(formattedMessage, ...formattedArgs);
        break;
      case 'info':
        console.info(formattedMessage, ...formattedArgs);
        break;
      case 'warn':
        console.warn(formattedMessage, ...formattedArgs);
        break;
      case 'error':
        console.error(formattedMessage, ...formattedArgs);
        break;
    }
  }

  // Main logging methods
  debug(message: string, ...args: any[]): void {
    this.log('debug', message, ...args);
  }

  info(message: string, ...args: any[]): void {
    this.log('info', message, ...args);
  }

  warn(message: string, ...args: any[]): void {
    this.log('warn', message, ...args);
  }

  error(message: string, ...args: any[]): void {
    this.log('error', message, ...args);
  }

  
  rateLimit(message: string, ...args: any[]): void {
    this.warn(`🚦 ${message}`, ...args);
  }

  api(message: string, ...args: any[]): void {
    this.debug(`🌐 ${message}`, ...args);
  }

  storage(message: string, ...args: any[]): void {
    this.debug(`💾 ${message}`, ...args);
  }

  // Conditional logging helpers
  debugIf(condition: boolean, message: string, ...args: any[]): void {
    if (condition) {
      this.debug(message, ...args);
    }
  }

  logIf(condition: boolean, level: LogLevel, message: string, ...args: any[]): void {
    if (condition) {
      this.log(level, message, ...args);
    }
  }

  // Performance logging
  time(label: string): void {
    if (this.shouldLog('debug')) {
      console.time(`${this.config.prefix} ${label}`);
    }
  }

  timeEnd(label: string): void {
    if (this.shouldLog('debug')) {
      console.timeEnd(`${this.config.prefix} ${label}`);
    }
  }

  // Create child logger with different prefix
  child(prefix: string): Logger {
    return new Logger({
      level: this.config.level,
      enableTimestamps: this.config.enableTimestamps,
      enableColors: this.config.enableColors,
      prefix: this.config.prefix ? `${this.config.prefix}:${prefix}` : prefix
    });
  }
}

// Factory function for easy logger creation
export function createLogger(serviceName: string, config?: Omit<LoggerConfig, 'prefix'>): Logger {
  return new Logger({
    level: config?.level || 'info',
    enableTimestamps: config?.enableTimestamps ?? true,
    enableColors: config?.enableColors ?? true,
    prefix: serviceName
  });
}

// Default logger for general use
export const logger = new Logger();