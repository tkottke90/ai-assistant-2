import type { Logger } from 'winston';
import { checkDbHealth } from './database.js';

export interface DbHealthState {
  healthy: boolean;
  checkedAt: Date;
  lastError: string | null;
}

/**
 * Polls the database on a fixed interval and caches the result in memory.
 *
 * Consumers read `state` directly — no live I/O on every request.
 * Attach to `app.dbHealth` at startup.
 */
export class DbHealthMonitor {
  private timer: ReturnType<typeof setInterval> | null = null;

  state: DbHealthState = {
    healthy: true,
    checkedAt: new Date(),
    lastError: null,
  };

  constructor(
    private readonly logger: Logger,
    private readonly intervalMs = 15_000,
  ) {}

  /** Runs an immediate check then starts the polling interval. */
  async start(): Promise<void> {
    await this.check();
    this.timer = setInterval(() => {
      this.check().catch(() => {
        // check() never throws — this is a safety net only
      });
    }, this.intervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async check(): Promise<void> {
    const wasHealthy = this.state.healthy;

    try {
      const healthy = await checkDbHealth();
      this.state = { healthy, checkedAt: new Date(), lastError: null };

      if (!wasHealthy && healthy) {
        this.logger.info('Database connection restored.');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.state = { healthy: false, checkedAt: new Date(), lastError: message };

      if (wasHealthy) {
        this.logger.warn(`Database health check failed — DB may be unreachable. Error: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }
}
