import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';

export const router = Router();

router.post('/', (req, res) => {
  

  res.send('Hello World');
});

export default router;