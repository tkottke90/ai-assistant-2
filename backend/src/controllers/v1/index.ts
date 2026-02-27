import { Router } from 'express';
import Agents from './agents.js';
import Assets from './assets.js';
import Chat from './chat.js';
import Config from './config.js';
import Llm from './llm.js';

export const router = Router();

router.use('/agents', Agents);
router.use('/assets', Assets);
router.use('/config', Config);
router.use('/llm', Llm);
router.use('/chat', Chat);

export default function(app: Router) {
  app.use('/v1', router);
};