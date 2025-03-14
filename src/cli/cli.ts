import * as path from 'path';
import {
  AssetMapping,
  DownloaderOptions,
  NetworkType
} from '@/models';
import { GithubReleaseDownloader } from '@core/downloader';
import { loadConfig, Logger, formatBytes } from '@/utils';
import { ensureAbsolutePath, isRunningUnderPM2 } from '@/utils/env';
import defaults from '@/config/defaults';

/**
 * Display help information and exit
 */
function displayHelp(): void {
  console.log(`
AI3 Release Manager
A robust utility for downloading assets from GitHub releases

USAGE:
  ai3-release-manager [OPTIONS]
  ai3-release-manager <repo> <network-type> [output-directory]
  ai3-release-manager --repo <repo> --network <network-type> [OPTIONS]

EXAMPLES:
  ai3-release-manager                                  # Use defaults (autonomys/subspace mainnet)
  ai3-release-manager subspace/subspace mainnet        # Download from specified repo and network
  ai3-release-manager --repo subspace/subspace --network mainnet --output ./downloads --executable

OPTIONS:
  -h, --help                   Show this help message and exit
  -r, --repo <repo>            Repository name in format 'owner/repo'
                               Default: ${defaults.defaultRepo}
  -n, --network <network>      Network type (${defaults.validNetworkTypes.join(', ')})
                               Default: ${defaults.defaultNetworkType}
  -o, --output <dir>           Output directory for downloaded files
                               Default: ${defaults.defaultOutputDir}
  -f, --force                  Force download even if files already exist
  -e, --executable             Make downloaded files executable (Unix systems)
  -v, --verbose                Show verbose output
  -c, --concurrency <num>      Number of concurrent downloads
                               Default: ${defaults.defaultConcurrency}
  --log-file [path]            Enable logging to file (optional path)
  -t, --token <token>          GitHub API token for authenticated requests

ENVIRONMENT VARIABLES:
  GITHUB_REPO                  Repository name
  NETWORK_TYPE                 Network type
  OUTPUT_DIR                   Output directory
  FORCE_UPDATE                 Force update (true or false)
  MAKE_EXECUTABLE              Make files executable (true or false)
  GITHUB_TOKEN                 GitHub API token
  CONFIG_FILE                  Path to config file (default: ${defaults.defaultConfigFilePath})

CONFIGURATION FILE:
  Configuration can also be provided in JSON format in:
  - ${defaults.defaultConfigFilePath}
  - ~/.ai3-release-manager.json

For more information, see: https://github.com/monkeyscanjump/ai3-release-manager
`);
  process.exit(0);
}

/**
 * Parse command line arguments with better options
 */
