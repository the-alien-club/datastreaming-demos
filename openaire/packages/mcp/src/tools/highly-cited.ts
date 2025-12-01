import { OpenAIREClient } from '../api/openaire-client.js';
import { logger } from '../utils/logger.js';
import { safeJsonStringify } from '../utils/sanitize.js';
import { z } from 'zod';

let client: OpenAIREClient | null = null;

function getClient(): OpenAIREClient {
  if (!client) {
    client = new OpenAIREClient();
  }
  return client;
}

// Shared schema for citation-based indicators
const CitationClassInputSchema = z.object({
  search: z.string().optional().describe('Search query to filter papers'),
  subjects: z.string().optional().describe('Subject classification'),
  type: z.enum(['publication', 'dataset', 'software', 'all']).default('publication').describe('Research product type'),
  citationClass: z.enum(['C1', 'C2', 'C3', 'C4', 'C5']).default('C1').describe('Citation class (C1=top 0.01%, C2=top 0.1%, C3=top 1%, C4=top 10%, C5=average)'),
  fromPublicationDate: z.string().optional().describe('Minimum publication date (YYYY or YYYY-MM-DD)'),
  toPublicationDate: z.string().optional().describe('Maximum publication date'),
  page: z.number().min(1).default(1).describe('Page number'),
  pageSize: z.number().min(1).max(100).default(50).describe('Results per page'),
  detail: z.enum(['minimal', 'standard', 'full']).default('standard').describe('Response detail level: minimal (title/year/citations/doi only), standard (+ authors/openAccess/metrics), full (+ 500-char abstract, full author list, subjects)'),
});

type CitationClassInput = z.infer<typeof CitationClassInputSchema>;

// Shared input schema definition
const citationClassInputSchema = {
  type: 'object',
  properties: {
    search: {
      type: 'string',
      description: 'Search query to filter papers by topic',
    },
    subjects: {
      type: 'string',
      description: 'Subject classification to filter by',
    },
    type: {
      type: 'string',
      enum: ['publication', 'dataset', 'software', 'all'],
      default: 'publication',
      description: 'Type of research product',
    },
    citationClass: {
      type: 'string',
      enum: ['C1', 'C2', 'C3', 'C4', 'C5'],
      default: 'C1',
      description: 'Citation class: C1 = top 0.01%, C2 = top 0.1%, C3 = top 1%, C4 = top 10%, C5 = average',
    },
    fromPublicationDate: {
      type: 'string',
      description: 'Minimum publication date (YYYY or YYYY-MM-DD)',
    },
    toPublicationDate: {
      type: 'string',
      description: 'Maximum publication date (YYYY or YYYY-MM-DD)',
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
      default: 50,
      description: 'Number of results per page (max 100)',
    },
    detail: {
      type: 'string',
      enum: ['minimal', 'standard', 'full'],
      default: 'standard',
      description: 'Response detail level: minimal (title/year/citations/metrics/doi ~120 bytes/paper - includes influence/popularity/impulse), standard (+ authors/openAccess ~200 bytes/paper), full (+ 500-char abstract, full author list, subjects ~482 bytes/paper). Use minimal for large result sets.',
    },
  },
};

// Tool 1: Find by Influence Class
export const findByInfluenceClassTool = {
  name: 'find_by_influence_class',
  description:
    'Find research papers by INFLUENCE CLASS - reflects the overall long-term impact of a research product. ' +
    'Citation classes: C1 (top 0.01%), C2 (top 0.1%), C3 (top 1%), C4 (top 10%), C5 (average). ' +
    'Use this to identify papers with sustained, influential impact over time.',
  inputSchema: citationClassInputSchema,
};

export async function handleFindByInfluenceClass(args: unknown): Promise<string> {
  return handleCitationClassSearch(args, 'influenceClass', 'influence');
}

// Tool 2: Find by Popularity Class
export const findByPopularityClassTool = {
  name: 'find_by_popularity_class',
  description:
    'Find research papers by POPULARITY CLASS - reflects current attention and recent impact. ' +
    'Citation classes: C1 (top 0.01%), C2 (top 0.1%), C3 (top 1%), C4 (top 10%), C5 (average). ' +
    'Use this to identify papers that are currently trending or receiving recent attention.',
  inputSchema: citationClassInputSchema,
};

export async function handleFindByPopularityClass(args: unknown): Promise<string> {
  return handleCitationClassSearch(args, 'popularityClass', 'popularity');
}

// Tool 3: Find by Impulse Class
export const findByImpulseClassTool = {
  name: 'find_by_impulse_class',
  description:
    'Find research papers by IMPULSE CLASS - reflects initial momentum directly after publication. ' +
    'Citation classes: C1 (top 0.01%), C2 (top 0.1%), C3 (top 1%), C4 (top 10%), C5 (average). ' +
    'Use this to identify papers with strong early-stage impact and rapid initial adoption.',
  inputSchema: citationClassInputSchema,
};

