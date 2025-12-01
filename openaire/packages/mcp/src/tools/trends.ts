import { OpenAIREClient } from '../api/openaire-client.js';
import { ResearchTrendsInputSchema } from '../utils/validators.js';
import { logger } from '../utils/logger.js';
import { safeJsonStringify } from '../utils/sanitize.js';
import type { ResearchTrendsInput } from '../utils/validators.js';
import type { ResearchTrend, ResearchTrendsResponse } from '../types/index.js';

let client: OpenAIREClient | null = null;

function getClient(): OpenAIREClient {
  if (!client) {
    client = new OpenAIREClient();
  }
  return client;
}

export const analyzeResearchTrendsTool = {
  name: 'analyze_research_trends',
  description:
    'Analyze research trends over time by tracking publication counts across years. ' +
    'Discover how research topics have evolved, identify emerging fields, or track research growth. ' +
    'Use this when the user wants to see temporal trends, compare research output over time, ' +
    'or identify when a research area started gaining traction. ' +
    'Returns year-by-year publication counts with summary statistics including peak years and growth patterns.',
  inputSchema: {
    type: 'object',
    properties: {
      search: {
        type: 'string',
        description: 'Research topic or query to track over time',
      },
      subjects: {
        type: 'string',
        description: 'Subject classification to filter by',
      },
      fromYear: {
        type: 'number',
        minimum: 1900,
        maximum: 2100,
        description: 'Start year for analysis',
      },
      toYear: {
        type: 'number',
        minimum: 1900,
        maximum: 2100,
        description: 'End year for analysis',
      },
      type: {
        type: 'string',
        enum: ['publication', 'dataset', 'software', 'all'],
        default: 'all',
        description: 'Type of research products to track',
      },
    },
    required: ['search', 'fromYear', 'toYear'],
  },
};

export async function handleAnalyzeResearchTrends(args: unknown): Promise<string> {
  try {
    const input: ResearchTrendsInput = ResearchTrendsInputSchema.parse(args);

    if (input.toYear < input.fromYear) {
      throw new Error('toYear must be greater than or equal to fromYear');
    }

    const yearCount = input.toYear - input.fromYear + 1;
    if (yearCount > 50) {
      throw new Error('Date range cannot exceed 50 years');
    }

    logger.info('Executing analyze_research_trends', {
      search: input.search,
      fromYear: input.fromYear,
      toYear: input.toYear,
      yearCount,
    });

    const client = getClient();
    const trends: ResearchTrend[] = [];

    // Query each year separately
    for (let year = input.fromYear; year <= input.toYear; year++) {
      try {
        const searchRequest: any = {
          query: input.search,
          dateRange: {
            from: `${year}-01-01`,
            to: `${year}-12-31`,
          },
          page: 1,
          limit: 1, // We only need the count
        };

        if (input.subjects) {
          searchRequest.subjects = input.subjects;
        }

        if (input.type !== 'all') {
          searchRequest.type = input.type;
        }

        const results = await client.searchResearchProducts(searchRequest);

        trends.push({
          year,
          count: results.total,
        });

        logger.debug(`Year ${year}: ${results.total} results`);
      } catch (error) {
        logger.warn(`Failed to fetch data for year ${year}`, {
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        trends.push({
          year,
          count: 0,
        });
      }
    }

    // Calculate summary statistics
    const totalPapers = trends.reduce((sum, t) => sum + t.count, 0);
    const averagePerYear = totalPapers / trends.length;
    const peakYear = trends.reduce((max, t) => t.count > max.count ? t : max, trends[0]);

    const response: ResearchTrendsResponse = {
      query: input.search,
      timeRange: {
        from: input.fromYear,
        to: input.toYear,
      },
      trends,
      summary: {
        totalPapers,
        averagePerYear: Math.round(averagePerYear * 100) / 100,
        peakYear: peakYear.year,
        peakCount: peakYear.count,
      },
    };

    return safeJsonStringify({
        success: true,
        data: response,
      });
  } catch (error) {
    logger.error('analyze_research_trends failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });

    return safeJsonStringify({
        success: false,
        error: {
          message: error instanceof Error ? error.message : 'Unknown error occurred',
          type: error instanceof Error ? error.constructor.name : 'Error',
        },
      });
  }
}
