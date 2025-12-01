import { OpenAIREClient } from '../api/openaire-client.js';
import { DatasetSearchInputSchema } from '../utils/validators.js';
import { logger } from '../utils/logger.js';
import { safeJsonStringify } from '../utils/sanitize.js';
import type { DatasetSearchInput } from '../utils/validators.js';

let client: OpenAIREClient | null = null;

function getClient(): OpenAIREClient {
  if (!client) {
    client = new OpenAIREClient();
  }
  return client;
}

export const searchDatasetsTool = {
  name: 'search_datasets',
  description:
    'Search specifically for research datasets in the OpenAIRE Graph. ' +
    'Find datasets by topic, subject, publisher, or related projects/organizations. ' +
    'Use this when the user wants to discover open data, find datasets for reuse, ' +
    'or explore data availability in a research area. ' +
    'Supports filtering by open access status, date range, and publisher.',
  inputSchema: {
    type: 'object',
    properties: {
      search: {
        type: 'string',
        description: 'General search query for dataset content',
      },
      title: {
        type: 'string',
        description: 'Dataset title',
      },
      description: {
        type: 'string',
        description: 'Search in dataset description/abstract',
      },
      subjects: {
        type: 'string',
        description: 'Subject classification or research area',
      },
      publisher: {
        type: 'string',
        description: 'Publishing entity or repository',
      },
      openAccessOnly: {
        type: 'boolean',
        description: 'Only return openly accessible datasets',
      },
      fromPublicationDate: {
        type: 'string',
        description: 'Minimum publication date (YYYY or YYYY-MM-DD)',
      },
      toPublicationDate: {
        type: 'string',
        description: 'Maximum publication date (YYYY or YYYY-MM-DD)',
      },
      relProjectId: {
        type: 'string',
        description: 'Related project OpenAIRE ID',
      },
      relOrganizationId: {
        type: 'string',
        description: 'Related organization OpenAIRE ID',
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
      sortBy: {
        type: 'string',
        enum: ['relevance', 'date', 'popularity'],
        default: 'relevance',
        description: 'Sort order',
      },
      sortDirection: {
        type: 'string',
        enum: ['ASC', 'DESC'],
        default: 'DESC',
        description: 'Sort direction',
      },
      detail: {
        type: 'string',
        enum: ['minimal', 'standard', 'full'],
        default: 'standard',
        description: 'Response detail level: minimal (title/year/doi only ~60 bytes/dataset), standard (+ first 3 authors/openAccess ~180 bytes/dataset), full (+ 500-char abstract, 10 authors, subjects ~420 bytes/dataset). Use minimal for large result sets.',
      },
    },
  },
};

export async function handleSearchDatasets(args: unknown): Promise<string> {
  try {
    const input: DatasetSearchInput = DatasetSearchInputSchema.parse(args);

    logger.info('Executing search_datasets', {
      search: input.search,
      subjects: input.subjects,
      pageSize: input.pageSize,
    });

    const client = getClient();

    // Build search request with type=dataset
    const searchRequest: any = {
      query: input.search || input.title || input.description || '',
      type: 'dataset',
      page: input.page,
      limit: input.pageSize,
    };

    if (input.subjects) {
      searchRequest.subjects = input.subjects;
    }

    if (input.publisher) {
      searchRequest.publisher = input.publisher;
    }

    if (input.openAccessOnly) {
      searchRequest.openAccess = true;
    }

    if (input.fromPublicationDate || input.toPublicationDate) {
      searchRequest.dateRange = {
        from: input.fromPublicationDate,
        to: input.toPublicationDate,
      };
    }

    // Map sortBy
    if (input.sortBy === 'date') {
      searchRequest.sortBy = 'date';
    } else if (input.sortBy === 'popularity') {
      searchRequest.sortBy = 'popularity';
    } else {
      searchRequest.sortBy = 'relevance';
    }

    const results = await client.searchResearchProducts(searchRequest);

    // Determine detail level
    const detailLevel = input.detail || 'standard';

    // Format dataset based on detail level
    const formatDataset = (dataset: any) => {
      if (detailLevel === 'minimal') {
        return {
          id: dataset.id,
          title: dataset.title,
          publicationDate: dataset.publicationDate,
          doi: dataset.doi,
        };
      }

      if (detailLevel === 'standard') {
        return {
          id: dataset.id,
          title: dataset.title,
          authors: dataset.authors.slice(0, 3).map((a: any) => ({ name: a.name })),
          publicationDate: dataset.publicationDate,
          openAccess: dataset.openAccessColor ? true : false,
          doi: dataset.doi,
          url: dataset.url,
        };
      }

      // Full
      return {
        id: dataset.id,
        title: dataset.title,
        authors: dataset.authors.slice(0, 10),
        publicationDate: dataset.publicationDate,
        abstract: dataset.abstract?.substring(0, 500),
        doi: dataset.doi,
        url: dataset.url,
        publisher: dataset.publisher,
        openAccess: dataset.openAccessColor ? true : false,
        openAccessColor: dataset.openAccessColor,
        subjects: dataset.subjects.slice(0, 5),
      };
    };

    const response = {
      success: true,
      data: {
        datasets: results.results.map(formatDataset),
        pagination: {
          total: results.total,
          page: results.page,
          pageSize: results.pageSize,
          totalPages: Math.ceil(results.total / results.pageSize),
        },
      },
      summary: {
        query: input.search || input.title,
        datasetsReturned: results.results.length,
        totalDatasets: results.total,
        detailLevel,
        filters: {
          subjects: input.subjects,
          openAccessOnly: input.openAccessOnly,
          dateRange: input.fromPublicationDate || input.toPublicationDate ? {
            from: input.fromPublicationDate,
            to: input.toPublicationDate,
          } : undefined,
        },
      },
    };

    return safeJsonStringify(response);
  } catch (error) {
    logger.error('search_datasets failed', {
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
