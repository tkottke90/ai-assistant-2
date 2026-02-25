import { HttpError } from '../lib/errors/http.errors';
import { Request } from 'express';

export function errorHandler(err: Error, req: Request, res: any, _: any) {
  const { logger } = req;
  
  // When explicit http errors are thrown, we can use the details
  // to provide the correct context to the client
  if (err instanceof HttpError) { 
    logger.error(`HTTP error: ${err.message}`, { stack: err.stack, details: (err as any).details });
    res.status(err.statusCode).json({ error: err.message, details: (err as any).details });
  } else {
    // Catch all other errors and return a generic 500 error to the client
    logger.error('Unhandled error:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}
