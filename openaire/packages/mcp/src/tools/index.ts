import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import {
  searchResearchProductsTool,
  handleSearchResearchProducts,
} from './search.js';
import {
  getResearchProductDetailsTool,
  handleGetResearchProductDetails,
} from './details.js';
import {
  getCitationNetworkTool,
  handleGetCitationNetwork,
} from './citations.js';
import {
  searchOrganizationsTool,
  handleSearchOrganizations,
} from './organizations.js';
import {
  searchProjectsTool,
  handleSearchProjects,
  getProjectOutputsTool,
  handleGetProjectOutputs,
} from './projects.js';
import {
  getAuthorProfileTool,
  handleGetAuthorProfile,
  analyzeCoAuthorshipNetworkTool,
  handleAnalyzeCoAuthorshipNetwork,
} from './authors.js';
import {
  searchDatasetsTool,
  handleSearchDatasets,
} from './datasets.js';
import {
  searchDataSourcesTool,
  handleSearchDataSources,
} from './datasources.js';
import {
  findByInfluenceClassTool,
  handleFindByInfluenceClass,
  findByPopularityClassTool,
  handleFindByPopularityClass,
  findByImpulseClassTool,
  handleFindByImpulseClass,
  findByCitationCountClassTool,
  handleFindByCitationCountClass,
} from './highly-cited.js';
import {
  exploreResearchRelationshipsTool,
  handleExploreResearchRelationships,
} from './relationships.js';
import {
  analyzeResearchTrendsTool,
  handleAnalyzeResearchTrends,
} from './trends.js';
import {
  buildSubgraphFromDoisTool,
  handleBuildSubgraphFromDois,
} from './subgraph.js';
import { logger } from '../utils/logger.js';
import { safeJsonStringify } from '../utils/sanitize.js';

export function registerTools(server: Server): void {
  // Register tools list handler
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    logger.debug('Listing available tools');
    return {
      tools: [
        // Original tools
        searchResearchProductsTool,
        getResearchProductDetailsTool,
        getCitationNetworkTool,
        // New tools
        searchOrganizationsTool,
        searchProjectsTool,
        getAuthorProfileTool,
        searchDatasetsTool,
        analyzeCoAuthorshipNetworkTool,
        getProjectOutputsTool,
        // Citation class tools (4 tools for different indicators)
        findByInfluenceClassTool,
        findByPopularityClassTool,
        findByImpulseClassTool,
        findByCitationCountClassTool,
        exploreResearchRelationshipsTool,
        searchDataSourcesTool,
        analyzeResearchTrendsTool,
        buildSubgraphFromDoisTool,
      ],
    };
  });

  // Register tool call handler
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    logger.info('Tool called', { name });

    try {
      switch (name) {
        case 'search_research_products':
          return {
            content: [
              {
                type: 'text',
                text: await handleSearchResearchProducts(args),
              },
            ],
          };

        case 'get_research_product_details':
          return {
            content: [
              {
                type: 'text',
                text: await handleGetResearchProductDetails(args),
              },
            ],
          };

        case 'get_citation_network':
          return {
            content: [
              {
                type: 'text',
                text: await handleGetCitationNetwork(args),
              },
            ],
          };

        case 'search_organizations':
          return {
            content: [
              {
                type: 'text',
                text: await handleSearchOrganizations(args),
              },
            ],
          };

        case 'search_projects':
          return {
            content: [
              {
                type: 'text',
                text: await handleSearchProjects(args),
              },
            ],
          };

        case 'get_author_profile':
          return {
            content: [
              {
                type: 'text',
                text: await handleGetAuthorProfile(args),
              },
            ],
          };

        case 'search_datasets':
          return {
            content: [
              {
                type: 'text',
                text: await handleSearchDatasets(args),
              },
            ],
          };

        case 'analyze_coauthorship_network':
          return {
            content: [
              {
                type: 'text',
                text: await handleAnalyzeCoAuthorshipNetwork(args),
              },
            ],
          };

        case 'get_project_outputs':
          return {
            content: [
              {
                type: 'text',
                text: await handleGetProjectOutputs(args),
              },
            ],
          };

        case 'find_by_influence_class':
          return {
            content: [
              {
                type: 'text',
                text: await handleFindByInfluenceClass(args),
              },
            ],
          };

        case 'find_by_popularity_class':
          return {
            content: [
              {
                type: 'text',
                text: await handleFindByPopularityClass(args),
              },
            ],
          };

        case 'find_by_impulse_class':
          return {
            content: [
              {
                type: 'text',
                text: await handleFindByImpulseClass(args),
              },
            ],
          };

        case 'find_by_citation_count_class':
          return {
            content: [
              {
                type: 'text',
                text: await handleFindByCitationCountClass(args),
              },
            ],
          };

        case 'explore_research_relationships':
          return {
            content: [
              {
                type: 'text',
                text: await handleExploreResearchRelationships(args),
              },
            ],
          };

        case 'search_data_sources':
          return {
            content: [
              {
                type: 'text',
                text: await handleSearchDataSources(args),
              },
            ],
          };

        case 'analyze_research_trends':
          return {
            content: [
              {
                type: 'text',
                text: await handleAnalyzeResearchTrends(args),
              },
            ],
          };

        case 'build_subgraph_from_dois':
          return {
            content: [
              {
                type: 'text',
                text: await handleBuildSubgraphFromDois(args),
              },
            ],
          };

        default:
          logger.warn('Unknown tool requested', { name });
          return {
            content: [
              {
                type: 'text',
                text: safeJsonStringify({
                  success: false,
                  error: {
                    message: `Unknown tool: ${name}`,
                    type: 'ToolNotFoundError',
                  },
                }),
              },
            ],
            isError: true,
          };
      }
    } catch (error) {
      logger.error('Tool execution failed', {
        name,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      return {
        content: [
          {
            type: 'text',
            text: safeJsonStringify({
              success: false,
              error: {
                message: error instanceof Error ? error.message : 'Unknown error occurred',
                type: error instanceof Error ? error.constructor.name : 'Error',
              },
            }),
          },
        ],
        isError: true,
      };
    }
  });

  logger.info('Tools registered successfully');
}
