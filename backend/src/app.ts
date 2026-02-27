import express from 'express';
import setupControllers from './controllers';
import setupStaticController from './controllers/static';
import setupConfig from './lib/config';
import setupLogger from './lib/logger';
import setupLLMs from './lib/llm';
import setupAgentManager from './lib/agents';
import HttpEventMiddleware from './middleware/http.middleware.js';
import { errorHandler } from './middleware/error.middleware.js';

// Setup Application
export const app = express();
setupConfig(app);
setupLogger(app);
setupLLMs(app);
setupAgentManager(app);

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(HttpEventMiddleware);

// Controllers
setupControllers(app);
setupStaticController(app);

// Error Handling
app.use(errorHandler); // Make sure this is the last middleware to be added

// Startup function
export default function(callback: (app: express.Application) => void) {
  const host = app.config.get('server.host', 'localhost');
  const port = app.config.getNumber('server.port', 6060);
  
  app.listen(port, host, () => {
    app.logger.info(`Server is running at http://${host}:${port}`);
    callback(app);
  });
}