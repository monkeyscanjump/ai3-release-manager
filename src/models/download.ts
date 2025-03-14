import { AssetMetadata } from './asset';

/**
 * Result of a download operation
 */
export interface DownloadResult {
  success: boolean;
  filePath?: string;
  error?: Error;
  hash?: string;
}

/**
 * Cached state of downloads
 */
export interface DownloadState {
  version?: number;
  latestTag: string;
  downloadedAssets: string[];
  assetDetails?: Record<string, AssetMetadata>;
  lastUpdated: string;
}

/**
 * Summary of download operations
 */
export interface DownloadSummary {
  success: boolean;
  releaseTag: string;
  downloadedAssets: Array<{
    name: string;
    outputPath: string;
    success: boolean;
    hash?: string;
    error?: string;
    fileSize?: number;
  }>;
  errors?: string[];
  // Action that was taken
  action: 'downloaded' | 'skipped' | 'none';
  executableResults?: Array<{
    path: string;
    success: boolean;
  }>;
}
