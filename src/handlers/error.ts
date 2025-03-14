import { Logger } from '@/utils/logger';
import { cleanupTemporaryFiles } from '@/utils/fs';
import { ensureAbsolutePath } from '@/utils/env';
import { defaults } from '@/config';

/**
 * Set up global error handlers for unhandled errors and interruptions
 */
export function setupErrorHandlers(options?: { outputDir?: string }): void {
  const outputDir = options?.outputDir ?
    ensureAbsolutePath(options?.outputDir) :
    ensureAbsolutePath('./downloads');

  // Common cleanup function for all termination scenarios
  const cleanup = (immediate = false) => {
    Logger.info('Cleaning up temporary files...');

    if (immediate) {
      cleanupTemporaryFiles(outputDir);
      Logger.info('Cleanup complete. Exiting immediately.');
      process.exit(0);
    }

    // Set a timeout to force exit after 10 seconds
    const forceExitTimeout = setTimeout(() => {
      Logger.warn('Forced exit after timeout');
      process.exit(1);
    }, defaults.forceExitTimeoutMs);

    // Clear the timeout if we exit normally
    forceExitTimeout.unref();

    cleanupTemporaryFiles(outputDir);
    Logger.info('Cleanup complete. Exiting gracefully.');
    process.exit(0);
  };

  // Handle unhandled promise rejections
  process.on('unhandledRejection', (reason, promise) => {
    Logger.error('Unhandled Rejection:', reason);

    // Clean up any partial downloads or lock files
    cleanupTemporaryFiles(outputDir);

    process.exit(1);
  });

  // Handle uncaught exceptions
  process.on('uncaughtException', (error) => {
    Logger.error('Uncaught Exception:', error);

    // Clean up any partial downloads or lock files
    cleanupTemporaryFiles(outputDir);

    process.exit(1);
  });

  // Handle SIGINT (Ctrl+C)
  process.on('SIGINT', () => {
    Logger.info('\nInterrupted. Cleaning up...');
    cleanup();
  });

  // Handle SIGTERM (standard termination signal, used by PM2)
  process.on('SIGTERM', () => {
    Logger.info('Termination signal received. Cleaning up...');
    cleanup();
  });

  // Handle PM2's shutdown message
  process.on('message', (msg) => {
    if (msg === 'shutdown') {
      Logger.info('PM2 shutdown message received. Cleaning up...');
      cleanup();
    }
  });
}
