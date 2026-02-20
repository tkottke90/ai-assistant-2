import express from 'express';
import setupControllers from './controllers';
import setupStaticController from './controllers/static';
import setupConfig from './lib/config';
import setupLogger from './lib/logger';

// Setup Application
export const app = express();
setupConfig(app);
setupLogger(app);

// Middleware
app.use(express.json());

// Controllers
setupControllers(app);
setupStaticController(app);

// Startup function
export default function(callback: (app: express.Application) => void) {
  const host = app.config.get('server.host', 'localhost');
  const port = app.config.getNumber('server.port', 6060);
  
  app.listen(port, host, () => {
    app.logger.info(`Server is running at http://${host}:${port}`);
    callback(app);
  });
}