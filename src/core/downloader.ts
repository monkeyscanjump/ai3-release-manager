import * as fs from 'fs';
import * as path from 'path';
import { DownloaderOptions, DownloadSummary } from '@/models';
import { ReleaseService } from '@core/releaseService';
import { AssetDownloader } from '@core/assetDownloader';
import { CacheManager } from '@core/cacheManager';
import { formatRepo } from '@/utils/github';
import { Logger, LogLevel } from '@/utils/logger';
import { FilePermissionManager } from '@/handlers/permissions';
import { cleanupStaleLocks } from '@/utils/fs';
import { ensureAbsolutePath, isRunningUnderPM2 } from '@/utils/env';

/**
 * Main downloader class that orchestrates the entire process
 */
export class GithubReleaseDownloader {
  private releaseService: ReleaseService;
  private assetDownloader: AssetDownloader;
  private cacheManager: CacheManager;
  private options: Required<DownloaderOptions>;

  constructor(options: DownloaderOptions) {

    if (isRunningUnderPM2()) {
      process.on('clear-cache', () => {
        Logger.info('Received cache clear request from PM2');
        this.releaseService.clearCache();
        Logger.info('Cache cleared successfully');
      });
    }

    // Configure logger based on verbosity
    Logger.configure({
      level: options.verbose ? LogLevel.DEBUG : LogLevel.INFO,
      logToFile: options.logToFile || false,
      logFilePath: options.logFilePath
    });

    // Validate required options
    if (!options.repo) {
      throw new Error('Repository is required');
    }

    if (!options.networkType) {
      throw new Error('Network type is required');
    }

    // Convert output directory to absolute path for PM2 compatibility
    const absoluteOutputDir = options.outputDir ?
      ensureAbsolutePath(options.outputDir) :
      ensureAbsolutePath('./downloads');

    this.options = {
      ...options,
      outputDir: absoluteOutputDir,
      assetMappings: options.assetMappings || [],
      forceUpdate: options.forceUpdate || false,
      releaseOptions: options.releaseOptions || {},
      verbose: options.verbose || false,
      concurrency: options.concurrency || 2,
      logToFile: options.logToFile || false,
      logFilePath: options.logFilePath || '',
      githubToken: options.githubToken || process.env.GITHUB_TOKEN,
      makeExecutable: options.makeExecutable || false
    } as Required<DownloaderOptions>;

    // Clean up stale locks that might be left by crashed processes
    cleanupStaleLocks(this.options.outputDir);

    this.releaseService = new ReleaseService();

    // Configure release service if options provided
    if (options.releaseOptions) {
      this.releaseService.configure(options.releaseOptions);
    }

    this.assetDownloader = new AssetDownloader({
      showProgressBar: !options.verbose, // Hide progress bar in verbose mode to avoid log pollution
      downloadTimeout: options.releaseOptions?.downloadTimeout || 120000
    });
    this.cacheManager = new CacheManager(this.options.outputDir);
  }

