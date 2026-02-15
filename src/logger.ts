import { Console } from 'node:console';

const LEVELS = ['debug', 'info', 'warn', 'error'] as const;
type Level = (typeof LEVELS)[number];

export interface Logger {
  debug(msg: string, ...args: unknown[]): void;
  info(msg: string, ...args: unknown[]): void;
  warn(msg: string, ...args: unknown[]): void;
  error(msg: string, ...args: unknown[]): void;
}

// Stderr-only console so stdout stays clean for protocol output
const stderr = new Console({ stdout: process.stderr, stderr: process.stderr });

function getThreshold(): number {
  const env = (process.env.LOG_LEVEL ?? 'info').toLowerCase();
  const idx = LEVELS.indexOf(env as Level);
  return idx === -1 ? LEVELS.indexOf('info') : idx;
}

export function createLogger(name: string): Logger {
  const threshold = getThreshold();

  function log(level: Level, msg: string, args: unknown[]): void {
    if (LEVELS.indexOf(level) < threshold) return;
    const ts = new Date().toISOString();
    const prefix = `${ts} ${level.toUpperCase().padEnd(5)} [${name}]`;
    if (args.length > 0) {
      stderr.log(prefix, msg, ...args);
    } else {
      stderr.log(prefix, msg);
    }
  }

  return {
    debug: (msg, ...args) => log('debug', msg, args),
    info: (msg, ...args) => log('info', msg, args),
    warn: (msg, ...args) => log('warn', msg, args),
    error: (msg, ...args) => log('error', msg, args),
  };
}

export const logger = createLogger('app');
