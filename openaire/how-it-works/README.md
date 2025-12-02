# OpenAIRE Research Intelligence System - How It Works

This documentation provides a comprehensive guide to the OpenAIRE Research Intelligence System, including the MCP server implementation and the multi-agent frontend that uses it.

## System Overview

The OpenAIRE Research Intelligence System consists of two main components:

1. **MCP Server** - Exposes 17 research intelligence tools for accessing OpenAIRE's 600M+ research products and 2.25B+ citation relationships
2. **Multi-Agent Frontend** - Orchestrates 5 specialized AI agents that use the MCP tools to answer complex research queries

## Documentation Structure

### Core Documentation

- **[MCP Tools Reference](./mcp-tools-reference.md)** - Complete reference for all 17 MCP tools, their parameters, and capabilities
- **[Frontend Agents](./frontend-agents.md)** - Detailed guide to the 5 specialized research agents and how they work
- **[Architecture Overview](./architecture.md)** - System architecture, data flow, and design patterns
- **[Integration Guide](./integration-guide.md)** - How agents use MCP tools, workflows, and best practices

### Quick Start

**For MCP Tool Usage:**
- See [MCP Tools Reference](./mcp-tools-reference.md) for complete tool documentation
- See [Tool Categories](#tool-categories) below for finding the right tool

**For Agent Usage:**
- See [Frontend Agents](./frontend-agents.md) for agent capabilities
- See [Integration Guide](./integration-guide.md) for agent workflows

## Tool Categories

The 17 MCP tools are organized into 6 functional categories:

### 1. Search & Discovery
- `search_research_products` - Comprehensive search across 600M+ products
- `get_research_product_details` - Detailed metadata for specific products
- `search_datasets` - Specialized dataset discovery
- `search_organizations` - Find research institutions
- `search_projects` - Discover funded projects
- `search_data_sources` - Find repositories and journals

### 2. Citation Analysis
- `find_by_influence_class` - Long-term impact (seminal works)
- `find_by_popularity_class` - Current attention (trending papers)
- `find_by_impulse_class` - Early momentum (breakthrough papers)
- `find_by_citation_count_class` - Raw citation volume

### 3. Network Analysis
- `get_citation_network` - Build citation graphs
- `analyze_coauthorship_network` - Build collaboration networks
- `build_subgraph_from_dois` - Create networks from specific paper sets

### 4. Author & Project Intelligence
- `get_author_profile` - Comprehensive author profiles
- `get_project_outputs` - Project deliverables and outputs

### 5. Semantic Relationships
- `explore_research_relationships` - Discover 19 types of semantic links (supplements, versions, datasets, etc.)

### 6. Trends & Temporal Analysis
- `analyze_research_trends` - Track research evolution over time

## The Five Agents

The frontend implements 5 specialized agents that work together:

1. **Data Discovery Agent** - Finds research entities (papers, datasets, projects)
2. **Citation Impact Agent** - Identifies highly cited and influential research
3. **Network Analysis Agent** - Builds citation and collaboration networks
4. **Trends Analysis Agent** - Analyzes temporal patterns and emerging topics
5. **Visualization Agent** - Creates interactive charts and network graphs

See [Frontend Agents](./frontend-agents.md) for detailed information about each agent.

## Key Capabilities

### Data Scale
- 600M+ research products (publications, datasets, software)
- 2.25B+ citation relationships
- Coverage: Global research output with comprehensive metadata

### Advanced Metrics
- **Influence Class** - Long-term sustained impact
- **Popularity Class** - Current attention and trending
- **Impulse Class** - Initial momentum after publication
- **Citation Count Class** - Raw citation volume

Each metric uses 5 classes: C1 (top 0.01%), C2 (top 0.1%), C3 (top 1%), C4 (top 10%), C5 (average)

### Rich Metadata
- Full author lists with ORCID identifiers
- Complete funding information (projects, funders, grant codes)
- Abstracts and full bibliographic data
- SDG (Sustainable Development Goals) classifications
- FOS (Field of Science) classifications
- Open access status and publisher information

### Network Analysis
- Citation networks (who cites whom)
- Co-authorship networks (collaboration patterns)
- Semantic relationships (supplements, versions, datasets)
- Multi-level networks (depth 1-2)
- Large-scale network support (1000+ nodes)

### Temporal Analysis
- Year-by-year publication trends
- Growth rate calculations
- Inflection point detection
- Topic evolution tracking

## Design Patterns

### DOI-First Architecture
The system prioritizes DOIs (Digital Object Identifiers) over OpenAIRE internal IDs for reliable cross-tool communication. This ensures that:
- Network analysis tools can reliably find papers
- Agents can hand off results to other agents
- 404 errors are minimized

### Detail Level Management
Three detail levels optimize response size and content:
- `minimal` - 50+ results (~80 bytes/paper, includes metrics)
- `standard` - 20-50 results (~200 bytes/paper, includes authors)
- `full` - <20 results (~482 bytes/paper, includes abstracts)

### Multi-Agent Orchestration
Complex queries are decomposed into specialized sub-tasks:
- **Parallel execution** - Multiple agents run simultaneously
- **Sequential dependencies** - Results flow from one agent to the next
- **Per-result parallelization** - One agent per item for batch processing
- **Reactive spawning** - Follow-up agents launch as predecessors complete

### File-Based Processing
Large datasets (500+ nodes) are processed using file-based workflows:
1. Save individual results to temporary files
2. Merge using Bash + jq
3. Load merged results for visualization
4. Prevents streaming timeouts

## Getting Started

### For MCP Tool Developers
1. Read [MCP Tools Reference](./mcp-tools-reference.md) for complete API documentation
2. Review [Architecture Overview](./architecture.md) for system design
3. Check [Integration Guide](./integration-guide.md) for usage patterns

### For Agent Developers
1. Read [Frontend Agents](./frontend-agents.md) for agent capabilities
2. Review [Integration Guide](./integration-guide.md) for agent-tool workflows
3. Check [Architecture Overview](./architecture.md) for orchestration patterns

### For Users
1. Understand the [Five Agents](#the-five-agents) and their specializations
2. Review [Tool Categories](#tool-categories) to understand available capabilities
3. See [Integration Guide](./integration-guide.md) for example queries and workflows

## Technical Stack

### MCP Server
- **Framework:** Model Context Protocol SDK v0.6.0
- **Language:** TypeScript
- **Validation:** Zod for input validation
- **Transport:** stdio (compatible with Claude Desktop)
- **APIs:** OpenAIRE Graph API V2, ScholeXplorer API V3

### Frontend Agents
- **Framework:** Claude Agent SDK
- **Language:** TypeScript
- **Orchestration:** Multi-agent task decomposition and parallel execution
- **UI:** React + Tailwind CSS
- **Visualization:** Separate MCP server (`viz-tools`) for charts and networks

## Related Documentation

- [OpenAIRE Graph API Documentation](https://graph.openaire.eu/docs/apis/api-documentation)
- [ScholeXplorer API Documentation](https://scholexplorer.openaire.eu/documentation)
- [Model Context Protocol Specification](https://modelcontextprotocol.io/)
- [Claude Agent SDK Documentation](https://github.com/anthropics/claude-agent-sdk)

## License

This project is part of the OpenAIRE MCP integration and follows the OpenAIRE licensing terms.
