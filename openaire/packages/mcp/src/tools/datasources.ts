import { OpenAIREClient } from '../api/openaire-client.js';
import { DataSourceSearchInputSchema } from '../utils/validators.js';
import { logger } from '../utils/logger.js';
import { safeJsonStringify } from '../utils/sanitize.js';
import type { DataSourceSearchInput } from '../utils/validators.js';

let client: OpenAIREClient | null = null;

function getClient(): OpenAIREClient {
  if (!client) {
    client = new OpenAIREClient();
  }
  return client;
}

export const searchDataSourcesTool = {
  name: 'search_data_sources',
  description:
    'Search for data sources, repositories, journals, and archives in the OpenAIRE Graph. ' +
    'Find institutional repositories, data repositories, journals, CRIS systems, and aggregators. ' +
    'Use this when the user wants to discover where to publish or deposit research outputs, ' +
    'find domain-specific repositories, or identify data sources by type, subject, or organization. ' +
    'Includes repositories from OpenDOAR, re3data, and other registries.',
  inputSchema: {
    type: 'object',
    properties: {
      search: {
        type: 'string',
        description: 'General search query for repository name and fields',
      },
      officialName: {
        type: 'string',
        description: 'Official repository name',
      },
      type: {
        type: 'string',
        description: 'Repository type (e.g., "Institutional Repository", "Data Repository", "Journal")',
      },
      subjects: {
        type: 'string',
        description: 'Subject areas covered by the repository',
      },
      contentTypes: {
        type: 'string',
        description: 'Content types (e.g., "Articles", "Datasets", "Software")',
      },
      relOrganizationId: {
        type: 'string',
        description: 'Operating organization OpenAIRE ID',
      },
      page: {
        type: 'number',
        minimum: 1,
        default: 1,
        description: 'Page number for pagination',
      },
      pageSize: {
        type: 'number',
        minimum: 1,
        maximum: 100,
        default: 10,
        description: 'Number of results per page (max 100)',
      },
    },
  },
};

export async function handleSearchDataSources(args: unknown): Promise<string> {
  try {
    const input: DataSourceSearchInput = DataSourceSearchInputSchema.parse(args);

    logger.info('Executing search_data_sources', {
      search: input.search,
      type: input.type,
      pageSize: input.pageSize,
    });

    const client = getClient();
    const results = await client.searchDataSources(input);

    const response = {
      success: true,
      data: {
        dataSources: results.results.map((ds) => ({
          id: ds.id,
          officialName: ds.officialName,
          englishName: ds.englishName,
          legalShortName: ds.legalShortName,
          websiteUrl: ds.websiteUrl,
          type: ds.type,
          subjects: ds.subjects,
          contentTypes: ds.contentTypes,
          country: ds.country,
          organization: ds.organization,
        })),
        pagination: {
          total: results.total,
          page: results.page,
          pageSize: results.pageSize,
          totalPages: Math.ceil(results.total / results.pageSize),
        },
      },
      summary: {
        query: input.search || input.officialName,
        dataSourcesReturned: results.results.length,
        totalDataSources: results.total,
        filters: {
          type: input.type,
          subjects: input.subjects,
        },
      },
    };

    return safeJsonStringify(response);
  } catch (error) {
    logger.error('search_data_sources failed', {
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
