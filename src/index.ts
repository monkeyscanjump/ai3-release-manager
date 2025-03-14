#!/usr/bin/env node

import { setupErrorHandlers } from '@/handlers/error';
import { parseCliArguments, runCliCommand } from '@/cli/cli';
import { PM2Metrics } from '@/utils/pm2io';
import { isRunningUnderPM2 } from '@/utils/env';
import { checkForUpdates } from '@/utils/update-checker';
import { fileURLToPath } from 'url';

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

// CLI support - REPLACE THIS SECTION
// Check if this module is being run directly (not imported)
if (require.main === module) {
  // Your existing code that runs when the file is executed directly
  checkForUpdates(true).catch(() => {});
  const options = parseCliArguments();
  runCliCommand(options);
}
