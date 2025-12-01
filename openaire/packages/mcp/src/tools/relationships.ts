import { ScholeXplorerClient } from '../api/scholex-client.js';
import { ResearchRelationshipsInputSchema } from '../utils/validators.js';
import { logger } from '../utils/logger.js';
import { safeJsonStringify } from '../utils/sanitize.js';
import type { ResearchRelationshipsInput } from '../utils/validators.js';

let client: ScholeXplorerClient | null = null;

function getClient(): ScholeXplorerClient {
  if (!client) {
    client = new ScholeXplorerClient();
  }
  return client;
}

export const exploreResearchRelationshipsTool = {
  name: 'explore_research_relationships',
  description:
    'Explore semantic relationships between research outputs beyond citations using ScholeXplorer. ' +
    'Discover papers, datasets, and software connected through 19 relationship types including: ' +
    'Cites, IsSupplementTo, HasPart, IsNewVersionOf, Documents, IsSourceOf, and more. ' +
    'Use this when the user wants to find datasets associated with a paper, supplements, versions, ' +
    'or understand the full research ecosystem around a publication. ' +
    'Requires a DOI or persistent identifier.',
  inputSchema: {
    type: 'object',
    properties: {
      identifier: {
        type: 'string',
        description: 'DOI or PID of the research product (e.g., "10.1234/example")',
      },
      relationType: {
        type: 'string',
        description: 'Specific relationship type: Cites, IsCitedBy, IsSupplementTo, IsSupplementedBy, HasPart, IsPartOf, IsNewVersionOf, IsPreviousVersionOf, IsSourceOf, IsDerivedFrom, Documents, IsDocumentedBy, Compiles, IsCompiledBy, IsIdenticalTo, IsRelatedTo, References, IsReferencedBy, IsReviewedBy',
      },
      targetType: {
        type: 'string',
        enum: ['publication', 'dataset', 'software', 'other', 'all'],
        description: 'Filter by target entity type',
      },
      limit: {
        type: 'number',
        minimum: 1,
        maximum: 100,
        default: 50,
        description: 'Maximum number of relationships to return',
      },
    },
    required: ['identifier'],
  },
};

export async function handleExploreResearchRelationships(args: unknown): Promise<string> {
  try {
    const input: ResearchRelationshipsInput = ResearchRelationshipsInputSchema.parse(args);

    logger.info('Executing explore_research_relationships', {
      identifier: input.identifier,
      relationType: input.relationType,
      targetType: input.targetType,
    });

    const client = getClient();

    // Get relationships using ScholeXplorer
    const request: any = {
      source: input.identifier,
    };

    if (input.relationType) {
      request.relationType = input.relationType;
    }

    const links = await client.getCitations(request);

    // Filter by target type if specified
    let filteredLinks = links;
    if (input.targetType && input.targetType !== 'all') {
      filteredLinks = links.filter(link =>
        link.target.type.toLowerCase().includes(input.targetType!)
      );
    }

    // Limit results
    filteredLinks = filteredLinks.slice(0, input.limit);

    // Group by relationship type for summary
    const byType: Record<string, number> = {};
    const byTargetType: Record<string, number> = {};

    for (const link of filteredLinks) {
      byType[link.relationType] = (byType[link.relationType] || 0) + 1;
      byTargetType[link.target.type] = (byTargetType[link.target.type] || 0) + 1;
    }

    const response = {
      success: true,
      data: {
        sourceId: input.identifier,
        relationships: filteredLinks.map(link => ({
          relationType: link.relationType,
          target: {
            identifier: link.target.identifier,
            type: link.target.type,
            title: link.target.title,
            publicationDate: link.target.publicationDate,
          },
          linkProvider: link.linkProvider,
        })),
        summary: {
          totalRelationships: filteredLinks.length,
          byType,
          byTargetType,
        },
      },
    };

    return safeJsonStringify(response);
  } catch (error) {
    logger.error('explore_research_relationships failed', {
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
