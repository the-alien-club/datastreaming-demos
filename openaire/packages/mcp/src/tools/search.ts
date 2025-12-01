import { OpenAIREClient } from '../api/openaire-client.js';
import { SearchInputSchema } from '../utils/validators.js';
import { logger } from '../utils/logger.js';
import { safeJsonStringify } from '../utils/sanitize.js';
import type { SearchInput } from '../utils/validators.js';

// Singleton client instance
let client: OpenAIREClient | null = null;

function getClient(): OpenAIREClient {
  if (!client) {
    client = new OpenAIREClient();
  }
  return client;
}

export const searchResearchProductsTool = {
  name: 'search_research_products',
  description:
    'Search OpenAIRE Graph API V2 for research products (publications, datasets, software). ' +
    'FULLY ALIGNED with official API - supports 50+ parameters including logical operators, citation metrics, ' +
    'SDG/FOS filters, funding relationships, and cursor-based pagination for large datasets (>10K records). ' +
    'Use this for discovering research by keywords, authors, organizations, projects, citation impact, or advanced filters.',
  inputSchema: {
    type: 'object',
    properties: {
      // Basic search
      query: {
        type: 'string',
        description: 'Keyword-based full-text search. Supports logical operators: uppercase AND, OR, NOT (e.g., "machine AND learning NOT supervised")',
      },
      logicalOperator: {
        type: 'string',
        enum: ['AND', 'OR', 'NOT'],
        description: 'Combines multiple field queries (default: AND)',
      },
      mainTitle: {
        type: 'string',
        description: 'Search within research product titles specifically (supports AND/OR/NOT)',
      },
      description: {
        type: 'string',
        description: 'Search within product descriptions/abstracts (supports AND/OR/NOT)',
      },

      // Identifiers (arrays)
      id: {
        type: 'array',
        items: { type: 'string' },
        description: 'OpenAIRE product IDs (OR logic between items)',
      },
      pid: {
        type: 'array',
        items: { type: 'string' },
        description: 'Persistent identifiers like DOI, PMID (OR logic)',
      },
      originalId: {
        type: 'array',
        items: { type: 'string' },
        description: 'Source system identifiers (OR logic)',
      },

      // Type and classification
      type: {
        type: 'array',
        items: { type: 'string', enum: ['publication', 'dataset', 'software', 'other'] },
        description: 'Research product types (OR logic between items)',
      },
      subjects: {
        type: 'array',
        items: { type: 'string' },
        description: 'Subject classifications or research areas (OR logic)',
      },

      // Author filters
      authorFullName: {
        type: 'array',
        items: { type: 'string' },
        description: 'Author names to filter by (OR logic between names)',
      },
      authorOrcid: {
        type: 'array',
        items: { type: 'string' },
        description: 'Author ORCID identifiers (OR logic)',
      },

      // Publisher and location
      publisher: {
        type: 'array',
        items: { type: 'string' },
        description: 'Publishing entities or repositories (OR logic)',
      },
      countryCode: {
        type: 'array',
        items: { type: 'string' },
        description: 'ISO country codes like US, GB, DE (OR logic)',
      },

      // Date range
      fromPublicationDate: {
        type: 'string',
        description: 'Start date in YYYY or YYYY-MM-DD format',
      },
      toPublicationDate: {
        type: 'string',
        description: 'End date in YYYY or YYYY-MM-DD format',
      },

      // Access rights
      bestOpenAccessRightLabel: {
        type: 'array',
        items: { type: 'string', enum: ['OPEN SOURCE', 'OPEN', 'EMBARGO', 'RESTRICTED', 'CLOSED', 'UNKNOWN'] },
        description: 'Access rights labels (OR logic)',
      },
      openAccessColor: {
        type: 'array',
        items: { type: 'string', enum: ['bronze', 'gold', 'hybrid'] },
        description: 'Open access colors for publications (OR logic)',
      },

      // Citation metrics (C1=top 0.01%, C2=top 0.1%, C3=top 1%, C4=top 10%, C5=average)
      influenceClass: {
        type: 'array',
        items: { type: 'string', enum: ['C1', 'C2', 'C3', 'C4', 'C5'] },
        description: 'Influence class - long-term impact (OR logic)',
      },
      popularityClass: {
        type: 'array',
        items: { type: 'string', enum: ['C1', 'C2', 'C3', 'C4', 'C5'] },
        description: 'Popularity class - current attention (OR logic)',
      },
      impulseClass: {
        type: 'array',
        items: { type: 'string', enum: ['C1', 'C2', 'C3', 'C4', 'C5'] },
        description: 'Impulse class - initial momentum after publication (OR logic)',
      },
      citationCountClass: {
        type: 'array',
        items: { type: 'string', enum: ['C1', 'C2', 'C3', 'C4', 'C5'] },
        description: 'Citation count class - total citations (OR logic)',
      },

      // Publication-specific
      instanceType: {
        type: 'array',
        items: { type: 'string' },
        description: 'Publication resource types like Article, Conference paper (OR logic)',
      },
      sdg: {
        type: 'array',
        items: { type: 'number', minimum: 1, maximum: 17 },
        description: 'UN Sustainable Development Goals 1-17 (OR logic)',
      },
      fos: {
        type: 'array',
        items: { type: 'string' },
        description: 'Field of Science classifications (OR logic)',
      },
      isPeerReviewed: {
        type: 'boolean',
        description: 'Peer review status (publications only)',
      },
      isInDiamondJournal: {
        type: 'boolean',
        description: 'Published in diamond/platinum OA journal (publications only)',
      },
      isPubliclyFunded: {
        type: 'boolean',
        description: 'Publicly funded research indicator',
      },
      isGreen: {
        type: 'boolean',
        description: 'Green open access model (self-archived)',
      },

      // Relationship filters
      relOrganizationId: {
        type: 'array',
        items: { type: 'string' },
        description: 'Connected organization OpenAIRE IDs (OR logic)',
      },
      relCommunityId: {
        type: 'array',
        items: { type: 'string' },
        description: 'Connected research community IDs (OR logic)',
      },
      relProjectId: {
        type: 'array',
        items: { type: 'string' },
        description: 'Connected project OpenAIRE IDs (OR logic)',
      },
      relProjectCode: {
        type: 'array',
        items: { type: 'string' },
        description: 'Connected project grant codes (OR logic)',
      },
      hasProjectRel: {
        type: 'boolean',
        description: 'Filter to only products with project connections',
      },
      relProjectFundingShortName: {
        type: 'array',
        items: { type: 'string' },
        description: 'Project funder names like EC, NSF, NIH (OR logic)',
      },
      relProjectFundingStreamId: {
        type: 'array',
        items: { type: 'string' },
        description: 'Funding stream IDs like H2020, FP7, Horizon Europe (OR logic)',
      },
      relHostingDataSourceId: {
        type: 'array',
        items: { type: 'string' },
        description: 'Hosting repository/data source IDs (OR logic)',
      },
      relCollectedFromDatasourceId: {
        type: 'array',
        items: { type: 'string' },
        description: 'Collecting data source IDs (OR logic)',
      },

      // Pagination
      page: {
        type: 'number',
        minimum: 1,
        default: 1,
        description: 'Page number (default: 1). Basic pagination limited to 10,000 records. Use cursor for larger datasets.',
      },
      pageSize: {
        type: 'number',
        minimum: 1,
        maximum: 100,
        default: 10,
        description: 'Results per page (min: 1, max: 100, default: 10)',
      },
      cursor: {
        type: 'string',
        description: 'Cursor-based pagination token. Start with "*" for first page, then use nextCursor from response. Required for retrieving >10K records.',
      },

      // Sorting
      sortBy: {
        type: 'string',
        description: 'Sort format: "field ASC|DESC" (e.g., "publicationDate DESC" or "influence ASC,publicationDate DESC"). Valid fields: relevance, publicationDate, dateOfCollection, influence, popularity, citationCount, impulse. Default: "relevance DESC"',
      },

      // Response detail level
      detail: {
        type: 'string',
        enum: ['minimal', 'standard', 'full'],
        default: 'standard',
        description: 'Response detail level: minimal (title/year/citations/metrics/doi ~120 bytes/paper - includes influence/popularity/impulse), standard (+ first 3 authors/openAccess ~200 bytes/paper), full (+ 500-char abstract, 10 authors, 5 subjects ~482 bytes/paper). Use minimal for large result sets.',
      },
    },
  },
};

