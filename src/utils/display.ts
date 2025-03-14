/**
 * Format bytes to a human-readable format
 */
export function formatBytes(bytes: number, decimals = 2): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB'];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

/**
 * Creates a CLI progress bar
 */
export function createProgressBar(total: number, width = 30): {
  update: (current: number) => void;
  complete: () => void;
} {
  let lastStr = '';

  return {
    update: (current: number) => {
      const percentage = Math.min(100, Math.floor((current / total) * 100));
      const filledWidth = Math.floor(width * (percentage / 100));
      const emptyWidth = width - filledWidth;

      const progressBar = `[${'='.repeat(filledWidth)}${emptyWidth ? '>' : ''}${' '.repeat(Math.max(0, emptyWidth - 1))}] ${percentage}%`;

      // Only update if changed to reduce flickering
      if (progressBar !== lastStr) {
        process.stdout.write(`\r${progressBar}`);
        lastStr = progressBar;
      }
    },
    complete: () => {
      process.stdout.write('\n');
    }
  };
}
