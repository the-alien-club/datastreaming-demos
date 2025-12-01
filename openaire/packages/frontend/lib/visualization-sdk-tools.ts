// SDK MCP Server with custom visualization tools
import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import type { ChartData } from '@/types/chart';
import {
  createNetworkVisualization,
  createBarChart,
  createLineChart,
  createPieChart,
  mergeCitationNetworks
} from './visualization-tools';

/**
 * SDK MCP Server with Visualization Tools
 * These tools run in-process and allow agents to create charts
 */
export const visualizationServer = createSdkMcpServer({
  name: 'viz-tools',
  version: '1.0.0',
  tools: [
    tool(
      'create_citation_network_chart',
      `Creates an interactive citation network visualization from nodes and edges data.

Use this tool AFTER you have:
1. Called MCP tools to fetch citation networks
2. Optionally processed/merged the data with Bash
3. Prepared the final network structure you want to visualize

The tool returns a chart object that will be displayed in the frontend.`,
      {
        nodes: z.array(z.object({
          id: z.string().describe('Unique identifier (DOI or OpenAIRE ID)'),
          title: z.string().describe('Paper title'),
          year: z.number().describe('Publication year'),
          citations: z.number().optional().describe('Citation count'),
          type: z.enum(['publication', 'dataset', 'software', 'other']).describe('Type of research product'),
          level: z.number().optional().describe('Depth level in the network (0 = center)'),
          openAccess: z.boolean().optional().describe('Whether openly accessible')
        })).describe('Array of paper/dataset/software nodes'),
        edges: z.array(z.object({
          source: z.string().describe('Source node ID'),
          target: z.string().describe('Target node ID'),
          type: z.enum(['cites', 'isCitedBy', 'references']).describe('Type of citation relationship')
        })).describe('Array of citation relationships'),
        center: z.string().optional().describe('ID of the central node (optional, defaults to first node)'),
        title: z.string().describe('Chart title (e.g., "Citation Network for Machine Learning Paper")'),
        description: z.string().optional().describe('Chart description/summary'),
        metadata: z.object({
          depth: z.number().optional().describe('Network depth level')
        }).optional().describe('Additional metadata')
      },
      async (args) => {
        const chart = createNetworkVisualization(args);
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({ visualization: chart })
          }]
        };
      }
    ),

    tool(
      'create_timeline_chart',
      `Creates a line chart showing trends over time (e.g., publications by year).

Use this tool AFTER you have:
1. Collected papers from MCP tools
2. Aggregated/counted by year using Bash or your own logic
3. Prepared the time series data

Example use case: Show research output growth from 2015-2025`,
      {
        data: z.array(z.record(z.any())).describe('Array of time series data points'),
        title: z.string().describe('Chart title (e.g., "Publications Over Time")'),
        description: z.string().describe('Chart description'),
        xAxisKey: z.string().describe('Key name for X axis (e.g., "year", "month")'),
        yAxisKey: z.string().describe('Key name for Y axis (e.g., "count", "publications")')
      },
      async (args) => {
        const chart = createLineChart(args);
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({ visualization: chart })
          }]
        };
      }
    ),

    tool(
      'create_distribution_chart',
      `Creates a pie or bar chart for categorical distributions.

Use this tool AFTER you have:
1. Collected research products from MCP tools
2. Calculated category distributions using Bash
3. Prepared the categorical breakdown data

Example use cases:
- Publication type distribution (publications, datasets, software)
- Open Access vs Closed Access breakdown
- Research by institution/country`,
      {
        data: z.array(z.object({
          segment: z.string().describe('Category name'),
          value: z.number().describe('Count or value for this category')
        })).describe('Array of category data'),
        chartType: z.enum(['pie', 'bar']).describe('Type of chart to create'),
        title: z.string().describe('Chart title'),
        description: z.string().describe('Chart description'),
        xAxisKey: z.string().optional().describe('For bar charts: X axis key (usually "segment")')
      },
      async (args) => {
        let chart: ChartData;
        if (args.chartType === 'pie') {
          chart = createPieChart(args);
        } else {
          chart = createBarChart({
            ...args,
            yAxisKey: 'value',
            xAxisKey: args.xAxisKey || 'segment'
          });
        }
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({ visualization: chart })
          }]
        };
      }
    ),

    tool(
      'merge_citation_networks',
      `Merges multiple citation networks into a single unified network.

Use this tool when you have:
1. Multiple citation networks from different papers
2. Need to combine them into one comprehensive graph
3. Want to deduplicate nodes and edges

After merging, this tool automatically creates a visualization.`,
      {
        networks: z.array(z.object({
          nodes: z.array(z.any()).describe('Array of nodes'),
          edges: z.array(z.any()).describe('Array of edges'),
          center: z.string().optional().describe('Center node ID'),
          metadata: z.record(z.any()).optional().describe('Network metadata')
        })).describe('Array of citation networks to merge'),
        title: z.string().optional().describe('Title for the merged network visualization'),
        description: z.string().optional().describe('Description for the merged network')
      },
      async (args) => {
        // Normalize networks to ensure center is always present
        const normalizedNetworks = args.networks.map(net => ({
          ...net,
          center: net.center || net.nodes[0]?.id || ''
        })) as any;

        const merged = mergeCitationNetworks(normalizedNetworks);
        const chart = createNetworkVisualization({
          nodes: merged.nodes,
          edges: merged.edges,
          center: merged.center,
          title: args.title || 'Merged Citation Network',
          description: args.description || `${merged.nodes.length} papers, ${merged.edges.length} citations`,
          metadata: merged.metadata
        });
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({ visualization: chart })
          }]
        };
      }
    )
  ]
});

