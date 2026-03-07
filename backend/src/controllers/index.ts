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

router.get('/health/db', (req, res) => {
  const { healthy, checkedAt, lastError } = req.app.dbHealth.state;
  const body = { healthy, checkedAt };

  if (!healthy) {
    res.status(503).json({ ...body, error: lastError });
  } else {
    res.json(body);
  }
});

export default function(app: Router) {
  app.use('/api', router);
};