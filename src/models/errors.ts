/**
 * Base error class for GitHub release operations
 */
export class GithubReleaseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GithubReleaseError';
  }
}

// Import other error types to re-export
export { AssetDownloadError } from './asset';
export { NetworkNotFoundError } from './network';
