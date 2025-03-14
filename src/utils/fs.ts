import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { GithubReleaseError } from '@/models';
import { Logger } from '@utils/logger';
import { defaults } from '@/config';

/**
 * Ensures a directory exists, creating it if necessary
 */
export function ensureDir(dirPath: string): void {
  const normalizedPath = path.normalize(dirPath);

  try {
    if (!fs.existsSync(normalizedPath)) {
      fs.mkdirSync(normalizedPath, { recursive: true });
    }
  } catch (error) {
    if (error instanceof Error) {
      throw new GithubReleaseError(`Failed to create directory ${normalizedPath}: ${error.message}`);
    } else {
      throw new GithubReleaseError(`Failed to create directory ${normalizedPath}`);
    }
  }
}

/**
 * Safely parses a JSON file, returning a default value if parsing fails
 */
export function safeReadJsonFile<T>(filePath: string, defaultValue: T): T {
  try {
    if (fs.existsSync(filePath)) {
      const fileContent = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(fileContent) as T;
    }
  } catch (error) {
    Logger.warn(`Failed to read or parse ${filePath}, using default value`);
  }
  return defaultValue;
}

/**
 * Load configuration from file with support for multiple locations
 */
export function loadConfig(configFile: string): Record<string, any> {
  const configLocations = [
    configFile,
    ...defaults.alternativeConfigPaths.map(configPath => {
      return configPath.startsWith('~')
        ? path.join(os.homedir(), configPath.substring(1))
        : configPath;
    })
  ];

  for (const location of configLocations) {
    try {
      if (fs.existsSync(location)) {
        const configData = fs.readFileSync(location, 'utf8');
        Logger.info(`Loaded configuration from ${location}`);
        return JSON.parse(configData);
      }
    } catch (error) {
      Logger.warn(`Failed to load config from ${location}:`, error);
    }
  }

  return {};
}

/**
 * Safely removes a file if it exists
 */
export function safeRemoveFile(filePath: string): boolean {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return true;
    }
  } catch (error) {
    Logger.warn(`Failed to remove file ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
  }
  return false;
}

/**
 * Cleans up partial downloads and lock files in a directory
 */
export function cleanupTemporaryFiles(directory: string): void {
  try {
    if (fs.existsSync(directory)) {
      const files = fs.readdirSync(directory);

      for (const file of files) {
        const hasExtension = Object.values(defaults.tempFileExtensions)
          .some(ext => file.endsWith(ext));
        if (hasExtension) {
          safeRemoveFile(path.join(directory, file));
          Logger.debug(`Cleaned up temporary file: ${file}`);
        }
      }
    }
  } catch (error) {
    Logger.error('Failed to clean up temporary files:', error);
  }
}

/**
 * Cleans up stale lock files in a directory
 * This is especially important for PM2 processes that might have crashed
 */
export function cleanupStaleLocks(directory: string): void {
  try {
    if (fs.existsSync(directory)) {
      const files = fs.readdirSync(directory);
      const lockFiles = files.filter(file => file.endsWith('.lock'));

      for (const lockFile of lockFiles) {
        try {
          const lockFilePath = path.join(directory, lockFile);
          const stats = fs.statSync(lockFilePath);
          const lockData = fs.readFileSync(lockFilePath, 'utf-8');
          const lockTime = parseInt(lockData, 10);

          // If lock file is older than 1 hour, or can't be parsed as a timestamp, consider it stale
          if (isNaN(lockTime) || Date.now() - lockTime > defaults.lockFileExpirationMs) {
            safeRemoveFile(lockFilePath);
            Logger.info(`Removed stale lock file: ${lockFile}`);
          }
        } catch (error) {
          // If we can't read the lock file, it's likely corrupted, so remove it
          try {
            safeRemoveFile(path.join(directory, lockFile));
            Logger.info(`Removed corrupted lock file: ${lockFile}`);
          } catch {}
        }
      }
    }
  } catch (error) {
    Logger.warn('Failed to clean up stale locks:', error);
  }
}
