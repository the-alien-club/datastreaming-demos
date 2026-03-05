/**
 * Merge Citation Networks Tool
 *
 * Merges multiple citation networks into a single unified network and
 * automatically creates a visualization. Deduplicates nodes and edges.
 */
export declare const NAME = "merge_citation_networks";
export declare const DESCRIPTION: string;
export declare const INPUT_SCHEMA: {
    type: "object";
    properties: {
        networks: {
            type: string;
            description: string;
            items: {
                type: string;
                properties: {
                    nodes: {
                        type: string;
                        description: string;
                    };
                    edges: {
                        type: string;
                        description: string;
                    };
                    center: {
                        type: string;
                        description: string;
                    };
                    metadata: {
                        type: string;
                        description: string;
                    };
                };
                required: string[];
            };
        };
        title: {
            type: string;
            description: string;
        };
        description: {
            type: string;
            description: string;
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
export declare function execute(args: Record<string, any>): Promise<string>;
//# sourceMappingURL=merge_citation_networks.d.ts.map