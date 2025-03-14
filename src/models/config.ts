import { AssetMapping } from './asset';
import { NetworkType } from './network';

/**
 * Configuration options for the downloader
 */
export interface DownloaderOptions {
  repo: string;
  networkType: NetworkType;
  assetMappings: AssetMapping[];
  outputDir?: string;
  forceUpdate?: boolean;
  verbose?: boolean;
  concurrency?: number;
  logToFile?: boolean;
  logFilePath?: string;
  githubToken?: string;
  makeExecutable?: boolean;
  enablePM2Metrics?: boolean;
  releaseOptions?: {
    token?: string;
    cacheTTL?: number;
    networkPrefixes?: Record<string, NetworkType>;
    downloadTimeout?: number;
  };
}
