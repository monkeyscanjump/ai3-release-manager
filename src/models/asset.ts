/**
 * Maps source asset names to output filenames
 */
export interface AssetMapping {
  source: string;  // Asset name pattern without the tag
  output: string;  // Output filename
}

/**
 * Metadata about a downloaded asset
 */
export interface AssetMetadata {
  downloadTime: string;
  hash: string;
}

/**
 * Information about a release asset
 */
export interface ReleaseAsset {
  name: string;
  size: number;
  downloadUrl: string;
}

/**
 * Error thrown when asset download fails
 */
export class AssetDownloadError extends Error {
  public asset: string;

  constructor(asset: string, message: string) {
    super(message);
    this.name = 'AssetDownloadError';
    this.asset = asset;
  }
}
