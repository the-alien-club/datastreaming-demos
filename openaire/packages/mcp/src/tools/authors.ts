import { OpenAIREClient } from '../api/openaire-client.js';
import { AuthorProfileInputSchema, CoAuthorshipNetworkInputSchema } from '../utils/validators.js';
import { logger } from '../utils/logger.js';
import { safeJsonStringify } from '../utils/sanitize.js';
import type { AuthorProfileInput, CoAuthorshipNetworkInput } from '../utils/validators.js';
import type { Author, CoAuthorshipNetwork, CoAuthorNode, CoAuthorEdge } from '../types/index.js';

let client: OpenAIREClient | null = null;

function getClient(): OpenAIREClient {
  if (!client) {
    client = new OpenAIREClient();
  }
  return client;
}

export const getAuthorProfileTool = {
  name: 'get_author_profile',
  description:
    'Get a comprehensive profile for a researcher/author including all their publications, co-authors, and research areas. ' +
    'Use this when the user wants to explore an author\'s work, find their publications, ' +
    'identify their collaborators, or understand their research focus. ' +
    'Requires either an ORCID identifier or author name. Returns publications, collaboration patterns, and research areas.',
  inputSchema: {
    type: 'object',
    properties: {
      orcid: {
        type: 'string',
        description: 'Author ORCID identifier (e.g., "0000-0001-2345-6789")',
      },
      authorName: {
        type: 'string',
        description: 'Author full name',
      },
      limit: {
        type: 'number',
        minimum: 1,
        maximum: 500,
        default: 100,
        description: 'Maximum number of publications to retrieve',
      },
      includeCoAuthors: {
        type: 'boolean',
        default: true,
        description: 'Include co-author analysis',
      },
    },
  },
};

