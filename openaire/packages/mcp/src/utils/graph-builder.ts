import type { CitationNetwork, NetworkNode, NetworkEdge } from '../types/index.js';
import type { ScholeXplorerClient } from '../api/scholex-client.js';
import type { OpenAIREClient } from '../api/openaire-client.js';
import { logger } from './logger.js';

/**
 * Build a citation network graph using BFS
 */
export async function buildCitationGraph(
  centerId: string,
  depth: number,
  direction: 'citations' | 'references' | 'both',
  maxNodes: number,
  scholexClient: ScholeXplorerClient,
  openAIREClient: OpenAIREClient
): Promise<CitationNetwork> {
  const nodes = new Map<string, NetworkNode>();
  const edges: NetworkEdge[] = [];
  const visited = new Set<string>();

  logger.info('Building citation graph', {
    centerId,
    depth,
    direction,
    maxNodes,
  });

  // BFS queue
  const queue: Array<{ id: string; level: number }> = [{ id: centerId, level: 0 }];

  while (queue.length > 0 && nodes.size < maxNodes) {
    const { id, level } = queue.shift()!;

    if (visited.has(id) || level > depth) continue;
    visited.add(id);

    try {
      // Try to get paper metadata from OpenAIRE (or use existing node data)
      let nodeData: NetworkNode;

      if (nodes.has(id)) {
        // Node already pre-populated from citation link, try to enhance with OpenAIRE data
        nodeData = nodes.get(id)!;
        try {
          const paper = await openAIREClient.getResearchProduct(id);
          nodeData = {
            id: paper.id,
            type: paper.type,
            title: paper.title,
            year: new Date(paper.publicationDate).getFullYear(),
            citations: paper.citations,
            level,
            openAccess: !!paper.openAccessColor,
          };
          logger.debug('Enhanced node with OpenAIRE metadata', { id });
        } catch (metadataError) {
          // Keep existing pre-populated data
          logger.debug('Using pre-populated node data (OpenAIRE fetch failed)', { id });
        }
      } else {
        // New node, try to fetch from OpenAIRE
        try {
          const paper = await openAIREClient.getResearchProduct(id);
          nodeData = {
            id: paper.id,
            type: paper.type,
            title: paper.title,
            year: new Date(paper.publicationDate).getFullYear(),
            citations: paper.citations,
            level,
            openAccess: !!paper.openAccessColor,
          };
        } catch (metadataError) {
          // Paper not in main OpenAIRE index, create minimal node
          logger.debug('Paper not in OpenAIRE index, creating minimal node', { id });
          nodeData = {
            id,
            type: 'publication',
            title: `Paper ${id}`,
            year: new Date().getFullYear(),
            citations: 0,
            level,
            openAccess: false,
          };
        }
      }

      nodes.set(id, nodeData);

      logger.debug('Added node to network', {
        id: nodeData.id,
        title: nodeData.title.substring(0, 50),
        level,
      });

      // Get citations/references if not at max depth
      if (level < depth) {
        const fetchPromises: Promise<any>[] = [];

        // Fetch citations (papers that cite this one)
        if (direction === 'citations' || direction === 'both') {
          fetchPromises.push(
            scholexClient.getCitingPapers(id, 20).catch((error) => {
              logger.warn('Failed to fetch citing papers', { id, error });
              return [];
            })
          );
        }

        // Fetch references (papers cited by this one)
        if (direction === 'references' || direction === 'both') {
          fetchPromises.push(
            scholexClient.getReferences(id, 20).catch((error) => {
              logger.warn('Failed to fetch references', { id, error });
              return [];
            })
          );
        }

        const results = await Promise.all(fetchPromises);

        for (const links of results) {
          for (const link of links) {
            const sourceId = link.source.identifier;
            const targetId = link.target.identifier;

            // Add edge
            edges.push({
              source: sourceId,
              target: targetId,
              type: link.relationType === 'cites' ? 'cites' : 'references',
            });

            // Queue the connected node if not visited
            const nextId = sourceId === id ? targetId : sourceId;
            if (!visited.has(nextId) && nodes.size < maxNodes) {
              queue.push({ id: nextId, level: level + 1 });

              // Pre-populate node data from citation link if not already in nodes
              if (!nodes.has(nextId)) {
                const linkData = sourceId === nextId ? link.source : link.target;
                nodes.set(nextId, {
                  id: nextId,
                  type: linkData.type || 'publication',
                  title: linkData.title || `Paper ${nextId}`,
                  year: linkData.publicationDate ? new Date(linkData.publicationDate).getFullYear() : new Date().getFullYear(),
                  citations: 0,
                  level: level + 1,
                  openAccess: false,
                });
                logger.debug('Pre-populated node from citation link', {
                  id: nextId,
                  title: linkData.title?.substring(0, 50),
                });
              }
            }
          }
        }
      }
    } catch (error) {
      logger.warn('Failed to process node in citation graph', {
        id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  // Calculate citation counts from network edges
  const citationCounts = new Map<string, number>();
  for (const edge of edges) {
    if (edge.type === 'cites' || edge.type === 'isCitedBy') {
      // For "A cites B" edges, B is being cited
      const citedPaper = edge.type === 'cites' ? edge.target : edge.source;
      citationCounts.set(citedPaper, (citationCounts.get(citedPaper) || 0) + 1);
    }
  }

  // Update node citation counts based on network structure
  const nodesWithCitations = Array.from(nodes.values()).map(node => ({
    ...node,
    citations: citationCounts.get(node.id) || 0,
  }));

  const network: CitationNetwork = {
    nodes: nodesWithCitations,
    edges,
    center: centerId,
    metadata: {
      totalNodes: nodes.size,
      totalEdges: edges.length,
      depth,
      generatedAt: new Date().toISOString(),
    },
  };

  logger.info('Citation graph built successfully', {
    nodes: network.nodes.length,
    edges: network.edges.length,
    depth,
    citationsCalculated: citationCounts.size,
  });

  return network;
}
