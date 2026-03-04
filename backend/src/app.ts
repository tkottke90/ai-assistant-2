import express from 'express';
import setupControllers from './controllers';
import setupStaticController from './controllers/static';
import setupConfig from './lib/config';
import setupLogger from './lib/logger';
import setupLLMs from './lib/llm';
import setupTools from './lib/tools/manager';
import setupAgentManager from './lib/agents';
import { DbHealthMonitor } from './lib/health.js';
import HttpEventMiddleware from './middleware/http.middleware.js';
import { errorHandler } from './middleware/error.middleware.js';

// Setup Application
export const app = express();
setupConfig(app);
setupLogger(app);
setupLLMs(app);

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(HttpEventMiddleware);

// Controllers
setupControllers(app);
setupStaticController(app);

// Error Handling
app.use(errorHandler); // Make sure this is the last middleware to be added

// DB health monitor — starts polling in the background immediately
const dbHealth = new DbHealthMonitor(app.logger);
app.dbHealth = dbHealth;
dbHealth.start().catch(err => app.logger?.error('DbHealthMonitor failed to start:', err));

// Async service init: tools must be ready before agents (agents depend on tools)
setupTools(app)
  .then(() => setupAgentManager(app))
  .catch(err => app.logger?.error('Service init failed:', err));

// Startup function
export default function(callback: (app: express.Application) => void) {
  const host = app.config.get('server.host', 'localhost');
  const port = app.config.getNumber('server.port', 6060);

  const server = app.listen(port, host, () => {
    app.logger.info(`Server is running at http://${host}:${port}`);
    callback(app);
  });

  return server;
}