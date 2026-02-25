import { BaseError } from '@tkottke90/js-errors';
import { LLM_CLIENT_ERROR_PREFIX } from './constants';

export class LLMClientError extends BaseError {
  code = LLM_CLIENT_ERROR_PREFIX + '000';

  constructor(message: string) {
    super(message);
    this.name = 'LLMClientError';
  }
}

export class LLMClientNotFound extends LLMClientError {
  code = LLM_CLIENT_ERROR_PREFIX + '001';

  constructor(message: string) {
    super(message);
    this.name = 'LLMClientNotFound';
  }
}