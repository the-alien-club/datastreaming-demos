import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { logger } from '../utils/logger.js';
import { createNetworkVisualization, createBarChart, createLineChart, createPieChart, mergeCitationNetworks } from './visualization.js';
export function registerTools(server) {
    // Register tool call handler
    server.setRequestHandler(CallToolRequestSchema, async (request) => {
        const { name, arguments: args } = request.params;
        logger.info('Tool called', { name });
        try {
            switch (name) {
                case 'create_citation_network_chart': {
                    const typedArgs = args;
                    logger.info('create_citation_network_chart called', {
                        nodeCount: typedArgs.nodes?.length,
                        edgeCount: typedArgs.edges?.length
                    });
                    const chart = createNetworkVisualization(typedArgs);
                    return {
                        content: [
                            {
                                type: 'text',
                                text: JSON.stringify({ visualization: chart })
                            }
                        ]
                    };
                }
                case 'create_timeline_chart': {
                    const typedArgs = args;
                    logger.info('create_timeline_chart called', {
                        dataPoints: typedArgs.data?.length,
                        title: typedArgs.title
                    });
                    const chart = createLineChart(typedArgs);
                    return {
                        content: [
                            {
                                type: 'text',
                                text: JSON.stringify({ visualization: chart })
                            }
                        ]
                    };
                }
                case 'create_distribution_chart': {
                    const typedArgs = args;
                    logger.info('create_distribution_chart called', {
                        type: typedArgs.chartType,
                        categories: typedArgs.data?.length
                    });
                    let chart;
                    if (typedArgs.chartType === 'pie') {
                        chart = createPieChart(typedArgs);
                    }
                    else {
                        chart = createBarChart({
                            ...typedArgs,
                            yAxisKey: 'value',
                            xAxisKey: typedArgs.xAxisKey || 'segment'
                        });
                    }
                    return {
                        content: [
                            {
                                type: 'text',
                                text: JSON.stringify({ visualization: chart })
                            }
                        ]
                    };
                }
                case 'merge_citation_networks': {
                    const typedArgs = args;
                    logger.info('merge_citation_networks called', {
                        networkCount: typedArgs.networks?.length
                    });
                    const normalizedNetworks = typedArgs.networks.map((net) => ({
                        ...net,
                        center: net.center || net.nodes[0]?.id || ''
                    }));
                    const merged = mergeCitationNetworks(normalizedNetworks);
                    const chart = createNetworkVisualization({
                        nodes: merged.nodes,
                        edges: merged.edges,
                        center: merged.center,
                        title: typedArgs.title || 'Merged Citation Network',
                        description: typedArgs.description || `${merged.nodes.length} papers, ${merged.edges.length} citations`,
                        metadata: merged.metadata
                    });
                    return {
                        content: [
                            {
                                type: 'text',
                                text: JSON.stringify({ visualization: chart })
                            }
                        ]
                    };
                }
                default:
                    throw new Error(`Unknown tool: ${name}`);
            }
        }
        catch (error) {
            logger.error('Tool execution failed', { name, error });
            throw error;
        }
    });
    // Register tool definitions
    server.setRequestHandler(ListToolsRequestSchema, async () => {
        return {
            tools: [
                {
                    name: 'create_citation_network_chart',
                    description: `Creates an interactive citation network visualization from nodes and edges data.

Use this tool AFTER you have:
1. Called MCP tools to fetch citation networks
2. Optionally processed/merged the data with Bash
3. Prepared the final network structure you want to visualize

The tool returns a chart object that will be displayed in the frontend.`,
                    inputSchema: {
                        type: 'object',
                        properties: {
                            nodes: {
                                type: 'array',
                                description: 'Array of paper/dataset/software nodes',
                                items: {
                                    type: 'object',
                                    properties: {
                                        id: { type: 'string', description: 'Unique identifier (DOI or OpenAIRE ID)' },
                                        title: { type: 'string', description: 'Paper title' },
                                        year: { type: 'number', description: 'Publication year' },
                                        citations: { type: 'number', description: 'Citation count' },
                                        type: {
                                            type: 'string',
                                            enum: ['publication', 'dataset', 'software', 'other'],
                                            description: 'Type of research product'
                                        },
                                        level: { type: 'number', description: 'Depth level in the network (0 = center)' },
                                        openAccess: { type: 'boolean', description: 'Whether openly accessible' }
                                    },
                                    required: ['id', 'title', 'year', 'type']
                                }
                            },
                            edges: {
                                type: 'array',
                                description: 'Array of citation relationships',
                                items: {
                                    type: 'object',
                                    properties: {
                                        source: { type: 'string', description: 'Source node ID' },
                                        target: { type: 'string', description: 'Target node ID' },
                                        type: {
                                            type: 'string',
                                            enum: ['cites', 'isCitedBy', 'references'],
                                            description: 'Type of citation relationship'
                                        }
                                    },
                                    required: ['source', 'target', 'type']
                                }
                            },
                            center: {
                                type: 'string',
                                description: 'ID of the central node (optional, defaults to first node)'
                            },
                            title: {
                                type: 'string',
                                description: 'Chart title (e.g., "Citation Network for Machine Learning Paper")'
                            },
                            description: {
                                type: 'string',
                                description: 'Chart description/summary'
                            },
                            metadata: {
                                type: 'object',
                                description: 'Additional metadata (depth, etc.)',
                                properties: {
                                    depth: { type: 'number', description: 'Network depth level' }
                                }
                            }
                        },
                        required: ['nodes', 'edges', 'title']
                    }
                },
                {
                    name: 'create_timeline_chart',
                    description: `Creates a line chart showing trends over time (e.g., publications by year).

Use this tool AFTER you have:
1. Collected papers from MCP tools
2. Aggregated/counted by year using Bash or your own logic
3. Prepared the time series data

Example use case: Show research output growth from 2015-2025`,
                    inputSchema: {
                        type: 'object',
                        properties: {
                            data: {
                                type: 'array',
                                description: 'Array of time series data points',
                                items: {
                                    type: 'object',
                                    description: 'Each object should have xAxisKey (e.g., year) and yAxisKey (e.g., count) properties'
                                }
                            },
                            title: {
                                type: 'string',
                                description: 'Chart title (e.g., "Publications Over Time")'
                            },
                            description: {
                                type: 'string',
                                description: 'Chart description'
                            },
                            xAxisKey: {
                                type: 'string',
                                description: 'Key name for X axis (e.g., "year", "month")'
                            },
                            yAxisKey: {
                                type: 'string',
                                description: 'Key name for Y axis (e.g., "count", "publications")'
                            }
                        },
                        required: ['data', 'title', 'description', 'xAxisKey', 'yAxisKey']
                    }
                },
                {
                    name: 'create_distribution_chart',
                    description: `Creates a pie or bar chart for categorical distributions.

Use this tool AFTER you have:
1. Collected research products from MCP tools
2. Calculated category distributions using Bash
3. Prepared the categorical breakdown data

Example use cases:
- Publication type distribution (publications, datasets, software)
- Open Access vs Closed Access breakdown
- Research by institution/country`,
                    inputSchema: {
                        type: 'object',
                        properties: {
                            data: {
                                type: 'array',
                                description: 'Array of category data',
                                items: {
                                    type: 'object',
                                    properties: {
                                        segment: { type: 'string', description: 'Category name' },
                                        value: { type: 'number', description: 'Count or value for this category' }
                                    },
                                    required: ['segment', 'value']
                                }
                            },
                            chartType: {
                                type: 'string',
                                enum: ['pie', 'bar'],
                                description: 'Type of chart to create'
                            },
                            title: {
                                type: 'string',
                                description: 'Chart title'
                            },
                            description: {
                                type: 'string',
                                description: 'Chart description'
                            },
                            xAxisKey: {
                                type: 'string',
                                description: 'For bar charts: X axis key (usually "segment")'
                            }
                        },
                        required: ['data', 'chartType', 'title', 'description']
                    }
                },
                {
                    name: 'merge_citation_networks',
                    description: `Merges multiple citation networks into a single unified network.

Use this tool when you have:
1. Multiple citation networks from different papers
2. Need to combine them into one comprehensive graph
3. Want to deduplicate nodes and edges

After merging, this tool automatically creates a visualization.`,
                    inputSchema: {
                        type: 'object',
                        properties: {
                            networks: {
                                type: 'array',
                                description: 'Array of citation networks to merge',
                                items: {
                                    type: 'object',
                                    properties: {
                                        nodes: { type: 'array', description: 'Array of nodes' },
                                        edges: { type: 'array', description: 'Array of edges' },
                                        center: { type: 'string', description: 'Center node ID' },
                                        metadata: { type: 'object', description: 'Network metadata' }
                                    },
                                    required: ['nodes', 'edges']
                                }
                            },
                            title: {
                                type: 'string',
                                description: 'Title for the merged network visualization'
                            },
                            description: {
                                type: 'string',
                                description: 'Description for the merged network'
                            }
                        },
                        required: ['networks']
                    }
                }
            ]
        };
    });
    logger.info('Registered 4 visualization tools');
}
//# sourceMappingURL=index.js.map