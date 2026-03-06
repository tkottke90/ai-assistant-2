import type { Application } from 'express';
import type { Server } from 'http';

const GRACEFUL_SHUTDOWN_TIMEOUT_MS = 10_000;

/**
 * Attaches a `shutdown(code?)` method to the app instance. Must be called after
 * the HTTP server is bound (i.e. inside or after the `listen` callback) so that
 * `server.close()` is available to drain in-flight requests.
 */
export default function setupShutdown(app: Application, server: Server) {
  app.shutdown = (code = 1) => {
    app.logger?.error('Initiating graceful shutdown...');

    app.dbHealth?.stop();

    server.close(() => {
      app.logger?.info('HTTP server closed — exiting.');
      process.exit(code);
    });

    // Force exit if open connections don't drain in time
    setTimeout(() => {
      app.logger?.error('Graceful shutdown timed out — forcing exit.');
      process.exit(code);
    }, GRACEFUL_SHUTDOWN_TIMEOUT_MS).unref();
  };
}