  /**
   * Main method to download the latest assets
   * Enhanced to provide detailed information for programmatic use
   */
  public async download(): Promise<DownloadSummary> {
    try {
      const formattedRepo = formatRepo(this.options.repo);

      Logger.info(`Looking for latest ${this.options.networkType} release in ${formattedRepo}`);

      // Get the latest release tag for the network
      const releaseTag = await this.releaseService.getLatestReleaseTag(
        formattedRepo,
        this.options.networkType,
        this.options.releaseOptions?.token || this.options.githubToken
      );

      Logger.info(`Found latest release tag: ${releaseTag.tag}`);

      // Prepare summary object
      const summary: DownloadSummary = {
        success: false,
        releaseTag: releaseTag.tag,
        downloadedAssets: [],
        action: 'none' // Default action
      };

      // Check if we've already downloaded this release
      if (!this.options.forceUpdate && this.cacheManager.isTagCached(releaseTag.tag)) {
        Logger.info(`Release ${releaseTag.tag} is already downloaded. Skipping.`);

        // Add cached assets to summary
        const state = this.cacheManager.getState();
        if (state) {
          summary.downloadedAssets = state.downloadedAssets.map(asset => {
            const outputPath = path.join(this.options.outputDir, asset);
            let fileSize: number | undefined;

            try {
              if (fs.existsSync(outputPath)) {
                fileSize = fs.statSync(outputPath).size;
              }
            } catch (error) {
              Logger.debug(`Failed to get file size for ${outputPath}: ${error}`);
            }

            return {
              name: asset,
              outputPath: outputPath,
              success: true,
              hash: state.assetDetails?.[asset]?.hash,
              fileSize
            };
          });
          summary.success = true;
          summary.action = 'skipped'; // Set action to 'skipped'

          // If makeExecutable is true, handle permissions even for cached files
          if (this.options.makeExecutable && summary.downloadedAssets.length > 0) {
            const filesToProcess = summary.downloadedAssets
              .filter(asset => asset.success)
              .map(asset => asset.outputPath);

            if (filesToProcess.length > 0) {
              Logger.info('Making cached files executable...');
              const executableResults = FilePermissionManager.makeFilesExecutable(filesToProcess);
              summary.executableResults = executableResults;
            }
          }
        }

        return summary;
      }

      // Validate asset mappings
      if (!this.options.assetMappings || this.options.assetMappings.length === 0) {
        Logger.error('No asset mappings provided');
        summary.errors = ['No asset mappings provided'];
        return summary;
      }

      // Validate asset mappings format
      const invalidMappings = this.options.assetMappings.filter(
        mapping => !mapping.source || !mapping.output
      );

      if (invalidMappings.length > 0) {
        const error = `Invalid asset mappings found: ${invalidMappings.length} mappings are missing source or output properties`;
        Logger.error(error);
        summary.errors = [error];
        return summary;
      }

      // Download all assets
      const results = await this.assetDownloader.downloadAssets(
        formattedRepo,
        releaseTag.tag,
        this.options.assetMappings,
        this.options.outputDir,
        this.options.forceUpdate,
        this.options.concurrency
      );

      // Update the state file with downloaded assets and build summary
      for (let i = 0; i < results.length; i++) {
        const result = results[i];
        const mapping = this.options.assetMappings[i];
        const outputPath = result.filePath || path.join(this.options.outputDir, mapping.output);

        // Add to summary regardless of success
        let fileSize: number | undefined;
        try {
          if (result.filePath && fs.existsSync(result.filePath)) {
            fileSize = fs.statSync(result.filePath).size;
          }
        } catch (error) {
          Logger.debug(`Failed to get file size: ${error}`);
        }

        summary.downloadedAssets.push({
          name: mapping.output,
          outputPath,
          success: result.success,
          hash: result.hash,
          error: result.error?.message,
          fileSize
        });

        if (result.success) {
          this.cacheManager.addDownloadedAsset(releaseTag.tag, mapping.output, result.hash);
        }
      }

      const successCount = results.filter(r => r.success).length;
      Logger.info(`Downloaded ${successCount} of ${results.length} assets successfully`);

      summary.success = successCount === results.length;
      summary.action = 'downloaded'; // Set action to 'downloaded'

      // If makeExecutable is true and we have successful downloads, make them executable
      if (this.options.makeExecutable && summary.downloadedAssets.length > 0) {
        const filesToProcess = summary.downloadedAssets
          .filter(asset => asset.success)
          .map(asset => asset.outputPath);

        if (filesToProcess.length > 0) {
          Logger.info('Making downloaded files executable...');
          const executableResults = FilePermissionManager.makeFilesExecutable(filesToProcess);
          summary.executableResults = executableResults;
        }
      }

      return summary;
    } catch (error) {
      // Handle errors as before, but add the action property
      if (error instanceof Error) {
        Logger.error('Download process failed:', error.message);
        return {
          success: false,
          releaseTag: '',
          downloadedAssets: [],
          errors: [error.message],
          action: 'none'
        };
      } else {
        Logger.error('Download process failed:', error);
        return {
          success: false,
          releaseTag: '',
          downloadedAssets: [],
          errors: [String(error)],
          action: 'none'
        };
      }
    }
  }

  /**
   * Legacy method for backward compatibility
   * Just returns a boolean result from the detailed download process
   */
  public async downloadLegacy(): Promise<boolean> {
    const result = await this.download();
    return result.success;
  }
}
