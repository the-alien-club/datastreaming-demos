/**
 * Get the basePath for the application
 * This matches the basePath configured in next.config.mjs
 */
export const getBasePath = (): string => {
  // In production, use the basePath. In development, use empty string.
  return process.env.NODE_ENV === 'production' ? '/openaire' : '';
};

/**
 * Prefix a path with the basePath
 */
export const withBasePath = (path: string): string => {
  const basePath = getBasePath();
  // Remove leading slash from path if present to avoid double slashes
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${basePath}${cleanPath}`;
};
