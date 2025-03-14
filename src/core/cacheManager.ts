import * as fs from 'fs';
import * as path from 'path';
import { DownloadState } from '@/models';
import { ensureDir, safeReadJsonFile } from '@/utils/fs';
import { Logger } from '@/utils/logger';

export class CacheManager {
  private stateFilePath: string;
  private backupFilePath: string;
  private currentState: DownloadState | null = null;
  private readonly VERSION = 2; // For future format changes

  constructor(outputDir: string) {
    ensureDir(outputDir);
    this.stateFilePath = path.join(outputDir, 'download-state.json');
    this.backupFilePath = path.join(outputDir, 'download-state.backup.json');
    this.loadState();
  }

  /**
   * Load the current state into memory, with backup recovery
   */
  private loadState(): void {
    try {
      this.currentState = safeReadJsonFile<DownloadState | null>(this.stateFilePath, null);

      // Handle version migration if needed
      if (this.currentState && (!this.currentState.version || this.currentState.version < this.VERSION)) {
        this.migrateState();
      }

      // If state is corrupted but backup exists, try to recover
      if (!this.currentState && fs.existsSync(this.backupFilePath)) {
        Logger.info('Main state file corrupted, attempting recovery from backup');
        this.currentState = safeReadJsonFile<DownloadState | null>(this.backupFilePath, null);
        if (this.currentState) {
          Logger.info('Successfully recovered state from backup');
          this.saveState(this.currentState);
        }
      }

      // Initialize state if it doesn't exist yet
      if (!this.currentState) {
        this.currentState = {
          version: this.VERSION,
          latestTag: '',
          downloadedAssets: [],
          assetDetails: {},
          lastUpdated: new Date().toISOString()
        };
      }
    } catch (error) {
      Logger.error('Failed to load state:', error instanceof Error ? error.message : String(error));
      // Create a new empty state as fallback
      this.currentState = {
        version: this.VERSION,
        latestTag: '',
        downloadedAssets: [],
        assetDetails: {},
        lastUpdated: new Date().toISOString()
      };
    }
  }

  /**
   * Migrate state to the current version format
   */
  private migrateState(): void {
    if (!this.currentState) return;

    // Add version if missing
    if (!this.currentState.version) {
      this.currentState.version = 1;
    }

    // Migrate from version 1 to 2 (example)
    if (this.currentState.version === 1) {
      Logger.info('Migrating state from version 1 to 2');
      // Add assetDetails if missing
      if (!this.currentState.assetDetails) {
        this.currentState.assetDetails = {};

        // Move existing assets to the new format
        this.currentState.downloadedAssets.forEach(asset => {
          this.currentState!.assetDetails![asset] = {
            downloadTime: this.currentState!.lastUpdated,
            hash: ''
          };
        });
      }
      this.currentState.version = 2;
    }

    // Save the migrated state
    this.saveState(this.currentState);
  }

  /**
   * Read the current download state from memory
   */
  public getState(): DownloadState | null {
    return this.currentState;
  }

  /**
   * Save the current download state to the state file with backup
   * @returns true if save was successful, false otherwise
   */
  public saveState(state: DownloadState): boolean {
    try {
      // Update version and timestamp
      state.version = this.VERSION;
      state.lastUpdated = new Date().toISOString();

      const jsonData = JSON.stringify(state, null, 2);

      // Create backup of current file if it exists
      if (fs.existsSync(this.stateFilePath)) {
        try {
          fs.copyFileSync(this.stateFilePath, this.backupFilePath);
        } catch (backupError) {
          Logger.warn('Failed to create backup:', backupError instanceof Error ? backupError.message : String(backupError));
        }
      }

      // Write to temp file first
      const tempPath = `${this.stateFilePath}.tmp`;
      fs.writeFileSync(tempPath, jsonData, 'utf-8');

      // Rename temp file to actual file (atomic operation)
      fs.renameSync(tempPath, this.stateFilePath);

      this.currentState = state;
      return true;
    } catch (error) {
      Logger.error(`Error saving state file: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }

  /**
   * Checks if a tag has already been cached
   */
  public isTagCached(tag: string): boolean {
    if (!this.currentState) return false;
    return this.currentState.latestTag === tag;
  }

  /**
   * Adds a downloaded asset to the cache
   */
  public addDownloadedAsset(tag: string, asset: string, hash?: string): void {
    if (!this.currentState) {
      this.currentState = {
        version: this.VERSION,
        latestTag: tag,
        downloadedAssets: [],
        assetDetails: {},
        lastUpdated: new Date().toISOString()
      };
    }

    // Update the latest tag if needed
    this.currentState.latestTag = tag;

    // Add to downloaded assets if not already there
    if (!this.currentState.downloadedAssets.includes(asset)) {
      this.currentState.downloadedAssets.push(asset);
    }

    // Ensure assetDetails exists
    if (!this.currentState.assetDetails) {
      this.currentState.assetDetails = {};
    }

    // Update asset details with hash and timestamp
    this.currentState.assetDetails[asset] = {
      downloadTime: new Date().toISOString(),
      hash: hash || ''
    };

    // Save the updated state
    this.saveState(this.currentState);
  }
}
