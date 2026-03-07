import startApp, { app } from './app.js';
import setupShutdown from './lib/shutdown.js';

const server = startApp(() => {});

setupShutdown(app, server);

process.on('SIGTERM', () => {
  app.logger.info('Received SIGTERM — shutting down gracefully.');
  app.shutdown(0);
});

process.on('SIGINT', () => {
  app.logger.info('Received SIGINT — shutting down gracefully.');
  app.shutdown(0);
});