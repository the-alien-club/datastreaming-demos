import { OpenAIREClient } from '../api/openaire-client.js';
import { OrganizationSearchInputSchema } from '../utils/validators.js';
import { logger } from '../utils/logger.js';
import { safeJsonStringify } from '../utils/sanitize.js';
import type { OrganizationSearchInput } from '../utils/validators.js';

let client: OpenAIREClient | null = null;

function getClient(): OpenAIREClient {
  if (!client) {
    client = new OpenAIREClient();
  }
  return client;
}

export const searchOrganizationsTool = {
  name: 'search_organizations',
  description:
    'Search for research organizations and institutions in the OpenAIRE Graph. ' +
    'Find universities, research centers, companies, and institutions by name, country, or persistent identifiers (ROR, GRID, ISNI). ' +
    'Use this when the user wants to find institutions, discover organizations working in a research area, ' +
    'or identify institutions in specific countries or regions. ' +
    'You can filter by legal name, country code, and persistent IDs.',
  inputSchema: {
    type: 'object',
    properties: {
      search: {
        type: 'string',
        description: 'General search query across organization name and fields',
      },
      legalName: {
        type: 'string',
        description: 'Full legal name of the organization',
      },
      legalShortName: {
        type: 'string',
        description: 'Short name or abbreviation',
      },
      pid: {
        type: 'string',
        description: 'Persistent identifier (ROR, GRID, ISNI) - e.g., "https://ror.org/0576by029"',
      },
      countryCode: {
        type: 'string',
        description: 'ISO country code (e.g., "US", "GB", "DE")',
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
      cursor: {
        type: 'string',
        description: 'Cursor for cursor-based pagination (for large result sets)',
      },
    },
  },
};

export async function handleSearchOrganizations(args: unknown): Promise<string> {
  try {
    const input: OrganizationSearchInput = OrganizationSearchInputSchema.parse(args);

    logger.info('Executing search_organizations', {
      search: input.search,
      countryCode: input.countryCode,
      pageSize: input.pageSize,
    });

    const client = getClient();
    const results = await client.searchOrganizations(input);

    const response = {
      success: true,
      data: {
        organizations: results.results.map((org) => ({
          id: org.id,
          legalName: org.legalName,
          legalShortName: org.legalShortName,
          alternativeNames: org.alternativeNames,
          websiteUrl: org.websiteUrl,
          country: org.country,
          pids: org.pids,
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
        query: input.search || input.legalName || input.pid,
        organizationsReturned: results.results.length,
        totalOrganizations: results.total,
        filters: {
          countryCode: input.countryCode,
          legalName: input.legalName,
        },
      },
    };

    return safeJsonStringify(response);
  } catch (error) {
    logger.error('search_organizations failed', {
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
