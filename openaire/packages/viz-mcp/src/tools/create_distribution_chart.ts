/**
 * Create Distribution Chart Tool
 *
 * Creates a pie or bar chart for categorical distributions.
 * Returns a chart object consumed by the frontend visualization components.
 */

import type { ChartData } from '../types.js';
import { logger, validateRequiredFields, formatErrorResponse } from '../utils/index.js';

// =============================================================================
// Tool Metadata
// =============================================================================

export const NAME = 'create_distribution_chart';

export const DESCRIPTION =
  'Create a pie or bar chart for categorical data distributions. ' +
  'Input: array of category data (segment, value) with chart type selection. ' +
  'Returns: a chart object with chartType "pie" or "bar" for frontend rendering. ' +
  'Use AFTER collecting research products and calculating category breakdowns. ' +
  'Examples: publication type distribution, open access vs closed, research by country.';

export const INPUT_SCHEMA = {
  type: 'object' as const,
  properties: {
    data: {
      type: 'array',
      description: 'Array of category data points with segment names and values',
      items: {
        type: 'object',
        properties: {
          segment: {
            type: 'string',
            description: 'Category name (e.g., "Publications", "Datasets", "Open Access")',
          },
          value: {
            type: 'number',
            description: 'Count or numeric value for this category',
          },
        },
        required: ['segment', 'value'],
      },
    },
    chartType: {
      type: 'string',
      enum: ['pie', 'bar'],
      description:
        'Type of chart: "pie" for proportional distribution, "bar" for comparison across categories',
    },
    title: {
      type: 'string',
      description: 'Chart title (e.g., "Research Output by Type")',
    },
    description: {
      type: 'string',
      description: 'Chart description providing context for the distribution',
    },
    xAxisKey: {
      type: 'string',
      description:
        'For bar charts only: property name for X axis labels (defaults to "segment")',
    },
  },
  required: ['data', 'chartType', 'title', 'description'],
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
 * Create a pie or bar chart visualization for categorical data.
 *
 * Transforms categorical distribution data into a structured chart object.
 * Supports both pie charts (for proportional breakdowns) and bar charts
 * (for comparing values across categories). Automatically generates
 * color assignments for each data segment.
 *
 * @param args - Tool input arguments containing data array, chart type, and display options
 * @returns JSON string containing the visualization chart object
 *
 * @example
 *   // Pie chart: publication type distribution
 *   execute({
 *     data: [{ segment: "Journal Articles", value: 150 }, { segment: "Conference Papers", value: 80 }],
 *     chartType: "pie",
 *     title: "Publication Types",
 *     description: "Distribution of research output by type"
 *   })
 *
 *   // Bar chart: research by country
 *   execute({
 *     data: [{ segment: "US", value: 500 }, { segment: "UK", value: 300 }],
 *     chartType: "bar",
 *     title: "Research by Country",
 *     description: "Number of publications per country"
 *   })
 */
export async function execute(args: Record<string, any>): Promise<string> {
  try {
    validateRequiredFields(args, ['data', 'chartType', 'title', 'description'], NAME);

    const { data, chartType, title, description, xAxisKey } = args;

    logger.info(`${NAME} called`, {
      chartType,
      categories: data?.length,
    });

    let chart: ChartData;

    if (chartType === 'pie') {
      chart = createPieChart(data, title, description);
    } else {
      chart = createBarChart(data, title, description, xAxisKey || 'segment');
    }

    return JSON.stringify({ visualization: chart });
  } catch (error) {
    logger.error(`${NAME} failed`, { error });
    return formatErrorResponse(error, NAME);
  }
}

// =============================================================================
// Internal Helpers
// =============================================================================

function createPieChart(
  data: Array<{ segment: string; value: number }>,
  title: string,
  description: string
): ChartData {
  const chartConfig: Record<string, { label: string; color: string }> = {};
  data.forEach((item, index) => {
    const segmentKey = item.segment.toLowerCase().replace(/\s+/g, '');
    chartConfig[segmentKey] = {
      label: item.segment,
      color: `hsl(var(--chart-${(index % 5) + 1}))`,
    };
  });

  return {
    chartType: 'pie',
    config: { title, description },
    data,
    chartConfig,
  };
}

function createBarChart(
  data: Array<Record<string, any>>,
  title: string,
  description: string,
  xAxisKey: string
): ChartData {
  return {
    chartType: 'bar',
    config: { title, description, xAxisKey },
    data,
    chartConfig: {
      value: {
        label: 'value',
        color: 'hsl(var(--chart-1))',
      },
    },
  };
}
