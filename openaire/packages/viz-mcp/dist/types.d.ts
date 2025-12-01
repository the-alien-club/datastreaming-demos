export interface ChartData {
    chartType: 'network' | 'bar' | 'line' | 'pie';
    config: {
        title: string;
        description?: string;
        xAxisKey?: string;
        footer?: string;
    };
    data: any[];
    chartConfig: Record<string, {
        label: string;
        color: string;
    }>;
    networkData?: CitationNetwork;
}
export interface CitationNetwork {
    nodes: Array<{
        id: string;
        title: string;
        year: number;
        citations: number;
        type: 'publication' | 'dataset' | 'software' | 'other';
        level: number;
        openAccess: boolean;
    }>;
    edges: Array<{
        source: string;
        target: string;
        type: 'cites' | 'isCitedBy' | 'references';
        weight?: number;
    }>;
    center: string;
    metadata: {
        totalNodes: number;
        totalEdges: number;
        depth: number;
        generatedAt: string;
        [key: string]: any;
    };
}
//# sourceMappingURL=types.d.ts.map