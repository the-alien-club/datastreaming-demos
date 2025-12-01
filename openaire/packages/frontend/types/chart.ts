// types/chart.ts

// Citation Network Types
export interface NetworkNode {
  id: string;
  type: 'publication' | 'dataset' | 'software' | 'other';
  title: string;
  year: number;
  citations: number;
  level: number;  // 0 = center, 1 = direct connection, 2 = second-degree
  openAccess: boolean;
}

export interface NetworkEdge {
  source: string;
  target: string;
  type: 'cites' | 'isCitedBy' | 'references';
  weight?: number;
}

export interface CitationNetwork {
  nodes: NetworkNode[];
  edges: NetworkEdge[];
  center: string;
  metadata: {
    totalNodes: number;
    totalEdges: number;
    depth: number;
    generatedAt: string;
  };
}

export interface ChartConfig {
  [key: string]: {
    label: string;
    stacked?: boolean;
    color?: string;
  };
}

export interface ChartData {
  chartType: "bar" | "multiBar" | "line" | "pie" | "area" | "stackedArea" | "network";
  config: {
    title: string;
    description: string;
    trend?: {
      percentage: number;
      direction: "up" | "down";
    };
    footer?: string;
    totalLabel?: string;
    xAxisKey?: string;
  };
  data: Array<Record<string, any>>;
  chartConfig: ChartConfig;
  networkData?: CitationNetwork;  // Add network-specific data
}
