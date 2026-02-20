import { Router } from 'express';

export const router = Router();


export default function(app: Router) {
  app.use('/v1', router);
};