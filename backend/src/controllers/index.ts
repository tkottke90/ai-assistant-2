import { Router, Request, Response } from 'express';
import registerV1Router from './v1/index.js';

export const router = Router();

registerV1Router(router);

router.get('/', (req: Request, res: Response) => {
  res.json({
    version: req.app.config.get('appVersion'),
    name: req.app.config.get('appName')
  });
});

router.get('/health', (req, res) => {
  res.json({ status: 'OKAY' });
});

export default function(app: Router) {
  app.use('/api', router);
};