import type { ChartData, CitationNetwork } from '../types.js';
/**
 * Creates a citation network visualization from nodes and edges data
 */
export declare function createNetworkVisualization(params: {
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
}): ChartData;
/**
 * Creates a bar chart visualization
 */
export declare function createBarChart(params: {
    data: Array<Record<string, any>>;
    title: string;
    description: string;
    xAxisKey: string;
    yAxisKey: string;
    color?: string;
}): ChartData;
/**
 * Creates a line chart visualization
 */
export declare function createLineChart(params: {
    data: Array<Record<string, any>>;
    title: string;
    description: string;
    xAxisKey: string;
    yAxisKey: string;
}): ChartData;
/**
 * Creates a pie chart visualization
 */
export declare function createPieChart(params: {
    data: Array<{
        segment: string;
        value: number;
    }>;
    title: string;
    description: string;
    colors?: Record<string, string>;
}): ChartData;
/**
 * Merges multiple citation networks into a single unified network
 */
export declare function mergeCitationNetworks(networks: CitationNetwork[]): CitationNetwork;
//# sourceMappingURL=visualization.d.ts.map