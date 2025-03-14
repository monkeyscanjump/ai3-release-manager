#!/usr/bin/env node

import { setupErrorHandlers } from '@/handlers/error';
import { parseCliArguments, runCliCommand } from '@/cli/cli';
import { PM2Metrics } from '@/utils/pm2io';
import { isRunningUnderPM2 } from '@/utils/env';
import { checkForUpdates } from '@/utils/update-checker';

// Export all public API components
export * from '@/models';
export * from '@/core/downloader';
export * from '@/utils';
export * from '@/handlers/permissions';

// Initialize PM2io metrics if running under PM2
if (isRunningUnderPM2()) {
  PM2Metrics.init();
}

// Set up global error handlers
setupErrorHandlers();

// CLI support
if (require.main === module) {
  // Check for updates but don't block execution
  checkForUpdates(true).catch(() => {
    // Silently ignore update check errors
  });

  // Parse CLI arguments and run the command
  const options = parseCliArguments();
  runCliCommand(options);
}
