

export class HttpError extends Error {
  name = 'HttpError';

  constructor(
    readonly status: number,
    readonly message: string) {
    super(message);
  }
}