/**
 * Create Citation Network Chart Tool
 *
 * Creates an interactive citation network visualization from nodes and edges data.
 * Returns a chart object consumed by the frontend visualization components.
 */

import type { ChartData, CitationNetwork } from '../types.js';
import { logger, validateRequiredFields, formatErrorResponse } from '../utils/index.js';

// =============================================================================
// Tool Metadata
// =============================================================================

export const NAME = 'create_citation_network_chart';

export const DESCRIPTION =
  'Create an interactive citation network visualization from nodes and edges data. ' +
  'Input: nodes (id, title, year, type, citations, level, openAccess) and edges (source, target, type). ' +
  'Returns: a chart object with chartType "network" for frontend rendering. ' +
  'Use AFTER fetching citation data from research APIs and preparing the network structure.';

export const INPUT_SCHEMA = {
  type: 'object' as const,
  properties: {
    nodes: {
      type: 'array',
      description: 'Array of research product nodes in the network',
      items: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: 'Unique identifier (DOI or OpenAIRE ID)',
          },
          title: {
            type: 'string',
            description: 'Title of the research product',
          },
          year: {
            type: 'number',
            description: 'Publication year',
          },
          citations: {
            type: 'number',
            description: 'Citation count (defaults to 0 if not provided)',
          },
          type: {
            type: 'string',
            enum: ['publication', 'dataset', 'software', 'other'],
            description: 'Type of research product',
          },
          level: {
            type: 'number',
            description: 'Depth level in the network graph (0 = center node)',
          },
          openAccess: {
            type: 'boolean',
            description: 'Whether the research product is openly accessible',
          },
        },
        required: ['id', 'title', 'year', 'type'],
      },
    },
    edges: {
      type: 'array',
      description: 'Array of citation relationship edges between nodes',
      items: {
        type: 'object',
        properties: {
          source: {
            type: 'string',
            description: 'Source node ID (the citing paper)',
          },
          target: {
            type: 'string',
            description: 'Target node ID (the cited paper)',
          },
          type: {
            type: 'string',
            enum: ['cites', 'isCitedBy', 'references'],
            description: 'Type of citation relationship',
          },
        },
        required: ['source', 'target', 'type'],
      },
    },
    center: {
      type: 'string',
      description: 'ID of the central node in the network (defaults to first node)',
    },
    title: {
      type: 'string',
      description: 'Chart title (e.g., "Citation Network for Machine Learning Paper")',
    },
    description: {
      type: 'string',
      description: 'Chart description or summary text',
    },
    metadata: {
      type: 'object',
      description: 'Additional metadata for the network visualization',
      properties: {
        depth: {
          type: 'number',
          description: 'Network traversal depth level',
        },
      },
    },
  },
  required: ['nodes', 'edges', 'title'],
};

export const ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

// =============================================================================
// Execute
// =============================================================================

/**
 * Create an interactive citation network visualization.
 *
 * Transforms raw nodes and edges data into a structured chart object that
 * the frontend can render as an interactive network graph. Normalizes node
 * properties with sensible defaults and computes network metadata.
 *
 * @param args - Tool input arguments containing nodes, edges, and display options
 * @returns JSON string containing the visualization chart object
 *
 * @example
 *   // Basic citation network
 *   execute({
 *     nodes: [{ id: "10.1234/a", title: "Paper A", year: 2023, type: "publication" }],
 *     edges: [{ source: "10.5678/b", target: "10.1234/a", type: "cites" }],
 *     title: "Citation Network"
 *   })
 */
export async function execute(args: Record<string, any>): Promise<string> {
  try {
    validateRequiredFields(args, ['nodes', 'edges', 'title'], NAME);

    const { nodes, edges, center, title, description, metadata } = args;

    logger.info(`${NAME} called`, {
      nodeCount: nodes?.length,
      edgeCount: edges?.length,
    });

    // Normalize nodes with defaults
    const normalizedNodes = nodes.map((node: any) => ({
      ...node,
      citations: node.citations ?? 0,
      level: node.level ?? 0,
      openAccess: node.openAccess ?? false,
    }));

    const networkData: CitationNetwork = {
      nodes: normalizedNodes,
      edges,
      center: center || nodes[0]?.id || '',
      metadata: {
        totalNodes: nodes.length,
        totalEdges: edges.length,
        depth: metadata?.depth || 1,
        generatedAt: new Date().toISOString(),
        ...metadata,
      },
    };

    const depthLevel = networkData.metadata.depth;
    const depthText = depthLevel > 1 ? 's' : '';

    const chart: ChartData = {
      chartType: 'network',
      config: {
        title: title || 'Citation Network',
        description: description || `${nodes.length} papers, ${edges.length} citations`,
        footer: `Depth: ${depthLevel} level${depthText}`,
      },
      data: nodes,
      chartConfig: {},
      networkData,
    };

    return JSON.stringify({ visualization: chart });
  } catch (error) {
    logger.error(`${NAME} failed`, { error });
    return formatErrorResponse(error, NAME);
  }
}
