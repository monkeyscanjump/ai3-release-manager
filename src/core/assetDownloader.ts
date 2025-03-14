import { PM2Metrics } from '@/utils/pm2io';
import axios, { AxiosError } from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import { Readable, PassThrough } from 'stream';
import * as crypto from 'crypto';
import {
  AssetMapping,
  DownloadResult,
  AssetDownloadError,
  AssetMetadata
} from '@/models';
import { createAssetUrl } from '@/utils/github';
import { ensureDir } from '@/utils/fs';
import { formatBytes } from '@/utils/display';
import { Logger } from '@/utils/logger';
import { isRunningUnderPM2 } from '@/utils/env';
import defaults from '@/config/defaults';

/**
 * Calculate SHA-256 hash of a file
 */
async function calculateFileHash(filePath: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);

    stream.on('error', err => reject(err));
    stream.on('data', chunk => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest()));
  });
}

export class AssetDownloader {
  private maxRetries = defaults.defaultMaxRetries;
  private initialRetryDelay = defaults.defaultRetryDelay;
  private showProgressBar = true;
  private downloadTimeout = defaults.defaultDownloadTimeout;
  private headers: Record<string, string> = {};

  /**
   * Constructor with options to customize behavior
   */
  constructor(options?: {
    showProgressBar?: boolean;
    maxRetries?: number;
    retryDelay?: number;
    downloadTimeout?: number;
    headers?: Record<string, string>;
  }) {
    if (options) {
      const pm2Compatible = isRunningUnderPM2();
      if (pm2Compatible && options.showProgressBar !== false) {
        Logger.debug('Running under PM2, disabling interactive progress display');
      }

      this.showProgressBar = options.showProgressBar !== undefined ?
        (options.showProgressBar && !pm2Compatible) :
        !pm2Compatible;

      if (options.maxRetries !== undefined) this.maxRetries = options.maxRetries;
      if (options.retryDelay !== undefined) this.initialRetryDelay = options.retryDelay;
      if (options.downloadTimeout !== undefined) this.downloadTimeout = options.downloadTimeout;
      if (options.headers) this.headers = options.headers;
    }
  }

  /**
   * Load metadata for a downloaded file
   */
  private async loadMetadata(filePath: string): Promise<AssetMetadata | null> {
    const metaPath = `${filePath}${defaults.tempFileExtensions.meta}`;
    if (fs.existsSync(metaPath)) {
      try {
        const data = await fs.promises.readFile(metaPath, 'utf-8');
        return JSON.parse(data) as AssetMetadata;
      } catch (e) {
        Logger.warn(`Could not read metadata for ${filePath}:`, e);
      }
    }
    return null;
  }

  /**
   * Save metadata for a downloaded file
   */
  private async saveMetadata(filePath: string, metadata: AssetMetadata): Promise<void> {
    const metaPath = `${filePath}.meta`;
    try {
      await fs.promises.writeFile(metaPath, JSON.stringify(metadata, null, 2), 'utf-8');
    } catch (e) {
      Logger.warn(`Could not save metadata for ${filePath}:`, e);
    }
  }