export async function handleFindByImpulseClass(args: unknown): Promise<string> {
  return handleCitationClassSearch(args, 'impulseClass', 'impulse');
}

// Tool 4: Find by Citation Count Class
export const findByCitationCountClassTool = {
  name: 'find_by_citation_count_class',
  description:
    'Find research papers by CITATION COUNT CLASS - reflects total citation count summing all citations. ' +
    'Citation classes: C1 (top 0.01%), C2 (top 0.1%), C3 (top 1%), C4 (top 10%), C5 (average). ' +
    'Use this to identify the most cited papers based on raw citation numbers.',
  inputSchema: citationClassInputSchema,
};

export async function handleFindByCitationCountClass(args: unknown): Promise<string> {
  return handleCitationClassSearch(args, 'citationCountClass', 'citation count');
}

// Shared handler function
async function handleCitationClassSearch(
  args: unknown,
  parameterName: 'influenceClass' | 'popularityClass' | 'impulseClass' | 'citationCountClass',
  indicatorType: string
): Promise<string> {
  try {
    const input: CitationClassInput = CitationClassInputSchema.parse(args);

    logger.info(`Executing ${parameterName}`, {
      search: input.search,
      citationClass: input.citationClass,
      type: input.type,
    });

    const client = getClient();

    // Build search request using Graph API V2 with proper citation class parameter
    const searchRequest: any = {
      query: input.search || '',
      page: input.page,
      limit: input.pageSize,
      useGraphV2: true, // Flag to indicate Graph API V2 usage
    };

    // Set the appropriate citation class parameter (as ARRAY for Graph API V2)
    searchRequest[parameterName] = [input.citationClass];

    if (input.type !== 'all') {
      searchRequest.type = [input.type]; // Graph API V2 expects array
    }

    if (input.subjects) {
      searchRequest.subjects = [input.subjects]; // Graph API V2 expects array
    }

    if (input.fromPublicationDate || input.toPublicationDate) {
      searchRequest.dateRange = {
        from: input.fromPublicationDate,
        to: input.toPublicationDate,
      };
    }

    const results = await client.searchResearchProducts(searchRequest);

    // Determine detail level
    const detailLevel = input.detail || 'standard';

    // Format product based on detail level
    const formatProduct = (product: any) => {
      if (detailLevel === 'minimal') {
        return {
          id: product.id,
          type: product.type,
          title: product.title,
          publicationDate: product.publicationDate,
          citations: product.citations,
          metrics: product.metrics, // CRITICAL: Include influence/popularity/impulse
          doi: product.doi,
        };
      }

      if (detailLevel === 'standard') {
        return {
          id: product.id,
          type: product.type,
          title: product.title,
          authors: product.authors.slice(0, 3).map((a: any) => ({ name: a.name })),
          publicationDate: product.publicationDate,
          citations: product.citations,
          openAccess: product.openAccessColor ? true : false,
          doi: product.doi,
          metrics: product.metrics,
        };
      }

      // Full
      return {
        id: product.id,
        type: product.type,
        title: product.title,
        authors: product.authors.slice(0, 10).map((a: any) => ({
          name: a.name,
          orcid: a.orcid,
        })),
        publicationDate: product.publicationDate,
        abstract: product.abstract?.substring(0, 500),
        doi: product.doi,
        url: product.url,
        publisher: product.publisher,
        journal: product.journal,
        citations: product.citations,
        openAccess: product.openAccessColor ? true : false,
        subjects: product.subjects.slice(0, 5),
        metrics: product.metrics,
      };
    };

    const response = {
      success: true,
      data: {
        papers: results.results.map(formatProduct),
        pagination: {
          total: results.total,
          page: results.page,
          pageSize: results.pageSize,
          totalPages: Math.ceil(results.total / results.pageSize),
        },
      },
      summary: {
        query: input.search,
        indicatorType,
        citationClass: input.citationClass,
        citationClassDescription:
          input.citationClass === 'C1' ? 'Top 0.01% most cited' :
          input.citationClass === 'C2' ? 'Top 0.1% most cited' :
          input.citationClass === 'C3' ? 'Top 1% most cited' :
          input.citationClass === 'C4' ? 'Top 10% most cited' :
          'Average citation level',
        papersReturned: results.results.length,
        totalPapers: results.total,
        detailLevel,
        filters: {
          type: input.type,
          subjects: input.subjects,
          dateRange: input.fromPublicationDate || input.toPublicationDate ? {
            from: input.fromPublicationDate,
            to: input.toPublicationDate,
          } : undefined,
        },
      },
    };

    return safeJsonStringify(response);
  } catch (error) {
    logger.error(`${parameterName} failed`, {
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
