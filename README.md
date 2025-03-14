# GitHub Release Downloader

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

A robust and feature-rich utility for downloading assets from GitHub releases. This tool provides reliable, resumable downloads with advanced caching, flexible asset mapping, and extensive configuration options.

## Features

- 📦 **Easy Asset Downloads**: Download specific assets from GitHub releases
- 🏷️ **Network Type Filtering**: Filter releases by network type (mainnet, testnet, etc.)
- 💾 **Smart Caching**: Avoid unnecessary re-downloads with intelligent caching
- ⏸️ **Resumable Downloads**: Resume interrupted downloads where they left off
- 🔐 **File Integrity**: Verify downloaded files with SHA-256 hash checks
- 🚀 **Concurrent Downloads**: Control download concurrency for optimal performance
- 📊 **Progress Reporting**: Clear progress indicators during downloads
- 🔄 **Automatic Retries**: Resilient downloading with automatic retries on failures
- 🔍 **Flexible Asset Matching**: Map GitHub asset names to your local filenames
- 📝 **Detailed Logging**: Comprehensive logs with multiple verbosity levels
- 🔧 **Auto-Executable**: Automatically set executable permissions on downloaded files (Unix systems)

## Installation

### Global Installation

```bash
# Install from GitHub repository
npm install -g github:monkeyscanjump/ai3-release-manager

# Or with HTTPS
npm install -g https://github.com/monkeyscanjump/ai3-release-manager.git
```

### Local Installation (for use in projects)

```bash
# As a dependency in your project
npm install --save github:monkeyscanjump/ai3-release-manager

# Or with HTTPS
npm install --save https://github.com/monkeyscanjump/ai3-release-manager.git
```

### Installation from Source

```bash
# Clone the repository
git clone https://github.com/monkeyscanjump/ai3-release-manager.git
cd ai3-release-manager

# Install dependencies and build
npm install
npm run build

# Optional: Install globally from local copy
npm install -g .
```

## CLI Usage

### Basic Usage

```bash
ai3-release-manager <repo> <network-type> [output-directory]
```

Example:

```bash
ai3-release-manager subspace/subspace mainnet ./downloads
```

### Advanced Usage

```bash
ai3-release-manager --repo <repo> --network <network-type> --output <output-directory> [options]
```

### CLI Options

| Option | Shorthand | Description |
|--------|-----------|-------------|
| `--repo`, `-r` | Repository name in format `owner/repo` | Required |
| `--network`, `-n` | Network type (mainnet, testnet, devnet, taurus) | Required |
| `--output`, `-o` | Output directory for downloaded files | downloads |
| `--force`, `-f` | Force download even if files already exist | `false` |
| `--executable`, `-e` | Make downloaded files executable (Unix systems) | `false` |
| `--verbose`, `-v` | Show verbose output | `false` |
| `--concurrency`, `-c` | Number of concurrent downloads | `2` |
| `--log-file` | Path to log file (enables file logging) | None |
| `--token`, `-t` | GitHub API token for authenticated requests | None |

### Environment Variables

You can also use environment variables to configure the downloader:

| Environment Variable | Description | Corresponding Option |
|---------------------|-------------|---------------------|
| `GITHUB_REPO` | GitHub repository name | `--repo` |
| `NETWORK_TYPE` | Network type | `--network` |
| `OUTPUT_DIR` | Output directory | `--output` |
| `FORCE_UPDATE` | Force update (`true` or `false`) | `--force` |
| `MAKE_EXECUTABLE` | Make files executable (`true` or `false`) | `--executable` |
| `GITHUB_TOKEN` | GitHub API token | `--token` |
| `DOWNLOAD_CONCURRENCY` | Number of concurrent downloads | `--concurrency` |
| `CONFIG_FILE` | Path to config file | N/A |
| `DEBUG` | Enable debug logging when set | Sets verbose mode |

## Programmatic Usage

### Basic Example

```typescript
import { GithubReleaseDownloader, NetworkType } from 'ai3-release-manager';

async function downloadRelease() {
  const downloader = new GithubReleaseDownloader({
    repo: 'subspace/subspace',
    networkType: 'mainnet' as NetworkType,
    outputDir: './downloads'
  });

  const result = await downloader.download();

  if (result.success) {
    console.log(`Successfully downloaded ${result.downloadedAssets.length} assets from ${result.releaseTag}`);
  } else {
    console.error('Download failed:', result.errors);
  }
}

downloadRelease().catch(console.error);
```

### Full Options Example

