/**
 * Create Distribution Chart Tool
 *
 * Creates a pie or bar chart for categorical distributions.
 * Returns a chart object consumed by the frontend visualization components.
 */
export declare const NAME = "create_distribution_chart";
export declare const DESCRIPTION: string;
export declare const INPUT_SCHEMA: {
    type: "object";
    properties: {
        data: {
            type: string;
            description: string;
            items: {
                type: string;
                properties: {
                    segment: {
                        type: string;
                        description: string;
                    };
                    value: {
                        type: string;
                        description: string;
                    };
                };
                required: string[];
            };
        };
        chartType: {
            type: string;
            enum: string[];
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
        xAxisKey: {
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
 * Create a pie or bar chart visualization for categorical data.
 *
 * Transforms categorical distribution data into a structured chart object.
 * Supports both pie charts (for proportional breakdowns) and bar charts
 * (for comparing values across categories). Automatically generates
 * color assignments for each data segment.
 *
 * @param args - Tool input arguments containing data array, chart type, and display options
 * @returns JSON string containing the visualization chart object
 *
 * @example
 *   // Pie chart: publication type distribution
 *   execute({
 *     data: [{ segment: "Journal Articles", value: 150 }, { segment: "Conference Papers", value: 80 }],
 *     chartType: "pie",
 *     title: "Publication Types",
 *     description: "Distribution of research output by type"
 *   })
 *
 *   // Bar chart: research by country
 *   execute({
 *     data: [{ segment: "US", value: 500 }, { segment: "UK", value: 300 }],
 *     chartType: "bar",
 *     title: "Research by Country",
 *     description: "Number of publications per country"
 *   })
 */
export declare function execute(args: Record<string, any>): Promise<string>;
//# sourceMappingURL=create_distribution_chart.d.ts.map