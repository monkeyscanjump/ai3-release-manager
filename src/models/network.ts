/**
 * Supported network types for releases
 */
export type NetworkType = 'taurus' | 'mainnet' | 'testnet' | 'devnet';

import { ReleaseAsset } from './asset';
/**
 * Information about a release tag
 */
export interface ReleaseTag {
  tag: string;
  network: NetworkType;
  date: string;
  publishedAt?: string;
  assets?: ReleaseAsset[];
}

/**
 * Error thrown when a network release is not found
 */
export class NetworkNotFoundError extends Error {
  public network: NetworkType;

  constructor(network: NetworkType) {
    super(`No releases found for network: ${network}`);
    this.name = 'NetworkNotFoundError';
    this.network = network;
  }
}