```typescript
import { GithubReleaseDownloader, NetworkType, LogLevel } from 'ai3-release-manager';

async function downloadWithOptions() {
  const downloader = new GithubReleaseDownloader({
    repo: 'subspace/subspace',
    networkType: 'mainnet' as NetworkType,
    outputDir: './downloads',
    forceUpdate: true,
    verbose: true,
    concurrency: 4,
    logToFile: true,
    logFilePath: './logs/download.log',
    githubToken: process.env.GITHUB_TOKEN,
    makeExecutable: true, // Make downloaded files executable on Unix systems
    assetMappings: [
      { source: 'subspace-farmer-ubuntu-x86_64-skylake', output: 'subspace-farmer' },
      { source: 'subspace-node-ubuntu-x86_64-skylake', output: 'subspace-node' }
    ],
    releaseOptions: {
      token: process.env.GITHUB_TOKEN,
      cacheTTL: 10 * 60 * 1000, // 10 minutes
      networkPrefixes: {
        'custom-': 'mainnet'
      }
    }
  });

  const result = await downloader.download();

  // Process the detailed result
  console.log(`Release: ${result.releaseTag}`);

  result.downloadedAssets.forEach(asset => {
    if (asset.success) {
      console.log(`✅ ${asset.name}: ${asset.fileSize} bytes, SHA256: ${asset.hash}`);
    } else {
      console.log(`❌ ${asset.name}: Failed - ${asset.error}`);
    }
  });

  // Check executable permissions status
  if (result.executableResults) {
    const successCount = result.executableResults.filter(r => r.success).length;
    console.log(`Made ${successCount} of ${result.executableResults.length} files executable`);
  }
}
```

### Return Value (DownloadSummary)

The `download()` method returns a `DownloadSummary` object with the following structure:

```typescript
interface DownloadSummary {
  success: boolean;                // Overall success status
  releaseTag: string;              // Release tag that was processed
  action: 'downloaded' | 'skipped' | 'none'; // Action that was performed
  downloadedAssets: Array<{
    name: string;                  // Asset name
    outputPath: string;            // Full path where the asset was saved
    success: boolean;              // Individual download success
    hash?: string;                 // SHA-256 file hash (if successful)
    error?: string;                // Error message (if failed)
    fileSize?: number;             // File size in bytes
  }>;
  errors?: string[];               // List of any errors encountered
  executableResults?: Array<{      // Results of making files executable (if applicable)
    path: string;                  // File path
    success: boolean;              // Whether permission setting succeeded
  }>;
}
```

## Configuration Options

### DownloaderOptions

| Option | Type | Description | Default |
|--------|------|-------------|---------|
| `repo` | `string` | GitHub repository name (required) | - |
| `networkType` | `NetworkType` | Network type: 'mainnet', 'testnet', 'devnet', or 'taurus' (required) | - |
| `assetMappings` | `AssetMapping[]` | Asset name mappings from GitHub to local | See below |
| `outputDir` | `string` | Output directory for downloaded files | `'./downloads'` |
| `forceUpdate` | `boolean` | Force download even if files already exist | `false` |
| `makeExecutable` | `boolean` | Make downloaded files executable (Unix/Linux/macOS only) | `false` |
| `verbose` | `boolean` | Enable verbose logging | `false` |
| `concurrency` | `number` | Number of concurrent downloads | `2` |
| `logToFile` | `boolean` | Enable file logging | `false` |
| `logFilePath` | `string` | Path to log file | `''` |
| `githubToken` | `string` | GitHub API token | `undefined` |
| `releaseOptions` | `object` | Options for the release service | See below |

### AssetMapping

```typescript
interface AssetMapping {
  source: string;  // Asset name pattern on GitHub
  output: string;  // Local output filename
}
```

Default asset mappings:

```typescript
[
  { source: 'subspace-farmer-ubuntu-x86_64-skylake', output: 'subspace-farmer' },
  { source: 'subspace-node-ubuntu-x86_64-skylake', output: 'subspace-node' }
]
```

### Release Options

| Option | Type | Description | Default |
|--------|------|-------------|---------|
| `token` | `string` | GitHub API token | `undefined` |
| `cacheTTL` | `number` | Cache time-to-live in milliseconds | `300000` (5 minutes) |
| `networkPrefixes` | `Record<string, NetworkType>` | Custom network type prefixes | See below |

Default network prefixes:

```typescript
{
  'taurus-': 'testnet',
  'mainnet-': 'mainnet',
  'devnet-': 'devnet'
}
```

## Advanced Features

### File Caching

The downloader maintains a cache file (`download-state.json`) in the output directory to track downloaded assets. This prevents unnecessary re-downloads when running the tool multiple times.

Cache file structure:

```json
{
  "version": 2,
  "latestTag": "mainnet-2025-jan-14",
  "downloadedAssets": [
    "subspace-farmer",
    "subspace-node"
  ],
  "assetDetails": {
    "subspace-farmer": {
      "downloadTime": "2025-03-12T15:12:54.043Z",
      "hash": "1b0bb25b44dd793cb51895d9c6c3a89632db5337feb9bb8d3a2801d370a20bb7"
    },
    "subspace-node": {
      "downloadTime": "2025-03-12T15:12:54.044Z",
      "hash": "5eab6e0c826af530257cf1b4df4063619712f88d87d52951847fda2034565667"
    }
  },
  "lastUpdated": "2025-03-12T15:12:54.045Z"
}
```

### Resumable Downloads

If a download is interrupted, the tool creates a `.part` file. On the next run, it will detect this file and resume the download from where it left off, saving bandwidth and time.

### File Locking

