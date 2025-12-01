/**
 * Sanitize text for JSON serialization
 * Removes control characters and ensures proper escaping
 */
export function sanitizeText(text: string | undefined | null): string | undefined {
  if (!text) return undefined;

  // Convert to string if needed
  const str = String(text);

  // Remove or replace problematic characters
  return str
    // Remove null bytes
    .replace(/\0/g, '')
    // Remove other control characters except newlines, tabs, and carriage returns
    .replace(/[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    // Normalize line breaks
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    // Replace multiple spaces with single space
    .replace(/  +/g, ' ')
    // Trim whitespace
    .trim();
}

/**
 * Sanitize an object's string properties recursively
 */
export function sanitizeObject<T>(obj: T): T {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj === 'string') {
    return sanitizeText(obj) as T;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item)) as T;
  }

  if (typeof obj === 'object') {
    const sanitized: any = {};
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'string') {
        sanitized[key] = sanitizeText(value);
      } else if (value && typeof value === 'object') {
        sanitized[key] = sanitizeObject(value);
      } else {
        sanitized[key] = value;
      }
    }
    return sanitized as T;
  }

  return obj;
}

/**
 * Safely stringify an object with automatic sanitization
 * Use this instead of JSON.stringify for tool responses
 */
export function safeJsonStringify(obj: any, pretty: boolean = true): string {
  const sanitized = sanitizeObject(obj);
  return JSON.stringify(sanitized, null, pretty ? 2 : 0);
}
