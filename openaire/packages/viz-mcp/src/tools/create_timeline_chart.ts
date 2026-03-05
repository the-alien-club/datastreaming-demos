/**
 * Create Timeline Chart Tool
 *
 * Creates a line chart showing trends over time (e.g., publications by year).
 * Returns a chart object consumed by the frontend visualization components.
 */

import type { ChartData } from '../types.js';
import { logger, validateRequiredFields, formatErrorResponse } from '../utils/index.js';

// =============================================================================
// Tool Metadata
// =============================================================================

export const NAME = 'create_timeline_chart';

export const DESCRIPTION =
  'Create a line chart showing trends over time (e.g., publications per year, citation growth). ' +
  'Input: array of time series data points with configurable axis keys. ' +
  'Returns: a chart object with chartType "line" for frontend rendering. ' +
  'Use AFTER collecting and aggregating time-based data from research APIs. ' +
  'Example: show research output growth from 2015-2025.';

export const INPUT_SCHEMA = {
  type: 'object' as const,
  properties: {
    data: {
      type: 'array',
      description:
        'Array of time series data points. Each object should contain properties matching ' +
        'the xAxisKey (e.g., year) and yAxisKey (e.g., count)',
      items: {
        type: 'object',
        description:
          'Data point with properties for the X and Y axes (e.g., { year: 2023, count: 42 })',
      },
    },
    title: {
      type: 'string',
      description: 'Chart title (e.g., "Publications Over Time", "Citation Growth 2015-2025")',
    },
    description: {
      type: 'string',
      description: 'Chart description providing context for the data shown',
    },
    xAxisKey: {
      type: 'string',
      description: 'Property name for the X axis values (e.g., "year", "month", "date")',
    },
    yAxisKey: {
      type: 'string',
      description: 'Property name for the Y axis values (e.g., "count", "publications", "citations")',
    },
  },
  required: ['data', 'title', 'description', 'xAxisKey', 'yAxisKey'],
};

export const ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

// =============================================================================
// Execute
// =============================================================================

/**
 * Create a line chart visualization for time series data.
 *
 * Transforms time series data points into a structured chart object that
 * the frontend can render as an interactive line chart. Supports configurable
 * axis keys for flexible data mapping.
 *
 * @param args - Tool input arguments containing data array and axis configuration
 * @returns JSON string containing the visualization chart object
 *
 * @example
 *   // Publications per year
 *   execute({
 *     data: [{ year: 2020, count: 15 }, { year: 2021, count: 23 }],
 *     title: "Publications Over Time",
 *     description: "Annual research output",
 *     xAxisKey: "year",
 *     yAxisKey: "count"
 *   })
 */
export async function execute(args: Record<string, any>): Promise<string> {
  try {
    validateRequiredFields(args, ['data', 'title', 'description', 'xAxisKey', 'yAxisKey'], NAME);

    const { data, title, description, xAxisKey, yAxisKey } = args;

    logger.info(`${NAME} called`, {
      dataPoints: data?.length,
      title,
    });

    const chart: ChartData = {
      chartType: 'line',
      config: {
        title,
        description,
        xAxisKey,
      },
      data,
      chartConfig: {
        [yAxisKey]: {
          label: yAxisKey,
          color: 'hsl(var(--chart-1))',
        },
      },
    };

    return JSON.stringify({ visualization: chart });
  } catch (error) {
    logger.error(`${NAME} failed`, { error });
    return formatErrorResponse(error, NAME);
  }
}
