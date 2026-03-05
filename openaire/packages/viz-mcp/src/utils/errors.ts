/**
 * Visualization MCP Error Handling
 *
 * Standardized error handling and response formatting for visualization tools.
 */

import { logger } from './logger.js';

/**
 * Standardized error response structure.
 */
export interface ErrorResponse {
  success: false;
  error: string;
  errorType?: string;
}

/**
 * Convert an error to a standardized error response object.
 *
 * @param error - The error that occurred
 * @param context - Optional context about what operation was being performed
 * @returns Object with success=false and actionable error message
 */
export function handleToolError(error: unknown, context?: string): ErrorResponse {
  const prefix = context ? `${context}: ` : '';

  if (error instanceof TypeError) {
    const msg = `${prefix}Invalid input type: ${error.message}`;
    logger.warn(msg);
    return { success: false, error: msg, errorType: 'TypeError' };
  }

  if (error instanceof RangeError) {
    const msg = `${prefix}Value out of range: ${error.message}`;
    logger.warn(msg);
    return { success: false, error: msg, errorType: 'RangeError' };
  }

  if (error instanceof SyntaxError) {
    const msg = `${prefix}Invalid data format: ${error.message}`;
    logger.error(msg);
    return { success: false, error: msg, errorType: 'SyntaxError' };
  }

  if (error instanceof Error) {
    const msg = `${prefix}${error.message}`;
    logger.error(msg, { stack: error.stack });
    return { success: false, error: msg, errorType: error.constructor.name };
  }

  const msg = `${prefix}Unexpected error occurred`;
  logger.error(msg, { error });
  return { success: false, error: msg, errorType: 'Unknown' };
}

/**
 * Convert an error to a JSON error response string.
 *
 * @param error - The error that occurred
 * @param context - Optional context about what operation was being performed
 * @returns JSON string with error details
 */
export function formatErrorResponse(error: unknown, context?: string): string {
  return JSON.stringify(handleToolError(error, context), null, 2);
}

/**
 * Validate that required fields are present in the input arguments.
 *
 * @param args - The input arguments object
 * @param requiredFields - Array of field names that must be present
 * @param toolName - Name of the tool for error context
 * @throws Error if any required field is missing
 */
export function validateRequiredFields(
  args: Record<string, unknown>,
  requiredFields: string[],
  toolName: string
): void {
  const missing = requiredFields.filter(
    (field) => args[field] === undefined || args[field] === null
  );
  if (missing.length > 0) {
    throw new Error(
      `Missing required parameter${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}`
    );
  }
}
