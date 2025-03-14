import { NetworkType, AssetMapping } from '@/models';

export interface DefaultConfig {
  // Default primary settings
  defaultRepo: string;
  defaultNetworkType: NetworkType;

  // Download settings
  defaultOutputDir: string;
  defaultConcurrency: number;
  defaultForceUpdate: boolean;
  defaultVerbose: boolean;
  defaultMakeExecutable: boolean;
  defaultLogToFile: boolean;

  // Default assets
  defaultAssetMappings: AssetMapping[];

  // Network configuration
  validNetworkTypes: NetworkType[];
  defaultNetworkPrefixes: Record<string, NetworkType>;

  // File paths
  defaultConfigFilePath: string;
  defaultLogFilePath: string;
  defaultLogFileName: string;
  defaultConfigFileName: string;
  alternativeConfigPaths: string[];

  // Timing and retry settings
  defaultCacheTTL: number;
  defaultDownloadTimeout: number;
  defaultMaxRetries: number;
  defaultRetryDelay: number;
  lockFileExpirationMs: number;
  forceExitTimeoutMs: number;
  apiRequestTimeoutMs: number;

  // File extensions
  tempFileExtensions: {
    part: string;
    lock: string;
    temp: string;
    meta: string;
  };

  // HTTP settings
  githubUserAgent: string;

  // Logging
  defaultLogLevel: number;
}

const defaults: DefaultConfig = {
  // Default primary settings
  defaultRepo: "autonomys/subspace",
  defaultNetworkType: "mainnet",

  // Download settings
  defaultOutputDir: './downloads',
  defaultConcurrency: 2,
  defaultForceUpdate: false,
  defaultVerbose: false,
  defaultMakeExecutable: false,
  defaultLogToFile: false,

  // Default assets
  defaultAssetMappings: [
    { source: 'subspace-farmer-ubuntu-x86_64-skylake', output: 'subspace-farmer' },
    { source: 'subspace-node-ubuntu-x86_64-skylake', output: 'subspace-node' }
  ],

  // Network configuration
  validNetworkTypes: ['mainnet', 'testnet', 'devnet', 'taurus'],
  defaultNetworkPrefixes: {
    'taurus-': 'testnet',
    'mainnet-': 'mainnet',
    'devnet-': 'devnet'
  },

  // File paths
  defaultConfigFilePath: './downloader-config.json',
  defaultLogFilePath: './downloads/download.log',
  defaultLogFileName: 'download.log',
  defaultConfigFileName: 'downloader-config.json',
  alternativeConfigPaths: [
    './downloader-config.json',
    '~/.ai3-release-manager.json'
  ],

  // Timing and retry settings
  defaultCacheTTL: 5 * 60 * 1000, // 5 minutes
  defaultDownloadTimeout: 120000, // 2 minutes
  defaultMaxRetries: 3,
  defaultRetryDelay: 2000, // 2 seconds
  lockFileExpirationMs: 60 * 60 * 1000, // 1 hour
  forceExitTimeoutMs: 10000, // 10 seconds
  apiRequestTimeoutMs: 10000, // 10 seconds

  // File extensions
  tempFileExtensions: {
    part: '.part',
    lock: '.lock',
    temp: '.tmp',
    meta: '.meta'
  },

  // HTTP settings
  githubUserAgent: 'AI3-Release-Manager',

  // Logging
  defaultLogLevel: 1 // INFO
};

export default defaults;
