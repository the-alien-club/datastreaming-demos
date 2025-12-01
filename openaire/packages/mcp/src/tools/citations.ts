import { ScholeXplorerClient } from '../api/scholex-client.js';
import { OpenAIREClient } from '../api/openaire-client.js';
import { buildCitationGraph } from '../utils/graph-builder.js';
import { CitationNetworkInputSchema } from '../utils/validators.js';
import { logger } from '../utils/logger.js';
import { safeJsonStringify } from '../utils/sanitize.js';
import type { CitationNetworkInput } from '../utils/validators.js';

let scholexClient: ScholeXplorerClient | null = null;
let openAIREClient: OpenAIREClient | null = null;

function getClients() {
  if (!scholexClient) scholexClient = new ScholeXplorerClient();
  if (!openAIREClient) openAIREClient = new OpenAIREClient();
  return { scholexClient, openAIREClient };
}

export const getCitationNetworkTool = {
  name: 'get_citation_network',
  description:
    'Build a citation network graph for a research product. ' +
    'Explores papers that cite it (incoming) and papers it references (outgoing). ' +
    'Returns a network graph with nodes (papers) and edges (citation relationships) that shows research impact and connections. ' +
    'Use this to visualize citation networks, understand research influence, or explore related work.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      identifier: {
        type: 'string' as const,
        description: 'DOI or OpenAIRE ID of the research product',
      },
      depth: {
        type: 'number' as const,
        minimum: 1,
        maximum: 2, // Limit to 2 levels for performance
        default: 1,
        description: 'Citation depth (1=direct citations, 2=2nd level)',
      },
      direction: {
        type: 'string' as const,
        enum: ['citations', 'references', 'both'] as const,
        default: 'both',
        description: 'Which direction to explore (citations=citing papers, references=cited papers, both=bidirectional)',
      },
      maxNodes: {
        type: 'number' as const,
        minimum: 1,
        maximum: 1000,
        default: 200,
        description: 'Maximum nodes in network (optional, default: 200). Use higher values with caution for performance.',
      },
    },
    required: ['identifier'] as const,
  },
};

export async function handleGetCitationNetwork(args: unknown): Promise<string> {
  try {
    const input: CitationNetworkInput = CitationNetworkInputSchema.parse(args);

    logger.info('Executing get_citation_network', {
      identifier: input.identifier,
      depth: input.depth,
      direction: input.direction,
    });

    const { scholexClient, openAIREClient } = getClients();

    // Build citation network
    const network = await buildCitationGraph(
      input.identifier,
      input.depth || 1,
      input.direction || 'both',
      input.maxNodes || 200, // Safe default
      scholexClient,
      openAIREClient
    );

    return safeJsonStringify({
        success: true,
        data: network,
        summary: {
          centerPaper: input.identifier,
          totalNodes: network.nodes.length,
          totalEdges: network.edges.length,
          depth: input.depth,
        },
      });
  } catch (error) {
    logger.error('get_citation_network failed', {
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