When downloading assets, the tool creates a `.lock` file to prevent concurrent downloads of the same asset. This is useful when running multiple instances of the tool.

### Executable Permissions

When the `makeExecutable` option is enabled, the tool will automatically set executable permissions (chmod +x) on downloaded files on Unix-like systems (Linux, macOS). This is particularly useful for downloading binary files that need to be executed.

On Windows systems, this feature does nothing as Windows handles executable permissions differently.

### GitHub API Integration

When a GitHub token is provided, the downloader uses the GitHub API for more reliable data fetching. Without a token, it falls back to HTML scraping, which may be subject to rate limiting.

## Configuration File

You can create a `downloader-config.json` file in your working directory or specify a path via the `CONFIG_FILE` environment variable:

```json
{
  "repo": "subspace/subspace",
  "networkType": "mainnet",
  "outputDir": "./downloads",
  "forceUpdate": false,
  "makeExecutable": true,
  "verbose": false,
  "concurrency": 2,
  "logToFile": false,
  "logFilePath": "./logs/download.log",
  "token": "your-github-token",
  "assetMappings": [
    { "source": "subspace-farmer-ubuntu-x86_64-skylake", "output": "subspace-farmer" },
    { "source": "subspace-node-ubuntu-x86_64-skylake", "output": "subspace-node" }
  ],
  "networkPrefixes": {
    "custom-": "mainnet"
  },
  "cacheTTL": 300000
}
```

## Logging Levels

The logger supports four levels of logging:

- 🔍 **DEBUG**: Detailed information for debugging purposes
- ℹ️ **INFO**: General information about the download process
- ⚠️ **WARN**: Warnings that don't prevent the download from completing
- ❌ **ERROR**: Critical errors that prevent successful download

## Examples

### Download Latest Mainnet Release

```bash
ai3-release-manager subspace/subspace mainnet
```

### Force Update with Custom Output Directory

```bash
ai3-release-manager --repo subspace/subspace --network mainnet --output ./my-binaries --force
```

### Download and Make Files Executable (Linux/macOS)

```bash
ai3-release-manager subspace/subspace mainnet --executable
```

### With High Concurrency and Verbose Logging

```bash
ai3-release-manager subspace/subspace mainnet ./downloads -c 4 -v
```

### Using a GitHub Token for Higher Rate Limits

```bash
export GITHUB_TOKEN=your-token-here
ai3-release-manager subspace/subspace mainnet
```

## More Usage Examples

### Download With Custom Asset Mappings via Config File

Create a `downloader-config.json` file:

```json
{
  "assetMappings": [
    { "source": "custom-binary-darwin-amd64", "output": "my-app-macos" },
    { "source": "custom-binary-linux-amd64", "output": "my-app-linux" }
  ]
}
```

Then run:

```bash
ai3-release-manager organization/repo mainnet
```

### Download with Verbose Output and Custom Concurrency

```bash
ai3-release-manager organization/repo mainnet -v -c 4
```

### Resume Interrupted Downloads

If downloads are interrupted, simply run the same command again:

```bash
ai3-release-manager organization/repo mainnet
```

The tool will automatically continue from where it left off for any partially downloaded files.

### Use with Environment Variables in a Script

```bash
#!/bin/bash
export GITHUB_REPO="organization/repo"
export NETWORK_TYPE="mainnet"
export OUTPUT_DIR="./my-binaries"
export FORCE_UPDATE="true"
export MAKE_EXECUTABLE="true"
export GITHUB_TOKEN="your-github-token"

ai3-release-manager
```

### Download and Make Files Executable on Linux/macOS

```bash
ai3-release-manager organization/repo mainnet --executable
```

### Download with GitHub API Token from Environment

```bash
export GITHUB_TOKEN="your-github-token"
ai3-release-manager organization/repo mainnet
```

### Use with Custom Network Prefixes

Create a config file with custom network prefixes:

```json
{
  "networkPrefixes": {
    "production-": "mainnet",
    "staging-": "testnet"
  }
}
```

Then run:

```bash
ai3-release-manager organization/repo mainnet
```

## Running with PM2

### Basic PM2 Deployment

```bash
# Start with PM2
pm2 start ai3-release-manager -- subspace/subspace mainnet /data/downloads

# Using ecosystem file
pm2 start ecosystem.config.js
```

## Common Issues and Troubleshooting

### Rate Limiting

Without a GitHub token, you might encounter rate limiting. To avoid this:

1. Obtain a GitHub personal access token
2. Use it either with the `--token` option or set the `GITHUB_TOKEN` environment variable

### Download Verification

If you suspect a corrupt download, check the SHA-256 hash in the logs against the expected hash from the GitHub release.

### Resumable Downloads Not Working

If resumable downloads aren't working:

1. Check if you have write permissions in the output directory
2. Ensure no other process is modifying the `.part` files

### Executable Permissions Not Being Set

If the executable permissions aren't being applied:

1. Verify you're on a Unix-like system (Linux/macOS) - this feature doesn't work on Windows
2. Ensure your user has permission to change file modes
3. Check if the filesystem supports executable permissions (some network filesystems may not)

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the LICENSE file for details.
