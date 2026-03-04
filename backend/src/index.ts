import startApp, { app } from './app.js';

const server = startApp(() => {});

function shutdown(signal: string) {
  app.logger.info(`Received ${signal} — shutting down gracefully.`);

  app.dbHealth.stop();

  server.close(() => {
    app.logger.info('HTTP server closed.');
    process.exit(0);
  });

  // Force-exit if the server hasn't closed within 10 seconds
  setTimeout(() => {
    app.logger.warn('Graceful shutdown timed out — forcing exit.');
    process.exit(1);
  }, 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));