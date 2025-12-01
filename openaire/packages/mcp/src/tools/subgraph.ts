import { ScholeXplorerClient } from '../api/scholex-client.js';
import { OpenAIREClient } from '../api/openaire-client.js';
import { SubgraphFromDoisInputSchema } from '../utils/validators.js';
import { logger } from '../utils/logger.js';
import { safeJsonStringify } from '../utils/sanitize.js';
import type { SubgraphFromDoisInput } from '../utils/validators.js';
import type { SubgraphNode, SubgraphEdge } from '../types/index.js';

let scholexClient: ScholeXplorerClient | null = null;
let openAIREClient: OpenAIREClient | null = null;

function getClients() {
  if (!scholexClient) scholexClient = new ScholeXplorerClient();
  if (!openAIREClient) openAIREClient = new OpenAIREClient();
  return { scholexClient, openAIREClient };
}

export const buildSubgraphFromDoisTool = {
  name: 'build_subgraph_from_dois',
  description:
    'Build a subgraph showing ONLY the relationships between a specific set of papers (DOIs). ' +
    'Takes a list of DOIs and finds all citations, supplements, and other relationships that exist BETWEEN those papers. ' +
    'Perfect for visualizing connections within a curated literature review, project outputs, or specific paper collection. ' +
    'Use this when the user has a defined set of papers and wants to see how they connect to each other (not to external papers). ' +
    'Supports all 19 ScholeXplorer relationship types including Cites, IsSupplementTo, HasPart, etc.',
  inputSchema: {
    type: 'object',
    properties: {
      dois: {
        type: 'array',
        items: {
          type: 'string',
        },
        minItems: 2,
        maxItems: 100,
        description: 'Array of DOIs to include in the subgraph (e.g., ["10.1234/paper1", "10.5678/paper2"])',
      },
      includeRelationTypes: {
        type: 'array',
        items: {
          type: 'string',
        },
        description: 'Optional: Filter to specific relationship types (e.g., ["Cites", "IsSupplementTo", "HasPart"])',
      },
      fetchMetadata: {
        type: 'boolean',
        default: true,
        description: 'Fetch full paper metadata from OpenAIRE (title, authors, etc.)',
      },
    },
    required: ['dois'],
  },
};

export async function handleBuildSubgraphFromDois(args: unknown): Promise<string> {
  try {
    const input: SubgraphFromDoisInput = SubgraphFromDoisInputSchema.parse(args);

    logger.info('Executing build_subgraph_from_dois', {
      doisCount: input.dois.length,
      fetchMetadata: input.fetchMetadata,
      relationFilter: input.includeRelationTypes,
    });

    const { scholexClient, openAIREClient } = getClients();

    // Create DOI set for fast lookup
    const doiSet = new Set(input.dois.map(doi => doi.toLowerCase()));

    // Step 1: Query ScholeXplorer for all relationships
    const allRelationships: Array<{
      source: string;
      target: string;
      relationType: string;
      linkProvider: string;
    }> = [];

    logger.info(`Querying ScholeXplorer for ${input.dois.length} DOIs...`);

    for (const doi of input.dois) {
      try {
        // Get outgoing relationships (this DOI as source)
        const outgoing = await scholexClient.getCitations({
          source: doi,
        });

        for (const link of outgoing) {
          const targetDoi = link.target.identifier.toLowerCase();
          // Only keep if target is in our DOI list
          if (doiSet.has(targetDoi)) {
            // Filter by relation type if specified
            if (!input.includeRelationTypes || input.includeRelationTypes.includes(link.relationType)) {
              allRelationships.push({
                source: doi,
                target: link.target.identifier,
                relationType: link.relationType,
                linkProvider: link.linkProvider,
              });
            }
          }
        }

        // Get incoming relationships (this DOI as target)
        const incoming = await scholexClient.getCitations({
          target: doi,
        });

        for (const link of incoming) {
          const sourceDoi = link.source.identifier.toLowerCase();
          // Only keep if source is in our DOI list
          if (doiSet.has(sourceDoi)) {
            // Filter by relation type if specified
            if (!input.includeRelationTypes || input.includeRelationTypes.includes(link.relationType)) {
              // Avoid duplicates by checking if we already have this edge
              const isDuplicate = allRelationships.some(
                r => r.source === link.source.identifier && r.target === doi && r.relationType === link.relationType
              );

              if (!isDuplicate) {
                allRelationships.push({
                  source: link.source.identifier,
                  target: doi,
                  relationType: link.relationType,
                  linkProvider: link.linkProvider,
                });
              }
            }
          }
        }

        logger.debug(`Processed DOI: ${doi}, found ${outgoing.length + incoming.length} total relationships`);
      } catch (error) {
        logger.warn(`Failed to fetch relationships for DOI: ${doi}`, {
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    logger.info(`Found ${allRelationships.length} internal relationships`);

    // Step 2: Optionally fetch metadata for each DOI
    const nodes: SubgraphNode[] = [];

    if (input.fetchMetadata) {
      logger.info('Fetching metadata for papers...');

      for (const doi of input.dois) {
        try {
          const product = await openAIREClient.getResearchProduct(doi);
          nodes.push({
            id: doi,
            title: product.title,
            type: product.type,
            publicationDate: product.publicationDate,
            authors: product.authors.slice(0, 5),
            citationCount: product.citations,
            openAccess: product.openAccessColor ? true : false,
          });
        } catch (error) {
          logger.warn(`Failed to fetch metadata for DOI: ${doi}`, {
            error: error instanceof Error ? error.message : 'Unknown error',
          });
          // Add node without metadata
          nodes.push({
            id: doi,
            title: 'Metadata unavailable',
          });
        }
      }
    } else {
      // Create nodes without metadata
      for (const doi of input.dois) {
        nodes.push({ id: doi });
      }
    }

    // Step 3: Build edges
    const edges: SubgraphEdge[] = allRelationships.map(rel => ({
      source: rel.source,
      target: rel.target,
      relationType: rel.relationType,
      linkProvider: rel.linkProvider,
    }));

    // Step 4: Calculate statistics
    const relationshipTypes: Record<string, number> = {};
    for (const edge of edges) {
      relationshipTypes[edge.relationType] = (relationshipTypes[edge.relationType] || 0) + 1;
    }

    // Find isolated nodes (nodes with no edges)
    const connectedDois = new Set<string>();
    for (const edge of edges) {
      connectedDois.add(edge.source.toLowerCase());
      connectedDois.add(edge.target.toLowerCase());
    }
    const isolatedNodes = input.dois.filter(doi => !connectedDois.has(doi.toLowerCase())).length;

    const response = {
      success: true,
      data: {
        nodes,
        edges,
        statistics: {
          totalNodes: nodes.length,
          totalEdges: edges.length,
          relationshipTypes,
          isolatedNodes,
        },
      },
      summary: {
        doisProvided: input.dois.length,
        relationshipsFound: edges.length,
        connectedPapers: nodes.length - isolatedNodes,
        isolatedPapers: isolatedNodes,
        topRelationTypes: Object.entries(relationshipTypes)
          .sort(([, a], [, b]) => b - a)
          .slice(0, 5)
          .map(([type, count]) => ({ type, count })),
      },
    };

    logger.info('Subgraph built successfully', {
      nodes: nodes.length,
      edges: edges.length,
      isolated: isolatedNodes,
    });

    return safeJsonStringify(response);
  } catch (error) {
    logger.error('build_subgraph_from_dois failed', {
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
