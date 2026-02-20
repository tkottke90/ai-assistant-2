import express from 'express';
import setupControllers from './controllers';
import setupStaticController from './controllers/static';

export const app = express();

// Middleware
app.use(express.json());

// Controllers
setupControllers(app);
setupStaticController(app);

// Startup function
export default function(callback: (app: express.Application) => void, port: number = 6060, host: string = 'localhost') {
  app.listen(port, host, () => {
    console.log(`Server is running at http://${host}:${port}`);
    callback(app);
  });
}