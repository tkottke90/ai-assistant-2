import { BaseError } from '@tkottke90/js-errors';

export class BadRequestError extends BaseError {
  statusCode = 400;
  details?: any;

  constructor(message: string) {
    super(message);
    this.name = 'BadRequestError';
  }
}

export class NotFoundError extends BaseError {
  statusCode = 404;

  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}

export class InternalServerError extends BaseError {
  statusCode = 500;

  constructor(message: string) {
    super(message);
    this.name = 'InternalServerError';
  }
}