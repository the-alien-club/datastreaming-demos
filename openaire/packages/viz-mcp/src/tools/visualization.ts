import type { ChartData, CitationNetwork } from '../types.js';

/**
 * Creates a citation network visualization from nodes and edges data
 */
export function createNetworkVisualization(params: {
  nodes: Array<{
    id: string;
    title: string;
    year: number;
    citations?: number;
    type: 'publication' | 'dataset' | 'software' | 'other';
    level?: number;
    openAccess?: boolean;
  }>;
  edges: Array<{
    source: string;
    target: string;
    type: 'cites' | 'isCitedBy' | 'references';
    weight?: number;
  }>;
  center?: string;
  title?: string;
  description?: string;
  metadata?: {
    depth?: number;
    [key: string]: any;
  };
}): ChartData {
  const { nodes, edges, center, title, description, metadata } = params;

  // Normalize nodes with defaults
  const normalizedNodes = nodes.map(node => ({
    ...node,
    citations: node.citations ?? 0,
    level: node.level ?? 0,
    openAccess: node.openAccess ?? false
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
      ...metadata
    }
  };

  const depthLevel = networkData.metadata.depth;
  const depthText = depthLevel > 1 ? 's' : '';

  return {
    chartType: 'network',
    config: {
      title: title || 'Citation Network',
      description: description || `${nodes.length} papers, ${edges.length} citations`,
      footer: `Depth: ${depthLevel} level${depthText}`
    },
    data: nodes,
    chartConfig: {},
    networkData
  };
}

/**
 * Creates a bar chart visualization
 */
export function createBarChart(params: {
  data: Array<Record<string, any>>;
  title: string;
  description: string;
  xAxisKey: string;
  yAxisKey: string;
  color?: string;
}): ChartData {
  const { data, title, description, xAxisKey, yAxisKey, color } = params;

  return {
    chartType: 'bar',
    config: {
      title,
      description,
      xAxisKey
    },
    data,
    chartConfig: {
      [yAxisKey]: {
        label: yAxisKey,
        color: color || 'hsl(var(--chart-1))'
      }
    }
  };
}

/**
 * Creates a line chart visualization
 */
export function createLineChart(params: {
  data: Array<Record<string, any>>;
  title: string;
  description: string;
  xAxisKey: string;
  yAxisKey: string;
}): ChartData {
  const { data, title, description, xAxisKey, yAxisKey } = params;

  return {
    chartType: 'line',
    config: {
      title,
      description,
      xAxisKey
    },
    data,
    chartConfig: {
      [yAxisKey]: {
        label: yAxisKey,
        color: 'hsl(var(--chart-1))'
      }
    }
  };
}

/**
 * Creates a pie chart visualization
 */
export function createPieChart(params: {
  data: Array<{ segment: string; value: number }>;
  title: string;
  description: string;
  colors?: Record<string, string>;
}): ChartData {
  const { data, title, description, colors } = params;

  const chartConfig: Record<string, { label: string; color: string }> = {};
  data.forEach((item, index) => {
    const segmentKey = item.segment.toLowerCase().replace(/\s+/g, '');
    chartConfig[segmentKey] = {
      label: item.segment,
      color: colors?.[item.segment] || `hsl(var(--chart-${(index % 5) + 1}))`
    };
  });

  return {
    chartType: 'pie',
    config: {
      title,
      description
    },
    data,
    chartConfig
  };
}

/**
 * Merges multiple citation networks into a single unified network
 */
export function mergeCitationNetworks(networks: CitationNetwork[]): CitationNetwork {
  const nodeMap = new Map<string, any>();
  const edgeSet = new Set<string>();
  const edges: any[] = [];

  // Merge nodes (keep first occurrence)
  for (const network of networks) {
    for (const node of network.nodes) {
      if (!nodeMap.has(node.id)) {
        nodeMap.set(node.id, node);
      }
    }

    // Merge edges (deduplicate)
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
      depth: Math.max(...networks.map(n => n.metadata?.depth || 1)),
      generatedAt: new Date().toISOString()
    }
  };
}
