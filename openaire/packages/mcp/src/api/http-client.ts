import { OpenAIREError } from '../types/index.js';
import { logger } from '../utils/logger.js';

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  headers?: Record<string, string>;
  body?: string;
  timeout?: number;
  retries?: number;
  retryDelay?: number;
}

export class HttpClient {
  private baseURL: string;
  private defaultTimeout: number;
  private defaultRetries: number;

  constructor(baseURL: string, timeout: number = 30000, retries: number = 3) {
    this.baseURL = baseURL.replace(/\/$/, ''); // Remove trailing slash
    this.defaultTimeout = timeout;
    this.defaultRetries = retries;
  }

  async get<T>(path: string, options?: RequestOptions): Promise<T> {
    return this.request<T>(path, { ...options, method: 'GET' });
  }

  async post<T>(path: string, body: any, options?: RequestOptions): Promise<T> {
    return this.request<T>(path, {
      ...options,
      method: 'POST',
      body: JSON.stringify(body),
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    });
  }

  private async request<T>(path: string, options?: RequestOptions): Promise<T> {
    const url = path.startsWith('http') ? path : `${this.baseURL}${path}`;
    const retries = options?.retries ?? this.defaultRetries;
    const timeout = options?.timeout ?? this.defaultTimeout;

    logger.info('HTTP request URL', {
      method: options?.method || 'GET',
      path,
      baseURL: this.baseURL,
      fullURL: url,
    });

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        const response = await fetch(url, {
          method: options?.method || 'GET',
          headers: options?.headers,
          body: options?.body,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new OpenAIREError(
            `HTTP_${response.status}`,
            response.status,
            `HTTP ${response.status}: ${response.statusText}`
          );
        }

        const contentType = response.headers.get('content-type');
        let data: T;

        if (contentType?.includes('application/json')) {
          data = (await response.json()) as T;
        } else {
          data = (await response.text()) as unknown as T;
        }

        logger.debug('HTTP response received', {
          url,
          status: response.status,
          attempt: attempt + 1,
        });

        return data;
      } catch (error) {
        lastError = error as Error;

        if (error instanceof OpenAIREError) {
          // Don't retry client errors (4xx)
          if (error.status >= 400 && error.status < 500) {
            logger.error('HTTP client error (no retry)', {
              url,
              status: error.status,
              message: error.message,
            });
            throw error;
          }
        }

        // Check if it's an abort (timeout)
        if ((error as Error).name === 'AbortError') {
          logger.warn('HTTP request timeout', { url, attempt: attempt + 1 });
        } else {
          logger.warn('HTTP request failed', {
            url,
            attempt: attempt + 1,
            error: (error as Error).message,
          });
        }

        // Wait before retrying (exponential backoff)
        if (attempt < retries) {
          const delay = (options?.retryDelay || 1000) * Math.pow(2, attempt);
          logger.debug('Retrying request', { delay, attempt: attempt + 1 });
          await this.sleep(delay);
        }
      }
    }

    // All retries failed
    logger.error('HTTP request failed after all retries', {
      url,
      retries,
      error: lastError?.message,
    });

    throw new OpenAIREError(
      'NETWORK_ERROR',
      0,
      `Request failed after ${retries} retries: ${lastError?.message || 'Unknown error'}`
    );
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