// Legacy exports for backwards compatibility
export const VISUALIZATION_TOOLS = [
  {
    name: 'create_citation_network_chart',
    description: `Creates an interactive citation network visualization from nodes and edges data.

Use this tool AFTER you have:
1. Called MCP tools to fetch citation networks
2. Optionally processed/merged the data with Bash
3. Prepared the final network structure you want to visualize

The tool returns a chart object that will be displayed in the frontend.`,
    input_schema: {
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
    input_schema: {
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
    input_schema: {
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

After merging, use create_citation_network_chart to visualize the result.`,
    input_schema: {
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
];

/**
 * Tool Handlers
 * These functions are called when the agent invokes a visualization tool
 */
export const VISUALIZATION_TOOL_HANDLERS: Record<string, (params: any) => ChartData> = {
  create_citation_network_chart: (params) => {
    console.log('[VizTool] create_citation_network_chart:', {
      nodeCount: params.nodes?.length,
      edgeCount: params.edges?.length
    });
    return createNetworkVisualization(params);
  },

  create_timeline_chart: (params) => {
    console.log('[VizTool] create_timeline_chart:', {
      dataPoints: params.data?.length,
      title: params.title
    });
    return createLineChart(params);
  },

  create_distribution_chart: (params) => {
    console.log('[VizTool] create_distribution_chart:', {
      type: params.chartType,
      categories: params.data?.length
    });

    if (params.chartType === 'pie') {
      return createPieChart(params);
    } else {
      return createBarChart({
        ...params,
        yAxisKey: 'value',
        xAxisKey: params.xAxisKey || 'segment'
      });
    }
  },

  merge_citation_networks: (params) => {
    console.log('[VizTool] merge_citation_networks:', {
      networkCount: params.networks?.length
    });

    const merged = mergeCitationNetworks(params.networks);

    return createNetworkVisualization({
      nodes: merged.nodes,
      edges: merged.edges,
      center: merged.center,
      title: params.title || 'Merged Citation Network',
      description: params.description || `${merged.nodes.length} papers, ${merged.edges.length} citations`,
      metadata: merged.metadata
    });
  }
};
