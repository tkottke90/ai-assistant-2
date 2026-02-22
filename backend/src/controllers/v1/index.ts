import { Router } from 'express';
import Assets from './assets.js';

export const router = Router();

router.use('/assets', Assets);

export default function(app: Router) {
  app.use('/v1', router);
};