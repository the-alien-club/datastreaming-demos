/**
 * Visualization MCP Error Handling
 *
 * Standardized error handling and response formatting for visualization tools.
 */
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
export declare function handleToolError(error: unknown, context?: string): ErrorResponse;
/**
 * Convert an error to a JSON error response string.
 *
 * @param error - The error that occurred
 * @param context - Optional context about what operation was being performed
 * @returns JSON string with error details
 */
export declare function formatErrorResponse(error: unknown, context?: string): string;
/**
 * Validate that required fields are present in the input arguments.
 *
 * @param args - The input arguments object
 * @param requiredFields - Array of field names that must be present
 * @param toolName - Name of the tool for error context
 * @throws Error if any required field is missing
 */
export declare function validateRequiredFields(args: Record<string, unknown>, requiredFields: string[], toolName: string): void;
//# sourceMappingURL=errors.d.ts.map