import { Logger } from '@utils/logger';

/**
 * PM2io metrics integration
 */

// Define our own interface for PM2io functionality
interface PM2IoCounter {
  inc(count?: number): void;
  dec(count?: number): void;
}

interface PM2IoMeter {
  mark(value: number): void;
}

interface PM2IoHistogram {
  update(value: number): void;
}

interface PM2IoMetric {
  (value: any): void;
}

interface PM2IoInterface {
  counter(options: { name: string; id: string }): PM2IoCounter;
  meter(options: { name: string; id: string }): PM2IoMeter;
  histogram(options: { name: string; measurement: string; id: string }): PM2IoHistogram;
  metric(options: { name: string; type: string; id: string; unit: string; historic: boolean; measurement: string }, fn: () => number): PM2IoMetric;
  action(name: string, fn: (reply: Function) => void): void;
}

let pmx: any;
let io: PM2IoInterface | null = null;

// Try to load pm2io if available
try {
  pmx = require('@pm2/io');
  io = pmx.init({
    tracing: {
      enabled: true,
      detailedDatabasesCalls: true
    }
  });
} catch (e) {
  // PM2io module not available, which is fine
  Logger.debug('PM2io module not available, metrics will be disabled');
}

/**
 * PM2io metrics wrapper
 */
export class PM2Metrics {
  private static metrics: {
    downloads?: PM2IoCounter;
    downloadErrors?: PM2IoCounter;
    bytesDownloaded?: PM2IoMeter;
    downloadTime?: PM2IoHistogram;
  } = {};

  private static isEnabled = !!io;
  private static reconnectionTimer: NodeJS.Timeout | null = null;

  /**
   * Initialize PM2io metrics
   */
  public static init(): void {
    if (!this.isEnabled) return;

    try {
      // Create metrics
      this.metrics.downloads = io!.counter({
        name: 'Asset Downloads',
        id: 'app/downloads/count'
      });

      this.metrics.downloadErrors = io!.counter({
        name: 'Download Errors',
        id: 'app/downloads/errors'
      });

      this.metrics.bytesDownloaded = io!.meter({
        name: 'Bytes Downloaded',
        id: 'app/downloads/bytes'
      });

      // Track download time as histogram
      this.metrics.downloadTime = io!.histogram({
        name: 'Download Time (ms)',
        measurement: 'mean',
        id: 'app/downloads/time'
      });

      // Add memory metrics
      io!.metric({
        name: 'Memory Usage',
        type: 'metric',
        id: 'app/memory',
        unit: 'MB',
        historic: true,
        measurement: 'mean'
      }, () => {
        const usage = process.memoryUsage();
        return Math.round(usage.heapUsed / 1024 / 1024 * 100) / 100;
      });

      // Create actions
      io!.action('clear-cache', (cb: Function) => {
        try {
          // Signal to clear cache
          process.emit('clear-cache' as any);
          cb({ success: true });
        } catch (e) {
          Logger.error('Failed to process clear-cache action:', e);
          cb({ success: false, error: String(e) });
        }
      });

      Logger.debug('PM2io metrics initialized successfully');
    } catch (error) {
      Logger.error('Failed to initialize PM2io metrics:', error);
      this.isEnabled = false;
    }
  }

  /**
   * Increment download counter
   */
  public static incrementDownloads(count: number = 1): void {
    if (!this.isEnabled || !this.metrics.downloads) return;
    try {
      this.metrics.downloads.inc(count);
    } catch (e) {
      Logger.debug('Error incrementing downloads metric:', e);
      this.reconnect(); // Add reconnection attempt on error
    }
  }

  /**
   * Increment download errors counter
   */
  public static incrementErrors(count: number = 1): void {
    if (!this.isEnabled || !this.metrics.downloadErrors) return;
    try {
      this.metrics.downloadErrors.inc(count);
    } catch (e) {
      Logger.debug('Error incrementing errors metric:', e);
      this.reconnect(); // Add reconnection attempt on error
    }
  }

  /**
   * Add bytes to downloaded counter
   */
  public static addBytesDownloaded(bytes: number): void {
    if (!this.isEnabled || !this.metrics.bytesDownloaded) return;
    try {
      this.metrics.bytesDownloaded.mark(bytes);
    } catch (e) {
      Logger.debug('Error adding bytes to downloaded metric:', e);
      this.reconnect(); // Add reconnection attempt on error
    }
  }

  /**
   * Record download time
   */
  public static recordDownloadTime(timeMs: number): void {
    if (!this.isEnabled || !this.metrics.downloadTime) return;
    try {
      this.metrics.downloadTime.update(timeMs);
    } catch (e) {
      Logger.debug('Error recording download time metric:', e);
      this.reconnect(); // Add reconnection attempt on error
    }
  }

  /**
   * Attempt to reconnect to PM2io if connection is lost
   */
  public static reconnect(): void {
    if (this.reconnectionTimer) return;

    this.reconnectionTimer = setTimeout(() => {
      try {
        Logger.debug('Attempting to reconnect to PM2io');
        this.init();
        this.reconnectionTimer = null;
      } catch (error) {
        Logger.error('Failed to reconnect to PM2io:', error);
      }
    }, 30000); // Try again in 30 seconds
  }

  /**
   * Check if PM2io is enabled
   */
  public static isPM2ioEnabled(): boolean {
    return this.isEnabled;
  }
}
