import * as path from 'path';

/**
 * Environment detection utilities
 */

/**
 * Check if the code is running under PM2
 */
export function isRunningUnderPM2(): boolean {
  return process.env.PM2_HOME !== undefined ||
    process.env.PM2_JSON_PROCESSING === 'true' ||
    process.env.NODE_APP_INSTANCE !== undefined;
}

/**
 * Creates an absolute path from a potentially relative path
 */
export function ensureAbsolutePath(filePath: string): string {
  if (path.isAbsolute(filePath)) {
    return filePath;
  }
  return path.resolve(process.cwd(), filePath);
}