  /**
   * Creates a lock file with proper error handling
   */
  private async createLock(lockFile: string): Promise<boolean> {
    try {
      // Use atomic file operation with file descriptor to minimize race conditions
      const fd = await fs.promises.open(lockFile, 'wx');
      await fd.writeFile(Date.now().toString(), 'utf-8');
      await fd.close();
      return true;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EEXIST') {
        Logger.warn(`Could not create lock file ${lockFile}:`, e);
      }
      return false;
    }
  }

  /**
   * Releases a lock file with proper error handling
   */
  private async releaseLock(lockFile: string): Promise<void> {
    try {
      if (fs.existsSync(lockFile)) {
        await fs.promises.unlink(lockFile);
      }
    } catch (e) {
      Logger.warn(`Could not remove lock file ${lockFile}:`, e);
    }
  }

  /**
   * Downloads a single asset from a GitHub release
   */
  public async downloadAsset(
    repo: string,
    releaseTag: string,
    assetMapping: AssetMapping,
    outputDir: string,
    forceUpdate: boolean = false
  ): Promise<DownloadResult> {
    if (!assetMapping || !assetMapping.source || !assetMapping.output) {
      return {
        success: false,
        error: new AssetDownloadError('unknown', 'Invalid asset mapping')
      };
    }

    // Determine if it's a Windows executable by the output file extension
    const isWindowsExecutable = assetMapping.output.toLowerCase().endsWith('.exe');

    ensureDir(outputDir);
    const outputPath = path.join(outputDir, assetMapping.output);
    const lockFile = `${outputPath}${defaults.tempFileExtensions.lock}`;

    // Check for existing lock file (another process may be downloading)
    if (fs.existsSync(lockFile)) {
      try {
        const lockData = fs.readFileSync(lockFile, 'utf-8');
        const lockTime = parseInt(lockData, 10);

        // If lock is older than 1 hour, consider it stale
        if (!isNaN(lockTime) && Date.now() - lockTime < defaults.lockFileExpirationMs) {
          Logger.warn(`File ${outputPath} is being downloaded by another process. Skipping.`);
          return {
            success: false,
            error: new Error('File is locked by another process')
          };
        } else {
          Logger.info(`Found stale lock file for ${outputPath}. Removing it.`);
          await this.releaseLock(lockFile);
        }
      } catch (e) {
        Logger.warn(`Could not process lock file ${lockFile}:`, e);
      }
    }

    // Create lock file to prevent concurrent downloads
    const lockCreated = await this.createLock(lockFile);
    if (!lockCreated) {
      Logger.warn(`Could not obtain lock for ${outputPath}. Another process may be downloading it.`);
      return {
        success: false,
        error: new Error('Could not obtain lock file')
      };
    }

    let retryCount = 0;
    let retryDelay = this.initialRetryDelay;
    let writer: fs.WriteStream | null = null;
    let tracker: PassThrough | null = null;
    let stream: Readable | null = null;
    const downloadStartTime = Date.now();

    try {
      while (retryCount <= this.maxRetries) {
        try {
          // Check if file already exists and has the right size/hash
          if (!forceUpdate && fs.existsSync(outputPath)) {
            const metadata = await this.loadMetadata(outputPath);
            if (metadata && metadata.hash) {
              Logger.info(`File ${outputPath} already exists with hash ${metadata.hash.substring(0, 8)}...`);
              // Release lock and return success
              await this.releaseLock(lockFile);
              return {
                success: true,
                filePath: outputPath,
                hash: metadata.hash
              };
            }
          }

          // Construct the full asset name with the release tag
          const fullAssetName = assetMapping.source.includes(releaseTag)
            ? assetMapping.source
            : `${assetMapping.source}-${releaseTag}`;

          // For Windows executables, ensure the source URL includes .exe
          const fullAssetNameWithExt = isWindowsExecutable && !fullAssetName.endsWith('.exe')
            ? `${fullAssetName}.exe`
            : fullAssetName;

          const downloadUrl = createAssetUrl(repo, releaseTag, fullAssetNameWithExt);

          if (isWindowsExecutable) {
            Logger.debug(`Windows executable detected, downloading with .exe extension: ${fullAssetNameWithExt}`);
          }
          Logger.debug(`Downloading from: ${downloadUrl}`);

          // Download the file
          const tempPath = `${outputPath}${defaults.tempFileExtensions.temp}`;
          writer = fs.createWriteStream(tempPath);
          tracker = new PassThrough();

          // Setup progress tracking
          let downloaded = 0;
          let contentSize = 0;

          tracker.on('data', (chunk) => {
            downloaded += chunk.length;
            this.updateProgress(downloaded, contentSize, assetMapping.output);
          });

          // Make HEAD request to get file size
          try {
            const headResponse = await axios.head(downloadUrl, {
              timeout: this.downloadTimeout,
              headers: this.headers
            });
            contentSize = parseInt(headResponse.headers['content-length'] || '0', 10);
          } catch (headError) {
            Logger.debug(`Could not get file size with HEAD request: ${(headError as Error).message}`);
          }

          // Perform the actual download
          const response = await axios({
            method: 'GET',
            url: downloadUrl,
            responseType: 'stream',
            timeout: this.downloadTimeout,
            headers: this.headers
          });

          // Update fileSize if we got it from the GET response
          if (response.headers['content-length']) {
            contentSize = parseInt(response.headers['content-length'], 10);
          }

          stream = response.data;
          if (!stream) {
            throw new Error('Download stream is null');
          }
          if (!tracker || !writer) {
            throw new Error('Tracking or writing stream is not available');
          }
          stream.pipe(tracker).pipe(writer);

          // Wait for download to complete
          await new Promise<void>((resolve, reject) => {
            writer!.on('finish', resolve);
            writer!.on('error', reject);
          });

          // Verify the downloaded file
          const fileSize = fs.statSync(tempPath).size;
          if (fileSize === 0) {
            throw new Error('Downloaded file is empty');
          }

          // Calculate hash
          const fileHash = await calculateFileHash(tempPath);
          const fileHashHex = fileHash.toString('hex');

          // Move temp file to final location
          fs.renameSync(tempPath, outputPath);

          // Save metadata
          await this.saveMetadata(outputPath, {
            downloadTime: new Date().toISOString(),
            hash: fileHashHex
          });

          // Clean up progress display
          if (this.showProgressBar) {
            process.stdout.write('\n');
          }

          // Record successful download in PM2 metrics
          PM2Metrics.incrementDownloads();
          PM2Metrics.addBytesDownloaded(fileSize);

          // Log completion
          Logger.info(`File downloaded: ${assetMapping.output} (${formatBytes(fileSize)})`);
          Logger.debug(`File hash (SHA-256): ${fileHashHex}`);

          // Release the lock
          await this.releaseLock(lockFile);

          // Return success with file path and hash
          return {
            success: true,
            filePath: outputPath,
            hash: fileHashHex
          };

        } catch (error: unknown) {
          // Clean up any partial files or streams
          if (writer) {
            writer.end();
            writer = null;
          }

          if (tracker) {
            tracker.end();
            tracker = null;
          }

          if (stream) {
            stream.destroy();
            stream = null;
          }

          // Clean up temp file if it exists
          const tempPath = `${outputPath}.tmp`;
          if (fs.existsSync(tempPath)) {
            try {
              fs.unlinkSync(tempPath);
            } catch (e) {
              Logger.warn(`Could not remove temp file ${tempPath}:`, e);
            }
          }

          // Handle retry logic
          retryCount++;
          if (retryCount <= this.maxRetries) {
            // Create a clean error message
            let errorMessage = 'Download failed';

            // Handle axios errors specifically to extract useful information
            if (axios.isAxiosError(error)) {
              const status = error.response?.status;
              if (status === 404) {
                errorMessage = `File not found (404): ${assetMapping.source}`;
              } else if (status) {
                errorMessage = `HTTP ${status}: ${error.response?.statusText || 'Unknown error'}`;
              } else {
                errorMessage = error.message || 'Network error';
              }
            } else if (error instanceof Error) {
              errorMessage = error.message;
            } else {
              errorMessage = String(error);
            }

            const wait = retryDelay;
            Logger.warn(`Download failed, retrying in ${wait}ms... (${retryCount}/${this.maxRetries})`);
            Logger.debug(`Error: ${errorMessage}`);

            // Exponential backoff
            await new Promise(resolve => setTimeout(resolve, wait));
            retryDelay *= 2;  // Double the delay for next retry
          } else {
            // Record download error in PM2 metrics
            PM2Metrics.incrementErrors();

            // Extract clean error message for the final error
            let finalErrorMessage: string;
            if (axios.isAxiosError(error)) {
              const status = error.response?.status;
              if (status === 404) {
                finalErrorMessage = `File not found (404): ${assetMapping.source}`;
              } else if (status) {
                finalErrorMessage = `HTTP ${status}: ${error.response?.statusText || 'Unknown error'}`;
              } else {
                finalErrorMessage = error.message || 'Network error';
              }
            } else if (error instanceof Error) {
              finalErrorMessage = error.message;
            } else {
              finalErrorMessage = String(error);
            }

            // Max retries reached, give up
            Logger.error(`Failed to download ${assetMapping.source} after ${this.maxRetries} attempts: ${finalErrorMessage}`);

            await this.releaseLock(lockFile);
            return {
              success: false,
              error: new AssetDownloadError(assetMapping.source, finalErrorMessage)
            };
          }
        }
      }

      // This should never be reached due to the return statements above
      return {
        success: false,
        error: new Error('Unknown error during download')
      };
    } finally {
      // Ensure cleanup happens
      if (writer) writer.end();
      if (tracker) tracker.end();
      if (stream) stream.destroy();

      // Record total download time for this asset
      const totalTime = Date.now() - downloadStartTime;
      PM2Metrics.recordDownloadTime(totalTime);
    }
  }

  /**
   * Updates progress display based on configuration
   */
  private updateProgress(downloaded: number, total: number, assetName: string): void {
    if (this.showProgressBar && !isRunningUnderPM2()) {
      // Visual progress bar for CLI usage
      if (total > 0) {
        const percent = Math.round((downloaded * 100) / total);
        process.stdout.write(`\rDownloading ${assetName}... ${percent}% (${formatBytes(downloaded)}/${formatBytes(total)})  `);
      } else {
        process.stdout.write(`\rDownloading ${assetName}... ${formatBytes(downloaded)}  `);
      }
    } else {
      // Log-based progress updates for non-interactive or programmatic usage
      Logger.debug(`Download progress for ${assetName}: ${formatBytes(downloaded)}${
        total > 0 ? ` / ${formatBytes(total)} (${Math.round((downloaded * 100) / total)}%)` : ''
      }`);
    }
  }

  /**
   * Downloads multiple assets from a GitHub release with proper concurrency control
   */
  public async downloadAssets(
    repo: string,
    releaseTag: string,
    assetMappings: AssetMapping[],
    outputDir: string,
    forceUpdate: boolean = false,
    concurrency: number = 2
  ): Promise<DownloadResult[]> {
    const downloadStartTime = Date.now();

    // Validate asset mappings
    if (!assetMappings || assetMappings.length === 0) {
      Logger.error('No asset mappings provided');
      return [{
        success: false,
        error: new Error('No asset mappings provided')
      }];
    }

    // If showing progress bar, force sequential downloads to avoid mixed output
    const effectiveConcurrency = this.showProgressBar ? 1 : concurrency;

    if (this.showProgressBar && concurrency > 1) {
      Logger.debug('Progress bar enabled, using sequential downloads');
    }

    const results: DownloadResult[] = [];
    const queue = [...assetMappings];

    // Process in batches with limited concurrency
    while (queue.length > 0) {
      const batch = queue.splice(0, effectiveConcurrency);
      const batchResults = await Promise.all(
        batch.map(mapping =>
          this.downloadAsset(repo, releaseTag, mapping, outputDir, forceUpdate)
        )
      );
      results.push(...batchResults);
    }

    // Record total download time for PM2 metrics
    const totalDownloadTime = Date.now() - downloadStartTime;
    PM2Metrics.recordDownloadTime(totalDownloadTime);

    // Log download time for debugging
    const successCount = results.filter(r => r.success).length;
    Logger.debug(`Completed downloading ${successCount}/${results.length} assets in ${totalDownloadTime}ms`);

    return results;
  }
}