export function parseCliArguments(): DownloaderOptions {
  const args = process.argv.slice(2);

  // Show help if requested
  if (args.includes('--help') || args.includes('-h')) {
    displayHelp();
  }

  // Check for environment variables first
  const envRepo = process.env.GITHUB_REPO;
  const envNetworkType = process.env.NETWORK_TYPE as NetworkType;
  const envOutputDir = process.env.OUTPUT_DIR;
  const envForceUpdate = process.env.FORCE_UPDATE === 'true';
  const envMakeExecutable = process.env.MAKE_EXECUTABLE === 'true';

  // Command-line args override environment variables
  let repo = envRepo;
  let networkType = envNetworkType;
  let outputDir = envOutputDir ? ensureAbsolutePath(envOutputDir) : ensureAbsolutePath(defaults.defaultOutputDir);
  let forceUpdate = envForceUpdate;
  let verbose = false;
  let concurrency = defaults.defaultConcurrency;
  // Enable file logging by default when running under PM2
  let logToFile = isRunningUnderPM2();
  let logFilePath = '';
  let token = process.env.GITHUB_TOKEN;
  let makeExecutable = envMakeExecutable;

  const validNetworks: NetworkType[] = defaults.validNetworkTypes;

  // First, parse positional arguments according to documentation:
  // ai3-release-manager <repo> <network-type> [output-directory]
  const positionalArgs = args.filter(arg => !arg.startsWith('-'));
  if (positionalArgs.length >= 1 && !repo) {
    repo = positionalArgs[0];
  }

  if (positionalArgs.length >= 2 && !networkType) {
    const inputNetwork = positionalArgs[1];
    if (validNetworks.includes(inputNetwork as NetworkType)) {
      networkType = inputNetwork as NetworkType;
    } else {
      console.error(`Invalid network type: ${inputNetwork}. Valid options are: ${validNetworks.join(', ')}`);
      process.exit(1);
    }
  }

  if (positionalArgs.length >= 3 && !outputDir) {
    // Ensure output directory is absolute
    outputDir = ensureAbsolutePath(positionalArgs[2]);
  }

  // Then parse named arguments (these will override positional args)
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--repo' || arg === '-r') {
      repo = args[++i];
    } else if (arg === '--network' || arg === '-n') {
      const inputNetwork = args[++i];
      if (validNetworks.includes(inputNetwork as NetworkType)) {
        networkType = inputNetwork as NetworkType;
      } else {
        console.error(`Invalid network type: ${inputNetwork}. Valid options are: ${validNetworks.join(', ')}`);
        process.exit(1);
      }
    } else if (arg === '--output' || arg === '-o') {
      // Ensure output directory is absolute
      outputDir = ensureAbsolutePath(args[++i]);
    } else if (arg === '--force' || arg === '-f' || arg === '--force-download') {
      forceUpdate = true;
    } else if (arg === '--verbose' || arg === '-v') {
      verbose = true;
    } else if (arg === '--concurrency' || arg === '-c') {
      concurrency = parseInt(args[++i], 10);
      if (isNaN(concurrency) || concurrency < 1) {
        console.error('Concurrency must be a positive number');
        process.exit(1);
      }
    } else if (arg === '--log-file') {
      logToFile = true;
      const logPathArg = args[++i];
      // If log path is provided, make it absolute, otherwise use default in output dir
      logFilePath = logPathArg ?
        ensureAbsolutePath(logPathArg) :
        ensureAbsolutePath(path.join(outputDir, defaults.defaultLogFileName));
    } else if (arg === '--token' || arg === '-t') {
      token = args[++i];
    } else if (arg === '--executable' || arg === '-e' || arg === '--make-executable') {
      makeExecutable = true;
    }
  }

  // Load from config file if specified
  // Make config file path absolute
  const configPath = process.env.CONFIG_FILE || defaults.defaultConfigFilePath;
  const configFile = ensureAbsolutePath(configPath);
  const fileConfig = loadConfig(configFile);

  // Command-line args override config file
  repo = repo || fileConfig.repo;
  networkType = networkType || fileConfig.networkType as NetworkType;
  // Make output directory from config absolute as well
  outputDir = outputDir || (fileConfig.outputDir ?
    ensureAbsolutePath(fileConfig.outputDir) :
    ensureAbsolutePath(defaults.defaultOutputDir));
  forceUpdate = forceUpdate || fileConfig.forceUpdate || false;
  verbose = verbose || fileConfig.verbose || false;
  concurrency = concurrency || fileConfig.concurrency || defaults.defaultConcurrency;
  logToFile = logToFile || fileConfig.logToFile || false;

  // Make log file path absolute if provided in config
  if (!logFilePath && fileConfig.logFilePath) {
    logFilePath = ensureAbsolutePath(fileConfig.logFilePath);
  } else if (!logFilePath && logToFile) {
    // Default log file location if logging is enabled but no path specified
    logFilePath = ensureAbsolutePath(path.join(outputDir, defaults.defaultLogFileName));
  }

  token = token || fileConfig.token;
  makeExecutable = makeExecutable || fileConfig.makeExecutable || false;

  // Add PM2 logging if running under PM2 and logging not explicitly configured
  if (isRunningUnderPM2() && !logToFile && !fileConfig.logToFile) {
    Logger.debug('Running under PM2, enabling file logging automatically');
    logToFile = true;
    if (!logFilePath) {
      logFilePath = ensureAbsolutePath(path.join(outputDir, defaults.defaultLogFileName));
    }
  }

  // Instead of failing, use default values for required fields
  if (!repo) {
    repo = defaults.defaultRepo;
    Logger.info(`No repository specified - using default: ${repo}`);
  }

  if (!networkType) {
    networkType = defaults.defaultNetworkType;
    Logger.info(`No network type specified - using default: ${networkType}`);
  }

  // Get asset mappings from config file if available
  const assetMappings = Array.isArray(fileConfig.assetMappings)
    ? fileConfig.assetMappings as AssetMapping[]
    : defaults.defaultAssetMappings;

  return {
    repo,
    networkType,
    outputDir,
    forceUpdate,
    verbose,
    concurrency,
    assetMappings,
    logToFile,
    logFilePath,
    githubToken: token,
    makeExecutable,
    releaseOptions: {
      token,
      networkPrefixes: fileConfig.networkPrefixes || defaults.defaultNetworkPrefixes,
      cacheTTL: fileConfig.cacheTTL || defaults.defaultCacheTTL,
      downloadTimeout: fileConfig.downloadTimeout || defaults.defaultDownloadTimeout
    }
  };
}

