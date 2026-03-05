/**
 * Create Citation Network Chart Tool
 *
 * Creates an interactive citation network visualization from nodes and edges data.
 * Returns a chart object consumed by the frontend visualization components.
 */
export declare const NAME = "create_citation_network_chart";
export declare const DESCRIPTION: string;
export declare const INPUT_SCHEMA: {
    type: "object";
    properties: {
        nodes: {
            type: string;
            description: string;
            items: {
                type: string;
                properties: {
                    id: {
                        type: string;
                        description: string;
                    };
                    title: {
                        type: string;
                        description: string;
                    };
                    year: {
                        type: string;
                        description: string;
                    };
                    citations: {
                        type: string;
                        description: string;
                    };
                    type: {
                        type: string;
                        enum: string[];
                        description: string;
                    };
                    level: {
                        type: string;
                        description: string;
                    };
                    openAccess: {
                        type: string;
                        description: string;
                    };
                };
                required: string[];
            };
        };
        edges: {
            type: string;
            description: string;
            items: {
                type: string;
                properties: {
                    source: {
                        type: string;
                        description: string;
                    };
                    target: {
                        type: string;
                        description: string;
                    };
                    type: {
                        type: string;
                        enum: string[];
                        description: string;
                    };
                };
                required: string[];
            };
        };
        center: {
            type: string;
            description: string;
        };
        title: {
            type: string;
            description: string;
        };
        description: {
            type: string;
            description: string;
        };
        metadata: {
            type: string;
            description: string;
            properties: {
                depth: {
                    type: string;
                    description: string;
                };
            };
        };
    };
    required: string[];
};
export declare const ANNOTATIONS: {
    readOnlyHint: boolean;
    destructiveHint: boolean;
    idempotentHint: boolean;
    openWorldHint: boolean;
};
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
export declare function execute(args: Record<string, any>): Promise<string>;
//# sourceMappingURL=create_citation_network_chart.d.ts.map