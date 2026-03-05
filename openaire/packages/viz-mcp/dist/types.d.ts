/**
 * Visualization Data Types
 *
 * Type definitions for chart and network visualization data structures.
 * These types define the contract between the MCP server tools and
 * the frontend visualization components.
 */
/**
 * Supported chart visualization types.
 */
export type ChartType = 'network' | 'bar' | 'line' | 'pie';
/**
 * Chart configuration for display settings.
 */
export interface ChartConfig {
    /** Chart title displayed above the visualization */
    title: string;
    /** Optional description text below the title */
    description?: string;
    /** Property key for the X axis (bar and line charts) */
    xAxisKey?: string;
    /** Optional footer text below the chart */
    footer?: string;
}
/**
 * Configuration for a single data series in the chart.
 */
export interface SeriesConfig {
    /** Display label for this data series */
    label: string;
    /** CSS color value for this series (e.g., 'hsl(var(--chart-1))') */
    color: string;
}
/**
 * Top-level chart data structure returned by all visualization tools.
 *
 * This is the primary interface consumed by frontend chart components.
 * The chartType determines which renderer is used.
 */
export interface ChartData {
    /** Type of chart to render */
    chartType: ChartType;
    /** Display configuration (title, description, axes) */
    config: ChartConfig;
    /** Array of data points for the chart */
    data: any[];
    /** Mapping of data keys to their display configuration */
    chartConfig: Record<string, SeriesConfig>;
    /** Network-specific data (only present for chartType 'network') */
    networkData?: CitationNetwork;
}
/**
 * Supported research product types in a citation network.
 */
export type ResearchProductType = 'publication' | 'dataset' | 'software' | 'other';
/**
 * Supported citation relationship types.
 */
export type CitationRelationType = 'cites' | 'isCitedBy' | 'references';
/**
 * A node in the citation network representing a research product.
 */
export interface NetworkNode {
    /** Unique identifier (DOI or OpenAIRE ID) */
    id: string;
    /** Title of the research product */
    title: string;
    /** Publication year */
    year: number;
    /** Number of citations received */
    citations: number;
    /** Type of research product */
    type: ResearchProductType;
    /** Depth level in the network graph (0 = center) */
    level: number;
    /** Whether the product is openly accessible */
    openAccess: boolean;
}
/**
 * An edge in the citation network representing a relationship between nodes.
 */
export interface NetworkEdge {
    /** ID of the source node */
    source: string;
    /** ID of the target node */
    target: string;
    /** Type of citation relationship */
    type: CitationRelationType;
    /** Optional edge weight for weighted graphs */
    weight?: number;
}
/**
 * Metadata about a citation network.
 */
export interface NetworkMetadata {
    /** Total number of nodes in the network */
    totalNodes: number;
    /** Total number of edges in the network */
    totalEdges: number;
    /** Network traversal depth */
    depth: number;
    /** ISO timestamp when the network was generated */
    generatedAt: string;
    /** Additional metadata properties */
    [key: string]: any;
}
/**
 * Complete citation network structure with nodes, edges, and metadata.
 */
export interface CitationNetwork {
    /** Array of research product nodes */
    nodes: NetworkNode[];
    /** Array of citation relationship edges */
    edges: NetworkEdge[];
    /** ID of the central/seed node in the network */
    center: string;
    /** Network metadata and statistics */
    metadata: NetworkMetadata;
}
//# sourceMappingURL=types.d.ts.map