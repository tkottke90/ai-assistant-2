import { Router } from 'express';
import Assets from './assets.js';
import Config from './config.js';

export const router = Router();

router.use('/assets', Assets);
router.use('/config', Config);

export default function(app: Router) {
  app.use('/v1', router);
};