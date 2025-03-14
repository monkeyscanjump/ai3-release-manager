import * as fs from 'fs';
import * as path from 'path';
import { Logger } from '@/utils';

/**
 * Utility to make downloaded files executable
 */
export class FilePermissionManager {
  /**
   * Check if a file has an executable extension like .exe, .bat, etc.
   */
  public static isExecutableExtension(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase();
    return ['.exe', '.bat', '.cmd', '.ps1', '.msi', '.com'].includes(ext);
  }

  /**
   * Make a file executable on Unix systems (Linux/macOS)
   * On Windows, this is a no-op as Windows doesn't use file permissions in the same way
   */
  public static makeExecutable(filePath: string): boolean {
    if (!fs.existsSync(filePath)) {
      Logger.warn(`Cannot set executable permissions - file does not exist: ${filePath}`);
      return false;
    }

    try {
      // Check if we're on Windows
      if (process.platform === 'win32') {
        Logger.debug(`Skipping executable permissions on Windows for: ${filePath}`);
        return true;
      }

      // On Unix systems, set read + execute permissions for user, group and others
      // This is equivalent to chmod 755 (rwxr-xr-x)
      const mode = fs.statSync(filePath).mode;
      // Add execute permission (user: 100, group: 010, others: 001)
      const newMode = mode | 0o111;

      fs.chmodSync(filePath, newMode);
      Logger.info(`Set executable permissions for: ${filePath}`);
      return true;
    } catch (error) {
      Logger.error(`Failed to set executable permissions for ${filePath}:`, error);
      return false;
    }
  }

  /**
   * Process a list of files, making non-Windows executables executable
   * @param filePaths List of file paths to process
   * @returns Array of results indicating success or failure for each file
   */
  public static makeFilesExecutable(filePaths: string[]): Array<{path: string, success: boolean}> {
    Logger.info(`Processing executable permissions for ${filePaths.length} files`);

    return filePaths.map(filePath => {
      // Skip files that already have executable extensions
      if (this.isExecutableExtension(filePath)) {
        Logger.debug(`Skipping ${filePath} - already has executable extension`);
        return { path: filePath, success: true };
      }

      const success = this.makeExecutable(filePath);
      return { path: filePath, success };
    });
  }
}
