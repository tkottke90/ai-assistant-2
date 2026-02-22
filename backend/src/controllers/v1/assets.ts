import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';

export const router = Router();

router.get('/:id/view', (req, res) => {
  const assetId = req.params.id;

  const filePath = path.join(req.app.config.get('assetDir'), `${assetId}.jpg`);
  const stat = fs.statSync(filePath);

  // Set response headers for download behavior
  res.setHeader('Content-Disposition', 'attachment; filename=largefile.zip');
  res.setHeader('Content-Type', 'application/octet-stream'); // Generic binary file type
  res.setHeader('Content-Length', stat.size);

  // Create a readable stream and pipe it to the response
  const fileStream = fs.createReadStream(filePath);
  fileStream.pipe(res);
});

export default router;