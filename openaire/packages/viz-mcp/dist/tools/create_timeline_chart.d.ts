/**
 * Create Timeline Chart Tool
 *
 * Creates a line chart showing trends over time (e.g., publications by year).
 * Returns a chart object consumed by the frontend visualization components.
 */
export declare const NAME = "create_timeline_chart";
export declare const DESCRIPTION: string;
export declare const INPUT_SCHEMA: {
    type: "object";
    properties: {
        data: {
            type: string;
            description: string;
            items: {
                type: string;
                description: string;
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
        xAxisKey: {
            type: string;
            description: string;
        };
        yAxisKey: {
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
 * Create a line chart visualization for time series data.
 *
 * Transforms time series data points into a structured chart object that
 * the frontend can render as an interactive line chart. Supports configurable
 * axis keys for flexible data mapping.
 *
 * @param args - Tool input arguments containing data array and axis configuration
 * @returns JSON string containing the visualization chart object
 *
 * @example
 *   // Publications per year
 *   execute({
 *     data: [{ year: 2020, count: 15 }, { year: 2021, count: 23 }],
 *     title: "Publications Over Time",
 *     description: "Annual research output",
 *     xAxisKey: "year",
 *     yAxisKey: "count"
 *   })
 */
export declare function execute(args: Record<string, any>): Promise<string>;
//# sourceMappingURL=create_timeline_chart.d.ts.map