import { z } from 'zod';
import { HttpError } from './error';

type HttpMethod = 'get' | 'post' | 'put' | 'delete' | 'patch';

type FunctionSchema<T> = T extends z.ZodTypeAny ? z.infer<T> : never;

// Extract the return type from outputProcessor and handle Promise unwrapping
type OutputProcessorReturnType<T> = T extends (response: Response) => infer R
  ? R extends Promise<infer U>
    ? U  // Unwrap Promise
    : R  // Keep non-Promise as-is
  : Response;  // Default to Response when no processor

interface ClientMethodOptions<Input extends z.ZodTypeAny> {
  method: HttpMethod;
  inputSchema?: Input;
  acceptedTypes?: string[];
}

// Overload 1: With outputProcessor
export function createClientMethod<
  Input extends z.ZodTypeAny,
  OutputProcessor extends (response: Response) => unknown,
  InputType = FunctionSchema<Input>,
  ReturnType = OutputProcessorReturnType<OutputProcessor>
>(
  path: string,
  options: ClientMethodOptions<Input>,
  outputProcessor: OutputProcessor
): (input: InputType, init?: RequestInit) => Promise<ReturnType>;

// Overload 2: Without outputProcessor
export function createClientMethod<
  Input extends z.ZodTypeAny,
  InputType = FunctionSchema<Input>
>(
  path: string,
  options: ClientMethodOptions<Input>
): (input: InputType, init?: RequestInit) => Promise<Response>;

// Implementation
export function createClientMethod<
  Input extends z.ZodTypeAny,
  OutputProcessor extends ((response: Response) => unknown) | undefined = undefined,
  InputType = FunctionSchema<Input>,
  ReturnType = OutputProcessor extends undefined
    ? Response
    : OutputProcessorReturnType<OutputProcessor>
>(
  path: string,
  options: ClientMethodOptions<Input>,
  outputProcessor?: OutputProcessor
): (input: InputType, init?: RequestInit) => Promise<ReturnType> {
  return (input: InputType, init: RequestInit = {}) => {
    let requestPath = path;
    let requestBody: string | undefined;

    const params = { ...input };

    // Find all placeholders in the path (e.g., :id) and replace them with corresponding values from input
    const pathParamMatches = path.match(/:\w+/g) || [];
    pathParamMatches.forEach((match) => {
      const paramName = match.substring(1); // Remove the leading ':'
      const paramValue = (params as any)[paramName];
      if (paramValue === undefined) {
        throw new Error(`Missing value for path parameter: ${paramName}`);
      }

      requestPath = requestPath.replace(match, encodeURIComponent(String(paramValue)));
      delete (params as any)[paramName]; // Remove the path parameter from params
    });

    // For GET requests, append input as query parameters
    if (options.method.toLowerCase() === 'get' && input && typeof input === 'object') {
      const params = new URLSearchParams();
      Object.entries(input).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          params.append(key, String(value));
        }
      });
      const queryString = params.toString();
      if (queryString) {
        requestPath = `${path}?${queryString}`;
      }
    } else {
      // For non-GET requests, use body
      requestBody = options.inputSchema ? JSON.stringify(options.inputSchema.parse(input)) : undefined;
    }

    return fetch(requestPath, {
      method: options.method.toUpperCase(),
      headers: {
        'Content-Type': 'application/json',
        ...init.headers,
      },
      body: requestBody,
      ...init,
    }).then(response => {
      if (!response.ok) {
        throw new HttpError(response.status, `Request failed`);
      }
  
      if (outputProcessor) {
        return outputProcessor(response) as ReturnType;
      }
  
      return response as ReturnType;
    });
  }
}