export async function handleSearchResearchProducts(args: unknown): Promise<string> {
  try {
    // Validate input
    const input: SearchInput = SearchInputSchema.parse(args);

    logger.info('Executing search_research_products', {
      query: input.query,
      type: input.type,
      pageSize: input.pageSize,
      cursor: input.cursor ? 'present' : 'none',
    });

    // Execute search
    const client = getClient();
    const results = await client.searchResearchProducts(input);

    // Determine detail level
    const detailLevel = input.detail || 'standard';

    // Format response based on detail level
    const formatProduct = (product: any) => {
      // Minimal: Just core identifiers and metrics (including citation metrics!)
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

      // Standard: Add key metadata without heavy fields
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

      // Full: Everything including abstracts and full author list
      return {
        id: product.id,
        type: product.type,
        title: product.title,
        authors: product.authors.slice(0, 10).map((a: any) => ({
          name: a.name,
          orcid: a.orcid,
          affiliation: a.affiliation,
        })),
        publicationDate: product.publicationDate,
        citations: product.citations,
        openAccess: product.openAccessColor ? true : false,
        openAccessColor: product.openAccessColor,
        peerReviewed: product.peerReviewed,
        doi: product.doi,
        url: product.url,
        abstract: product.abstract?.substring(0, 500),
        subjects: product.subjects.slice(0, 5),
        journal: product.journal,
        publisher: product.publisher,
        metrics: product.metrics,
      };
    };

    // Format response
    const response = {
      success: true,
      data: {
        results: results.results.map(formatProduct),
        pagination: {
          total: results.total,
          page: results.page,
          pageSize: results.pageSize,
          totalPages: Math.ceil(results.total / results.pageSize),
          nextCursor: (results as any).nextCursor, // For cursor-based pagination
        },
      },
      summary: {
        query: input.query || input.mainTitle || input.description || 'advanced filter',
        resultsReturned: results.results.length,
        totalResults: results.total,
        appliedFilters: Object.keys(input).filter(k => input[k as keyof SearchInput] !== undefined).length,
        detailLevel: detailLevel,
      },
    };

    // Sanitize all text fields to ensure proper JSON serialization
    return safeJsonStringify(response);
  } catch (error) {
    logger.error('search_research_products failed', {
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
