import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';

export const router = Router();

router.get('/list', (req, res) => {
  const configs = Object.keys(req.app.config._configData);
  
  res.json({
    links: configs.reduce<Record<string, string>>((output, key) => {
      output[key] = `/v1/config/${key}`;
      return output;
    }, {})
  });
});

router.get('/:config', (req, res) => {
  const configStr = req.app.config.get(req.params.config, '');

  const config = JSON.parse(configStr);

  res.json(config);
});

router.get('/', (req, res) => {  
  res.json(req.app.config._configData);
});


export default router;