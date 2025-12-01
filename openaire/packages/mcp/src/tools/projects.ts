import { OpenAIREClient } from '../api/openaire-client.js';
import { ProjectSearchInputSchema, ProjectOutputsInputSchema } from '../utils/validators.js';
import { logger } from '../utils/logger.js';
import { safeJsonStringify } from '../utils/sanitize.js';
import type { ProjectSearchInput, ProjectOutputsInput } from '../utils/validators.js';

let client: OpenAIREClient | null = null;

function getClient(): OpenAIREClient {
  if (!client) {
    client = new OpenAIREClient();
  }
  return client;
}

export const searchProjectsTool = {
  name: 'search_projects',
  description:
    'Search for funded research projects in the OpenAIRE Graph. ' +
    'Find projects by keywords, funder (e.g., EU Horizon 2020, NSF, NIH), grant code, organization, or date range. ' +
    'Use this when the user wants to discover research grants, explore funding landscapes, ' +
    'find projects by institution or country, or track funding for specific research topics. ' +
    'Supports filtering by funding streams like H2020, FP7, Horizon Europe, and other international funders.',
  inputSchema: {
    type: 'object',
    properties: {
      search: {
        type: 'string',
        description: 'General search query across project fields',
      },
      title: {
        type: 'string',
        description: 'Project title',
      },
      keywords: {
        type: 'string',
        description: 'Project keywords',
      },
      code: {
        type: 'string',
        description: 'Grant agreement code',
      },
      acronym: {
        type: 'string',
        description: 'Project acronym',
      },
      fundingShortName: {
        type: 'string',
        description: 'Funder short name (e.g., "EC", "NSF", "NIH", "Wellcome Trust")',
      },
      fundingStreamId: {
        type: 'string',
        description: 'Funding stream identifier (e.g., "H2020", "FP7", "Horizon Europe")',
      },
      fromStartDate: {
        type: 'string',
        description: 'Minimum start date (YYYY or YYYY-MM-DD)',
      },
      toStartDate: {
        type: 'string',
        description: 'Maximum start date (YYYY or YYYY-MM-DD)',
      },
      fromEndDate: {
        type: 'string',
        description: 'Minimum end date (YYYY or YYYY-MM-DD)',
      },
      toEndDate: {
        type: 'string',
        description: 'Maximum end date (YYYY or YYYY-MM-DD)',
      },
      relOrganizationName: {
        type: 'string',
        description: 'Related organization name',
      },
      relOrganizationId: {
        type: 'string',
        description: 'Related organization OpenAIRE ID',
      },
      relOrganizationCountryCode: {
        type: 'string',
        description: 'Organization country code (e.g., "US", "GB", "DE")',
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
        enum: ['relevance', 'startDate', 'endDate'],
        default: 'relevance',
        description: 'Sort field',
      },
      sortDirection: {
        type: 'string',
        enum: ['ASC', 'DESC'],
        default: 'DESC',
        description: 'Sort direction',
      },
    },
  },
};

export async function handleSearchProjects(args: unknown): Promise<string> {
  try {
    const input: ProjectSearchInput = ProjectSearchInputSchema.parse(args);

    logger.info('Executing search_projects', {
      search: input.search,
      fundingShortName: input.fundingShortName,
      pageSize: input.pageSize,
    });

    const client = getClient();
    const results = await client.searchProjects(input);

    const response = {
      success: true,
      data: {
        projects: results.results.map((project) => ({
          id: project.id,
          code: project.code,
          acronym: project.acronym,
          title: project.title,
          keywords: project.keywords,
          startDate: project.startDate,
          endDate: project.endDate,
          funding: project.funding,
          organizations: project.organizations,
          summary: project.summary,
        })),
        pagination: {
          total: results.total,
          page: results.page,
          pageSize: results.pageSize,
          totalPages: Math.ceil(results.total / results.pageSize),
          nextCursor: results.nextCursor,
        },
      },
      summary: {
        query: input.search || input.title || input.keywords,
        projectsReturned: results.results.length,
        totalProjects: results.total,
        filters: {
          fundingShortName: input.fundingShortName,
          fundingStreamId: input.fundingStreamId,
          countryCode: input.relOrganizationCountryCode,
        },
      },
    };

    return safeJsonStringify(response);
  } catch (error) {
    logger.error('search_projects failed', {
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

export const getProjectOutputsTool = {
  name: 'get_project_outputs',
  description:
    'Get all research outputs (publications, datasets, software) produced by a specific funded project. ' +
    'Use this when the user wants to see what a project produced, track project ROI and impact, ' +
    'or analyze the research outputs from a grant. Requires either a project OpenAIRE ID or project grant code.',
  inputSchema: {
    type: 'object',
    properties: {
      projectId: {
        type: 'string',
        description: 'Project OpenAIRE ID',
      },
      projectCode: {
        type: 'string',
        description: 'Project grant agreement code',
      },
      type: {
        type: 'string',
        enum: ['publication', 'dataset', 'software', 'all'],
        default: 'all',
        description: 'Type of outputs to retrieve',
      },
      pageSize: {
        type: 'number',
        minimum: 1,
        maximum: 100,
        default: 100,
        description: 'Number of results per page (max 100)',
      },
      sortBy: {
        type: 'string',
        enum: ['date', 'popularity', 'relevance'],
        default: 'date',
        description: 'Sort order',
      },
    },
  },
};

export async function handleGetProjectOutputs(args: unknown): Promise<string> {
  try {
    const input: ProjectOutputsInput = ProjectOutputsInputSchema.parse(args);

    if (!input.projectId && !input.projectCode) {
      throw new Error('Either projectId or projectCode is required');
    }

    logger.info('Executing get_project_outputs', {
      projectId: input.projectId,
      projectCode: input.projectCode,
      type: input.type,
    });

    const client = getClient();

    // Build search request for research products
    const searchRequest: any = {
      page: 1,
      limit: input.pageSize,
    };

    if (input.projectId) {
      searchRequest.relProjectId = input.projectId;
    } else if (input.projectCode) {
      searchRequest.relProjectCode = input.projectCode;
    }

    if (input.type !== 'all') {
      searchRequest.type = input.type;
    }

    // Map sortBy to API field
    if (input.sortBy === 'date') {
      searchRequest.sortBy = 'date';
    } else if (input.sortBy === 'popularity') {
      searchRequest.sortBy = 'popularity';
    }

    const results = await client.searchResearchProducts(searchRequest);

    const response = {
      success: true,
      data: {
        projectId: input.projectId || input.projectCode,
        outputs: results.results.map((product) => ({
          id: product.id,
          type: product.type,
          title: product.title,
          authors: product.authors.slice(0, 5),
          publicationDate: product.publicationDate,
          doi: product.doi,
          url: product.url,
          citations: product.citations,
          openAccess: product.openAccessColor ? true : false,
        })),
        summary: {
          totalOutputs: results.total,
          outputsReturned: results.results.length,
          breakdown: {
            publications: results.results.filter(p => p.type === 'publication').length,
            datasets: results.results.filter(p => p.type === 'dataset').length,
            software: results.results.filter(p => p.type === 'software').length,
          },
        },
      },
    };

    return safeJsonStringify(response);
  } catch (error) {
    logger.error('get_project_outputs failed', {
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
