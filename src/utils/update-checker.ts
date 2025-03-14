import axios from 'axios';
import * as semver from 'semver';
import { Logger } from './logger';
import * as fs from 'fs';
import * as path from 'path';

// Get current version from package.json
const packageJsonPath = path.resolve(__dirname, '../../package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
const currentVersion = packageJson.version;
const packageName = packageJson.name;

/**
 * Check for updates from npm registry
 */
export async function checkForUpdates(silent = false): Promise<boolean> {
  try {
    const response = await axios.get(
      `https://registry.npmjs.org/${packageName}`
    );

    const latestVersion = response.data['dist-tags']?.latest;

    if (!latestVersion) {
      if (!silent) Logger.debug('Could not determine latest version');
      return false;
    }

    const updateAvailable = semver.gt(latestVersion, currentVersion);

    if (updateAvailable) {
      if (!silent) {
        Logger.info('═════════════════════════════════════════════');
        Logger.info(`Update available: ${currentVersion} → ${latestVersion}`);
        Logger.info(`Run: npm i -g ${packageName}@latest`);
        Logger.info('═════════════════════════════════════════════');
      }
      return true;
    } else {
      if (!silent) Logger.debug(`Using latest version ${currentVersion}`);
      return false;
    }
  } catch (error) {
    if (!silent) Logger.debug('Failed to check for updates:', error);
    return false;
  }
}

// When run directly, check for updates and exit
if (require.main === module) {
  (async () => {
    await checkForUpdates();
  })();
}
