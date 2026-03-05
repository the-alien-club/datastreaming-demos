/**
 * Merge Citation Networks Tool
 *
 * Merges multiple citation networks into a single unified network and
 * automatically creates a visualization. Deduplicates nodes and edges.
 */

import type { ChartData, CitationNetwork } from '../types.js';
import { logger, validateRequiredFields, formatErrorResponse } from '../utils/index.js';

// =============================================================================
// Tool Metadata
// =============================================================================

export const NAME = 'merge_citation_networks';

export const DESCRIPTION =
  'Merge multiple citation networks into a single unified network visualization. ' +
  'Input: array of networks (each with nodes and edges), optional title and description. ' +
  'Deduplicates nodes by ID and edges by source-target-type key. ' +
  'Returns: a merged chart object with chartType "network" for frontend rendering. ' +
  'Use AFTER fetching multiple citation networks that need to be combined into one graph.';

export const INPUT_SCHEMA = {
  type: 'object' as const,
  properties: {
    networks: {
      type: 'array',
      description: 'Array of citation networks to merge into a single unified graph',
      items: {
        type: 'object',
        properties: {
          nodes: {
            type: 'array',
            description: 'Array of research product nodes in this network',
          },
          edges: {
            type: 'array',
            description: 'Array of citation relationship edges in this network',
          },
          center: {
            type: 'string',
            description: 'ID of the central node in this network',
          },
          metadata: {
            type: 'object',
            description: 'Network metadata (depth, generation info, etc.)',
          },
        },
        required: ['nodes', 'edges'],
      },
    },
    title: {
      type: 'string',
      description: 'Title for the merged network visualization',
    },
    description: {
      type: 'string',
      description: 'Description for the merged network',
    },
  },
  required: ['networks'],
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
 * Merge multiple citation networks and create a unified visualization.
 *
 * Combines nodes and edges from multiple citation networks, deduplicating
 * by node ID and edge key (source->target-type). The merged network is
 * automatically transformed into a visualization chart object.
 *
 * @param args - Tool input arguments containing networks array and display options
 * @returns JSON string containing the merged visualization chart object
 *
 * @example
 *   // Merge two citation networks
 *   execute({
 *     networks: [
 *       { nodes: [...], edges: [...], center: "10.1234/a" },
 *       { nodes: [...], edges: [...], center: "10.5678/b" }
 *     ],
 *     title: "Combined Citation Network"
 *   })
 */
export async function execute(args: Record<string, any>): Promise<string> {
  try {
    validateRequiredFields(args, ['networks'], NAME);

    const { networks, title, description } = args;

    logger.info(`${NAME} called`, {
      networkCount: networks?.length,
    });

    // Normalize networks: ensure center is set
    const normalizedNetworks: CitationNetwork[] = networks.map((net: any) => ({
      ...net,
      center: net.center || net.nodes[0]?.id || '',
      metadata: net.metadata || {},
    }));

    const merged = mergeCitationNetworks(normalizedNetworks);

    const depthLevel = merged.metadata.depth;
    const depthText = depthLevel > 1 ? 's' : '';

    const chart: ChartData = {
      chartType: 'network',
      config: {
        title: title || 'Merged Citation Network',
        description:
          description || `${merged.nodes.length} papers, ${merged.edges.length} citations`,
        footer: `Depth: ${depthLevel} level${depthText}`,
      },
      data: merged.nodes,
      chartConfig: {},
      networkData: merged,
    };

    return JSON.stringify({ visualization: chart });
  } catch (error) {
    logger.error(`${NAME} failed`, { error });
    return formatErrorResponse(error, NAME);
  }
}

// =============================================================================
// Internal Helpers
// =============================================================================

/**
 * Merge multiple citation networks into a single unified network.
 *
 * Deduplicates nodes by ID (keeps first occurrence) and edges by
 * a composite key of source->target-type.
 */
function mergeCitationNetworks(networks: CitationNetwork[]): CitationNetwork {
  const nodeMap = new Map<string, any>();
  const edgeSet = new Set<string>();
  const edges: any[] = [];

  for (const network of networks) {
    // Merge nodes (keep first occurrence)
    for (const node of network.nodes) {
      if (!nodeMap.has(node.id)) {
        nodeMap.set(node.id, node);
      }
    }

    // Merge edges (deduplicate by composite key)
    for (const edge of network.edges) {
      const edgeKey = `${edge.source}->${edge.target}-${edge.type}`;
      if (!edgeSet.has(edgeKey)) {
        edgeSet.add(edgeKey);
        edges.push(edge);
      }
    }
  }

  const nodes = Array.from(nodeMap.values());

  return {
    nodes,
    edges,
    center: networks[0]?.center || nodes[0]?.id || '',
    metadata: {
      totalNodes: nodes.length,
      totalEdges: edges.length,
      depth: Math.max(...networks.map((n) => n.metadata?.depth || 1)),
      generatedAt: new Date().toISOString(),
    },
  };
}
