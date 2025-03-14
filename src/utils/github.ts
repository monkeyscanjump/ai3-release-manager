import { GithubReleaseError } from '@/models/errors';

/**
 * Formats a GitHub repository string to ensure consistent format
 */
export function formatRepo(repo: string): string {
  if (!repo) {
    throw new GithubReleaseError('Repository cannot be empty');
  }

  // Remove 'https://github.com/' prefix if present
  let formatted = repo.replace(/^https:\/\/github\.com\//, '');

  // Remove any trailing slashes
  formatted = formatted.replace(/\/+$/, '');

  // Remove any trailing '/releases/tag' or similar
  formatted = formatted.replace(/\/releases\/.+$/, '');

  // Validate format (should be 'owner/repo')
  if (!/^[^\/]+\/[^\/]+$/.test(formatted)) {
    throw new GithubReleaseError(`Invalid repository format: ${repo}. Expected format: 'owner/repo' or 'https://github.com/owner/repo'`);
  }

  return formatted;
}

/**
 * Creates a full URL to a GitHub release asset
 */
export function createAssetUrl(
  repo: string,
  releaseTag: string,
  assetName: string
): string {
  if (!releaseTag) {
    throw new GithubReleaseError('Release tag cannot be empty');
  }

  if (!assetName) {
    throw new GithubReleaseError('Asset name cannot be empty');
  }

  const formattedRepo = formatRepo(repo);
  // URL encode the asset name to handle special characters
  const encodedAssetName = encodeURIComponent(assetName);
  return `https://github.com/${formattedRepo}/releases/download/${releaseTag}/${encodedAssetName}`;
}

/**
 * Gets the GitHub releases page URL
 */
export function getReleasesUrl(repo: string): string {
  const formattedRepo = formatRepo(repo);
  return `https://github.com/${formattedRepo}/releases`;
}
