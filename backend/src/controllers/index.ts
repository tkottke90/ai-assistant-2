import { Router } from 'express';


export const router = Router();

router.get('/', (req, res) => {
  res.json({ version: '1.0.0-alpha', name: 'AI Assistant 2' });
});

router.get('/health', (req, res) => {
  res.json({ status: 'OKAY' });
});

export default function(app: Router) {
  app.use('/api', router);
};