/**
 * Execute the CLI command with the provided options
 */
export async function runCliCommand(options: DownloaderOptions): Promise<void> {
  displayConfiguration(options);

  const downloader = new GithubReleaseDownloader(options);

  try {
    const result = await downloader.download();
    handleDownloadResult(result, options);
  } catch (error) {
    Logger.error('Fatal error:', error);
    process.exit(1);
  }
}

/**
 * Display the configuration options
 */
function displayConfiguration(options: DownloaderOptions): void {
  const { repo, networkType, outputDir, forceUpdate } = options;

  Logger.info(`Configuration:
  - Repository: ${repo}
  - Network type: ${networkType}
  - Output directory: ${outputDir}
  - Force update: ${forceUpdate ? 'Yes' : 'No'}
  - Make executable: ${options.makeExecutable ? 'Yes' : 'No'}
  - Concurrency: ${options.concurrency}
  - Verbose: ${options.verbose ? 'Yes' : 'No'}
  - Log to file: ${options.logToFile ? 'Yes' : 'No'}
  - GitHub API token: ${options.githubToken ? 'Provided' : 'Not provided'}
  `);
}

/**
 * Handle the download result and generate appropriate output
 */
function handleDownloadResult(result: any, options: DownloaderOptions): void {
  if (result.success) {
    if (result.action === 'downloaded') {
      Logger.info(`Download completed successfully for release ${result.releaseTag}`);
    } else if (result.action === 'skipped') {
      Logger.info(`All files for release ${result.releaseTag} already up to date - nothing to download`);
    } else {
      Logger.info(`Operation completed successfully`);
    }

    // Output executable permissions results if applicable
    if (options.makeExecutable && result.executableResults && result.executableResults.length > 0) {
      const successCount = result.executableResults.filter((r: any) => r.success).length;
      Logger.info(`Set executable permissions for ${successCount} of ${result.executableResults.length} files`);

      if (options.verbose) {
        result.executableResults.forEach((exec: any) => {
          const fileName = path.basename(exec.path);
          if (exec.success) {
            Logger.info(`- ${fileName}: Executable permissions set`);
          } else {
            Logger.warn(`- ${fileName}: Failed to set executable permissions`);
          }
        });
      }
    }

    if (options.verbose) {
      result.downloadedAssets.forEach((asset: any) => {
        const status = result.action === 'downloaded' ? 'Downloaded' : 'Cached';
        if (asset.success) {
          Logger.info(`${asset.name}: ${status} (${formatBytes(asset.fileSize || 0)})`);
          Logger.debug(`Hash: ${asset.hash}`);
        } else {
          Logger.warn(`${asset.name}: Failed - ${asset.error}`);
        }
      });
    }

    process.exit(0);
  } else {
    Logger.error('Download failed');

    if (result.errors && result.errors.length > 0) {
      result.errors.forEach((error: string) => Logger.error(error));
    }

    process.exit(1);
  }
}
