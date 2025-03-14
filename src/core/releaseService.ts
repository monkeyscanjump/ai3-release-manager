import axios, { AxiosError, AxiosRequestConfig } from 'axios';
import * as cheerio from 'cheerio';
import { NetworkType, ReleaseTag, ReleaseAsset, NetworkNotFoundError, GithubReleaseError } from '@/models';
import { Logger, getReleasesUrl } from '@/utils';
import defaults from '@/config/defaults';

export class ReleaseService {
  private cache: Map<string, { data: ReleaseTag[], timestamp: number }> = new Map();
  private cacheTTL = defaults.defaultCacheTTL;
  private networkPrefixes: Record<string, NetworkType> = {...defaults.defaultNetworkPrefixes};

  /**
   * Fetches all release tags from a GitHub repository using the GitHub API if possible,
   * falling back to HTML scraping if API access fails or is unavailable
   */
  public async getAllReleaseTags(repo: string, token?: string): Promise<ReleaseTag[]> {
    try {
      // Check cache first
      const cacheKey = `releases_${repo}`;
      const cachedData = this.cache.get(cacheKey);
      const now = Date.now();

      if (cachedData && (now - cachedData.timestamp) < this.cacheTTL) {
        Logger.debug(`Using cached release data for ${repo}`);
        return cachedData.data;
      }

      // Try API first if token is provided, otherwise go straight to HTML scraping
      if (token) {
        try {
          Logger.debug(`Attempting to fetch releases using GitHub API for ${repo}`);
          const apiTags = await this.fetchTagsFromApi(repo, token);

          // Update cache
          this.cache.set(cacheKey, {
            data: apiTags,
            timestamp: now
          });

          return apiTags;
        } catch (apiError) {
          // Handle token-specific errors with clearer messages
          if (axios.isAxiosError(apiError)) {
            const status = apiError.response?.status;

            if (status === 401) {
              Logger.warn('GitHub API authentication failed. Your token may be invalid or expired.');
            } else if (status === 403) {
              const remainingRateLimit = apiError.response?.headers?.['x-ratelimit-remaining'];
              if (remainingRateLimit === '0') {
                Logger.warn('GitHub API rate limit exceeded. Try again later or use a token with higher rate limits.');
              } else {
                Logger.warn('GitHub API access forbidden. Your token may lack the necessary permissions.');
              }
            } else if (status === 404) {
              Logger.warn(`GitHub repository ${repo} not found or your token lacks access to it.`);
            } else {
              Logger.warn(`GitHub API request failed with status ${status}: ${apiError.message}`);
            }
          } else {
            Logger.warn('GitHub API request failed:', apiError instanceof Error ? apiError.message : String(apiError));
          }

          Logger.info('Falling back to HTML scraping method');
          // Continue with HTML scraping as fallback
        }
      } else {
        Logger.debug('No GitHub token provided, using HTML scraping');
      }

      // HTML scraping approach (fallback)
      const releasesUrl = getReleasesUrl(repo);
      Logger.debug(`Fetching releases from ${releasesUrl}`);

      const config: AxiosRequestConfig = {
        headers: {
          'User-Agent': 'AI3-Release-Manager',
          'Accept': 'text/html'
        },
        timeout: defaults.apiRequestTimeoutMs
      };

      const response = await axios.get(releasesUrl, config);
      const $ = cheerio.load(response.data);

      const releaseTags: ReleaseTag[] = [];

      // Find all release links
      $('.Link--primary.Link, a[href*="/releases/tag/"]')
        .filter((_, el) => $(el).attr('href')?.includes('/releases/tag/') ?? false)
        .each((_, el) => {
          const href = $(el).attr('href');
          if (href) {
            const tag = href.split('/releases/tag/')[1];

            if (tag) {
              // Check network type using the configured prefixes
              for (const [prefix, network] of Object.entries(this.networkPrefixes)) {
                if (tag.startsWith(prefix)) {
                  const date = tag.replace(new RegExp(`^${prefix.replace('-', '\\-')}`), '');

                  releaseTags.push({
                    tag,
                    network,
                    date
                  });
                  break;
                }
              }
            }
          }
        });

      Logger.debug(`Found ${releaseTags.length} release tags via HTML scraping`);

      // Update cache
      this.cache.set(cacheKey, {
        data: releaseTags,
        timestamp: now
      });

      return releaseTags;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const axiosError = error as AxiosError;
        if (axiosError.response) {
          const status = axiosError.response.status;
          if (status === 404) {
            throw new GithubReleaseError(`Repository ${repo} not found. Check that the repository exists and is spelled correctly.`);
          } else if (status === 403) {
            throw new GithubReleaseError(`Access to ${repo} is forbidden. This may be due to rate limiting or repository visibility restrictions.`);
          } else {
            throw new GithubReleaseError(`Failed to fetch release tags: HTTP ${status}`);
          }
        } else if (axiosError.request) {
          throw new GithubReleaseError(`Network error while fetching release tags. Please check your internet connection.`);
        }
      }

      if (error instanceof Error) {
        throw new GithubReleaseError(`Failed to fetch release tags: ${error.message}`);
      } else {
        throw new GithubReleaseError('Failed to fetch release tags: Unknown error');
      }
    }
  }

  /**
   * Fetches release tags using GitHub API
   * This is an alternative to HTML scraping but requires a token
   */
  private async fetchTagsFromApi(repo: string, token: string): Promise<ReleaseTag[]> {
    try {
      const formattedRepo = repo.replace(/^https:\/\/github\.com\//, '');
      const [owner, repoName] = formattedRepo.split('/');

      const config: AxiosRequestConfig = {
        headers: {
          'Authorization': `token ${token}`,
          'User-Agent': 'AI3-Release-Manager',
          'Accept': 'application/vnd.github.v3+json'
        },
        timeout: defaults.apiRequestTimeoutMs
      };

      const apiUrl = `https://api.github.com/repos/${owner}/${repoName}/releases`;
      Logger.debug(`Fetching releases from GitHub API: ${apiUrl}`);

      const response = await axios.get(apiUrl, config);

      const releaseTags: ReleaseTag[] = [];

      for (const release of response.data) {
        const tag = release.tag_name;

        // Check network type using the configured prefixes
        for (const [prefix, network] of Object.entries(this.networkPrefixes)) {
          if (tag.startsWith(prefix)) {
            const date = tag.replace(new RegExp(`^${prefix.replace('-', '\\-')}`), '');

            const assets: ReleaseAsset[] = release.assets.map((asset: any) => ({
              name: asset.name,
              size: asset.size,
              downloadUrl: asset.browser_download_url
            }));

            releaseTags.push({
              tag,
              network,
              date,
              publishedAt: release.published_at,
              assets
            });
            break;
          }
        }
      }

      Logger.debug(`Found ${releaseTags.length} release tags via API`);
      return releaseTags;
    } catch (error) {
      // Enhanced token-related error handling
      if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        const headers = error.response?.headers;
        const data = error.response?.data;

        if (status === 401) {
          throw new GithubReleaseError(
            'GitHub API authentication failed. Your token is invalid or has expired. Please generate a new token.'
          );
        } else if (status === 403) {
          // Check if this is a rate limit issue
          if (headers && headers['x-ratelimit-remaining'] === '0') {
            const resetTime = headers['x-ratelimit-reset']
              ? new Date(parseInt(headers['x-ratelimit-reset'], 10) * 1000).toLocaleString()
              : 'unknown time';

            throw new GithubReleaseError(
              `GitHub API rate limit exceeded. Rate limit will reset at ${resetTime}.`
            );
          } else {
            // Check if there's a specific message in the API response
            const message = data && typeof data === 'object' && 'message' in data
              ? String(data.message)
              : 'Your token may lack the necessary permissions for this repository.';

            throw new GithubReleaseError(`GitHub API access forbidden: ${message}`);
          }
        } else if (status === 404) {
          throw new GithubReleaseError(
            `Repository '${repo}' not found or your token doesn't have access to it.`
          );
        } else if (status) {
          throw new GithubReleaseError(`GitHub API request failed with status ${status}`);
        } else if (error.request) {
          throw new GithubReleaseError(
            'Network error while connecting to GitHub API. Please check your internet connection.'
          );
        }
      }

      // Handle non-axios errors
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new GithubReleaseError(`Failed to fetch releases from GitHub API: ${errorMessage}`);
    }
  }

  /**
   * Gets the latest release tag for a specific network
   */
  public async getLatestReleaseTag(repo: string, networkType: NetworkType, token?: string): Promise<ReleaseTag> {
    try {
      const releaseTags = await this.getAllReleaseTags(repo, token);

      // Filter by network type
      const networkReleaseTags = releaseTags.filter(
        tag => tag.network === networkType
      );

      if (networkReleaseTags.length === 0) {
        throw new NetworkNotFoundError(networkType);
      }

      Logger.debug(`Found ${networkReleaseTags.length} tags for network ${networkType}`);

      // First try to sort by publishedAt from API if available
      const hasPublishedAt = networkReleaseTags.some(tag => tag.publishedAt !== undefined);

      if (hasPublishedAt) {
        Logger.debug('Using publishedAt dates from API for sorting');
        networkReleaseTags.sort((a, b) => {
          const dateA = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
          const dateB = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
          return dateB - dateA;
        });
      } else {
        // Fall back to our date parsing from tag names
        Logger.debug('Using extracted dates from tag names for sorting');
        networkReleaseTags.sort((a, b) => {
          try {
            const dateA = new Date(a.date);
            const dateB = new Date(b.date);

            // Check if dates are valid before comparing
            if (!isNaN(dateA.getTime()) && !isNaN(dateB.getTime())) {
              return dateB.getTime() - dateA.getTime();
            }

            // Fallback to string comparison for semver-like formats or non-standard dates
            return b.date.localeCompare(a.date, undefined, { numeric: true, sensitivity: 'base' });
          } catch (e) {
            // If parsing fails, use string comparison
            return b.date.localeCompare(a.date);
          }
        });
      }

      Logger.debug(`Latest tag for ${networkType}: ${networkReleaseTags[0].tag}`);
      return networkReleaseTags[0];
    } catch (error) {
      // Make sure token errors propagate with clear messages
      if (error instanceof GithubReleaseError) {
        throw error;
      } else if (error instanceof Error) {
        throw new GithubReleaseError(`Failed to get latest release tag: ${error.message}`);
      } else {
        throw new GithubReleaseError(`Failed to get latest release tag: ${String(error)}`);
      }
    }
  }

  /**
   * Configure the service with custom options
   */
  public configure(options: {
    cacheTTL?: number;
    networkPrefixes?: Record<string, NetworkType>;
  }): void {
    if (options.cacheTTL) {
      this.cacheTTL = options.cacheTTL;
      Logger.debug(`Cache TTL set to ${this.cacheTTL}ms`);
    }

    if (options.networkPrefixes) {
      this.networkPrefixes = {
        ...this.networkPrefixes,
        ...options.networkPrefixes
      };
      Logger.debug(`Network prefixes updated: ${Object.keys(this.networkPrefixes).join(', ')}`);
    }
  }

  /**
   * Clear the cache
   */
  public clearCache(): void {
    this.cache.clear();
    Logger.debug('Release service cache cleared');
  }
}