export async function handleGetAuthorProfile(args: unknown): Promise<string> {
  try {
    const input: AuthorProfileInput = AuthorProfileInputSchema.parse(args);

    if (!input.orcid && !input.authorName) {
      throw new Error('Either orcid or authorName is required');
    }

    logger.info('Executing get_author_profile', {
      orcid: input.orcid,
      authorName: input.authorName,
      limit: input.limit,
    });

    const client = getClient();

    // Search for author's publications
    const searchRequest: any = {
      query: '',
      page: 1,
      limit: input.limit,
      sortBy: 'date',
    };

    if (input.orcid) {
      searchRequest.authorOrcid = input.orcid;
    } else if (input.authorName) {
      searchRequest.authorFullName = input.authorName;
    }

    const results = await client.searchResearchProducts(searchRequest);

    // Extract co-authors if requested
    const coAuthorMap = new Map<string, { name: string; orcid?: string; count: number }>();
    const subjectsSet = new Set<string>();

    if (input.includeCoAuthors) {
      for (const product of results.results) {
        // Add subjects
        product.subjects.forEach(s => subjectsSet.add(s));

        // Count co-authors
        for (const author of product.authors) {
          const key = author.orcid || author.name;
          if (key !== input.orcid && key !== input.authorName) {
            const existing = coAuthorMap.get(key);
            if (existing) {
              existing.count++;
            } else {
              coAuthorMap.set(key, {
                name: author.name,
                orcid: author.orcid,
                count: 1,
              });
            }
          }
        }
      }
    }

    const coAuthors = Array.from(coAuthorMap.values())
      .map(ca => ({
        name: ca.name,
        orcid: ca.orcid,
        collaborationCount: ca.count,
      }))
      .sort((a, b) => b.collaborationCount - a.collaborationCount)
      .slice(0, 50); // Top 50 collaborators

    const response = {
      success: true,
      data: {
        author: {
          orcid: input.orcid,
          name: input.authorName || results.results[0]?.authors[0]?.name || 'Unknown',
        },
        publications: results.results.map((product) => ({
          id: product.id,
          type: product.type,
          title: product.title,
          publicationDate: product.publicationDate,
          doi: product.doi,
          url: product.url,
          citations: product.citations,
          openAccess: product.openAccessColor ? true : false,
          journal: product.journal,
          coAuthors: product.authors.slice(0, 10).map(a => ({
            name: a.name,
            orcid: a.orcid,
          })),
        })),
        statistics: {
          totalPublications: results.total,
          publicationsReturned: results.results.length,
          totalCoAuthors: coAuthors.length,
          researchAreas: Array.from(subjectsSet).slice(0, 20),
        },
        topCoAuthors: coAuthors.slice(0, 20),
      },
    };

    return safeJsonStringify(response);
  } catch (error) {
    logger.error('get_author_profile failed', {
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

export const analyzeCoAuthorshipNetworkTool = {
  name: 'analyze_coauthorship_network',
  description:
    'Build and analyze a co-authorship collaboration network for a researcher. ' +
    'Creates a network graph showing who the author collaborates with and how these collaborators are connected. ' +
    'Use this to visualize research communities, identify collaboration patterns, ' +
    'find potential collaborators, or understand research team structures. ' +
    'Returns nodes (authors) and edges (collaboration relationships) with paper counts.',
  inputSchema: {
    type: 'object',
    properties: {
      orcid: {
        type: 'string',
        description: 'Author ORCID identifier',
      },
      authorName: {
        type: 'string',
        description: 'Author full name',
      },
      maxDepth: {
        type: 'number',
        minimum: 1,
        maximum: 2,
        default: 1,
        description: 'Network depth: 1 = direct collaborators, 2 = second-degree connections',
      },
      minCollaborations: {
        type: 'number',
        minimum: 1,
        default: 1,
        description: 'Minimum number of co-authored papers to include in network',
      },
      limit: {
        type: 'number',
        minimum: 10,
        maximum: 500,
        default: 100,
        description: 'Maximum publications to analyze',
      },
    },
  },
};

export async function handleAnalyzeCoAuthorshipNetwork(args: unknown): Promise<string> {
  try {
    const input: CoAuthorshipNetworkInput = CoAuthorshipNetworkInputSchema.parse(args);

    if (!input.orcid && !input.authorName) {
      throw new Error('Either orcid or authorName is required');
    }

    logger.info('Executing analyze_coauthorship_network', {
      orcid: input.orcid,
      authorName: input.authorName,
      maxDepth: input.maxDepth,
    });

    const client = getClient();

    // Get author's publications
    const searchRequest: any = {
      query: '',
      page: 1,
      limit: input.limit,
    };

    if (input.orcid) {
      searchRequest.authorOrcid = input.orcid;
    } else if (input.authorName) {
      searchRequest.authorFullName = input.authorName;
    }

    const results = await client.searchResearchProducts(searchRequest);

    // Build collaboration network
    const nodes = new Map<string, CoAuthorNode>();
    const edgeMap = new Map<string, CoAuthorEdge>();

    // Add center node
    const centerId = input.orcid || input.authorName || 'center';
    nodes.set(centerId, {
      id: centerId,
      name: input.authorName || results.results[0]?.authors[0]?.name || 'Unknown',
      orcid: input.orcid,
      publicationCount: results.results.length,
      affiliations: [],
    });

    // Analyze collaborations
    for (const product of results.results) {
      const authors = product.authors;

      for (let i = 0; i < authors.length; i++) {
        const author1 = authors[i];
        const author1Id = author1.orcid || author1.name;

        // Skip if it's the center author
        if (author1Id === centerId) continue;

        // Add author1 as node if not exists
        if (!nodes.has(author1Id)) {
          nodes.set(author1Id, {
            id: author1Id,
            name: author1.name,
            orcid: author1.orcid,
            publicationCount: 1,
            affiliations: author1.affiliation ? [author1.affiliation] : [],
          });
        } else {
          nodes.get(author1Id)!.publicationCount++;
        }

        // Create edge between center and author1
        const edgeKey1 = [centerId, author1Id].sort().join('|||');
        if (!edgeMap.has(edgeKey1)) {
          edgeMap.set(edgeKey1, {
            source: centerId,
            target: author1Id,
            weight: 1,
            papers: [product.title],
          });
        } else {
          const edge = edgeMap.get(edgeKey1)!;
          edge.weight++;
          edge.papers.push(product.title);
        }

        // If depth is 2, also connect collaborators to each other
        if (input.maxDepth === 2) {
          for (let j = i + 1; j < authors.length; j++) {
            const author2 = authors[j];
            const author2Id = author2.orcid || author2.name;

            if (author2Id === centerId) continue;

            const edgeKey2 = [author1Id, author2Id].sort().join('|||');
            if (!edgeMap.has(edgeKey2)) {
              edgeMap.set(edgeKey2, {
                source: author1Id,
                target: author2Id,
                weight: 1,
                papers: [product.title],
              });
            } else {
              const edge = edgeMap.get(edgeKey2)!;
              edge.weight++;
              edge.papers.push(product.title);
            }
          }
        }
      }
    }

    // Filter by minimum collaborations
    const filteredEdges = Array.from(edgeMap.values())
      .filter(edge => edge.weight >= input.minCollaborations);

    // Only keep nodes that have edges
    const connectedNodeIds = new Set<string>();
    connectedNodeIds.add(centerId);
    filteredEdges.forEach(edge => {
      connectedNodeIds.add(edge.source);
      connectedNodeIds.add(edge.target);
    });

    const finalNodes = Array.from(nodes.values())
      .filter(node => connectedNodeIds.has(node.id));

    const network: CoAuthorshipNetwork = {
      nodes: finalNodes,
      edges: filteredEdges.map(edge => ({
        source: edge.source,
        target: edge.target,
        weight: edge.weight,
        papers: edge.papers.slice(0, 5), // Limit to 5 paper titles
      })),
      centerAuthor: {
        name: input.authorName || results.results[0]?.authors[0]?.name || 'Unknown',
        orcid: input.orcid,
      },
      metadata: {
        totalAuthors: finalNodes.length,
        totalCollaborations: filteredEdges.length,
        generatedAt: new Date().toISOString(),
      },
    };

    const response = {
      success: true,
      data: network,
      summary: {
        centerAuthor: network.centerAuthor,
        publicationsAnalyzed: results.results.length,
        totalCollaborators: finalNodes.length - 1, // Exclude center
        totalCollaborations: filteredEdges.length,
        depth: input.maxDepth,
      },
    };

    return safeJsonStringify(response);
  } catch (error) {
    logger.error('analyze_coauthorship_network failed', {
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
