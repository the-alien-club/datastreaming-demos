import { OpenAIREClient } from '../api/openaire-client.js';
import { ProductDetailsInputSchema } from '../utils/validators.js';
import { logger } from '../utils/logger.js';
import { safeJsonStringify } from '../utils/sanitize.js';
import type { ProductDetailsInput } from '../utils/validators.js';

let client: OpenAIREClient | null = null;

function getClient(): OpenAIREClient {
  if (!client) {
    client = new OpenAIREClient();
  }
  return client;
}

export const getResearchProductDetailsTool = {
  name: 'get_research_product_details',
  description:
    'Get detailed information about a specific research product (publication, dataset, or software) ' +
    'using its identifier (DOI or OpenAIRE ID). Returns complete metadata including full abstract, ' +
    'all authors, funding information, metrics, and related entities (projects, organizations). ' +
    'Use this when the user wants detailed information about a specific paper or research output.',
  inputSchema: {
    type: 'object',
    properties: {
      identifier: {
        type: 'string',
        description: 'DOI (e.g., "10.1234/example") or OpenAIRE ID',
      },
      includeAbstract: {
        type: 'boolean',
        default: true,
        description: 'Include full abstract in response (abstracts can be lengthy)',
      },
    },
    required: ['identifier'],
  },
};

export async function handleGetResearchProductDetails(args: unknown): Promise<string> {
  try {
    const input: ProductDetailsInput = ProductDetailsInputSchema.parse(args);

    logger.info('Executing get_research_product_details', {
      identifier: input.identifier,
    });

    const client = getClient();
    const product = await client.getResearchProduct(input.identifier);

    const response = {
      success: true,
      data: {
        id: product.id,
        type: product.type,
        title: product.title,
        authors: product.authors.map((a) => ({
          name: a.name,
          orcid: a.orcid,
          affiliation: a.affiliation,
        })),
        publicationDate: product.publicationDate,
        abstract: input.includeAbstract ? product.abstract : undefined,
        doi: product.doi,
        url: product.url,
        publisher: product.publisher,
        journal: product.journal,
        citations: product.citations,
        openAccessColor: product.openAccessColor,
        peerReviewed: product.peerReviewed,
        subjects: product.subjects,
        funding: product.funding,
        metrics: product.metrics,
      },
    };

    // Sanitize all text fields to ensure proper JSON serialization
    return safeJsonStringify(response);
  } catch (error) {
    logger.error('get_research_product_details failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
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
