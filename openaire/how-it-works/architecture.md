# Architecture Overview

This document provides a comprehensive overview of the OpenAIRE Research Intelligence System architecture, including component design, data flow, and key design patterns.

**Table of Contents:**
- [System Architecture](#system-architecture)
- [Component Architecture](#component-architecture)
- [Data Flow](#data-flow)
- [Design Patterns](#design-patterns)
- [Technology Stack](#technology-stack)
- [Scalability & Performance](#scalability--performance)

---

## System Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         Frontend UI                          │
│  (React + TypeScript + Tailwind CSS + Next.js)              │
└────────────────────────┬────────────────────────────────────┘
                         │
                         │ User Query
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                    Orchestrator Agent                        │
│  • Query analysis & decomposition                           │
│  • Agent selection & coordination                           │
│  • Result synthesis                                         │
└────────┬────────────────────────────────────────────────────┘
         │
         │ Task Delegation
         ▼
┌─────────────────────────────────────────────────────────────┐
│              5 Specialized Research Agents                   │
│  ┌──────────────────┬──────────────────┬─────────────────┐  │
│  │ Data Discovery   │ Citation Impact  │ Network Analysis│  │
│  └──────────────────┴──────────────────┴─────────────────┘  │
│  ┌──────────────────┬──────────────────────────────────┐    │
│  │ Trends Analysis  │ Visualization                    │    │
│  └──────────────────┴──────────────────────────────────┘    │
└────────┬────────────────────────────────────────────────────┘
         │
         │ MCP Tool Calls
         ▼
┌─────────────────────────────────────────────────────────────┐
│                   MCP Server (stdio)                         │
│  • 17 research intelligence tools                           │
│  • Input validation (Zod)                                   │
│  • Caching layer                                            │
│  • Request routing                                          │
└────────┬────────────────────────────────────────────────────┘
         │
         │ API Requests
         ▼
┌─────────────────────────────────────────────────────────────┐
│              External APIs                                   │
│  ┌──────────────────┬──────────────────┐                    │
│  │ OpenAIRE Graph   │ ScholeXplorer    │                    │
│  │ API V2           │ API V3           │                    │
│  │ (600M+ products) │ (19 rel. types)  │                    │
│  └──────────────────┴──────────────────┘                    │
└─────────────────────────────────────────────────────────────┘
```

### Communication Flow

1. **User → Frontend UI**: User submits research query
2. **Frontend → Orchestrator**: Query passed to orchestrator agent
3. **Orchestrator → Specialized Agents**: Task delegation (parallel/sequential)
4. **Agents → MCP Server**: MCP tool calls via stdio transport
5. **MCP Server → External APIs**: HTTP requests to OpenAIRE/ScholeXplorer
6. **Agents → Orchestrator**: Results returned
7. **Orchestrator → Frontend**: Synthesized insights
8. **Frontend → User**: Formatted results with visualizations

---

## Component Architecture

### 1. Frontend Layer

**Location:** `packages/frontend/`

**Key Components:**

```
packages/frontend/
├── app/
│   ├── page.tsx                    # Main application page
│   └── layout.tsx                  # Root layout
├── components/
│   ├── research/
│   │   ├── agents/
│   │   │   ├── AgentActivityPanel.tsx   # Agent status display
│   │   │   └── ToolTimeline.tsx         # Tool call visualization
│   │   ├── SearchBar.tsx           # Query input
│   │   └── ResultsDisplay.tsx      # Results rendering
│   └── ui/                         # Shared UI components
├── lib/
│   ├── research-agents/
│   │   ├── orchestrator.ts         # Main coordinator
│   │   ├── data-discovery.ts       # Discovery agent
│   │   ├── citation-impact.ts      # Impact analysis agent
│   │   ├── network-analysis.ts     # Network building agent
│   │   ├── trends-analysis.ts      # Temporal analysis agent
│   │   └── visualization.ts        # Visualization agent
│   └── job-store.ts                # Progress tracking
└── package.json
```

**Responsibilities:**
- User interface and interaction
- Query input and validation
- Agent orchestration
- Progress tracking and display
- Result rendering and visualization

### 2. MCP Server Layer

**Location:** `packages/mcp/`

**Key Components:**

```
packages/mcp/
├── src/
│   ├── index.ts                    # Main server entry
│   ├── api/
│   │   ├── openaire-client.ts      # OpenAIRE API client
│   │   ├── scholex-client.ts       # ScholeXplorer client
│   │   └── http-client.ts          # HTTP utilities
│   ├── tools/
│   │   ├── index.ts                # Tool registration
│   │   ├── search.ts               # Search tools
│   │   ├── details.ts              # Detail retrieval
│   │   ├── citations.ts            # Citation networks
│   │   ├── organizations.ts        # Organization search
│   │   ├── projects.ts             # Project search
│   │   ├── authors.ts              # Author profiles
│   │   ├── datasets.ts             # Dataset search
│   │   ├── highly-cited.ts         # Citation classes
│   │   ├── relationships.ts        # Semantic relationships
│   │   ├── datasources.ts          # Repository search
│   │   ├── trends.ts               # Temporal analysis
│   │   └── subgraph.ts             # DOI subgraphs
│   ├── types/
│   │   └── index.ts                # Type definitions
│   └── utils/
│       ├── logger.ts               # Logging
│       ├── cache.ts                # Caching
│       ├── validators.ts           # Validation schemas
│       ├── sanitize.ts             # JSON sanitization
│       └── graph-builder.ts        # Graph algorithms
└── package.json
```

**Responsibilities:**
- Expose 17 research intelligence tools via MCP protocol
- Validate inputs using Zod schemas
- Route requests to appropriate API endpoints
- Cache responses for performance
- Transform API responses to consistent formats
- Handle errors and retries

### 3. API Client Layer

**OpenAIRE Client** (`packages/mcp/src/api/openaire-client.ts`):
```typescript
class OpenAIREClient {
  private baseURL = 'https://api.openaire.eu/search/';

  async searchResearchProducts(params): Promise<SearchResponse> {
    // Build query string from 50+ parameters
    // Handle pagination (basic + cursor-based)
    // Transform response to consistent format
  }

  async getProductDetails(id: string): Promise<Product> {
    // Fetch complete metadata
    // Extract DOI, authors, funding, metrics
  }

  async searchOrganizations(params): Promise<Organization[]> {
    // Search institutions by name, country, PID
  }

  async searchProjects(params): Promise<Project[]> {
    // Find funded projects by funder, code, dates
  }

  // ... other methods
}
```

**ScholeXplorer Client** (`packages/mcp/src/api/scholex-client.ts`):
```typescript
class ScholeXplorerClient {
  private baseURL = 'https://api.openaire.eu/scholexplorer/v3/';

  async getRelationships(doi: string, params): Promise<Relationship[]> {
    // Fetch semantic relationships
    // Support 19 relationship types
    // Filter by target type
  }
}
```

### 4. Utility Layer

**Caching** (`packages/mcp/src/utils/cache.ts`):
```typescript
class Cache {
  private store = new Map<string, CachedValue>();
  private ttl = 15 * 60 * 1000; // 15 minutes

  get(key: string): any | null {
    const cached = this.store.get(key);
    if (!cached || Date.now() > cached.expiry) {
      this.store.delete(key);
      return null;
    }
    return cached.value;
  }

  set(key: string, value: any): void {
    this.store.set(key, {
      value,
      expiry: Date.now() + this.ttl
    });
  }
}
```

**Validation** (`packages/mcp/src/utils/validators.ts`):
```typescript
const SearchProductsSchema = z.object({
  query: z.string().optional(),
  type: z.array(z.enum(['publication', 'dataset', 'software', 'other'])).optional(),
  authorFullName: z.array(z.string()).optional(),
  fromPublicationDate: z.string().optional(),
  // ... 50+ parameters
  page: z.number().min(1).optional(),
  pageSize: z.number().min(1).max(100).optional(),
  detail: z.enum(['minimal', 'standard', 'full']).optional()
});
```

**Graph Builder** (`packages/mcp/src/utils/graph-builder.ts`):
```typescript
class GraphBuilder {
  buildCitationNetwork(
    centerPaper: Paper,
    citations: Paper[],
    references: Paper[],
    depth: number
  ): Network {
    // Create nodes from papers
    // Create edges from citation relationships
    // Assign levels based on depth
    // Calculate statistics
    return { nodes, edges, statistics };
  }

  mergeNetworks(networks: Network[]): Network {
    // Combine nodes (deduplicate by ID)
    // Combine edges (deduplicate by source+target)
    // Recalculate statistics
    return mergedNetwork;
  }
}
```

---

## Data Flow

### 1. Search Query Flow

```
User Query: "Find influential papers in machine learning"
                         │
                         ▼
┌────────────────────────────────────────────────────┐
│ Orchestrator Analysis                              │
│ • Intent: Find influential papers                  │
│ • Agent: citation-impact                           │
│ • Pattern: Simple (1 agent)                        │
└───────────────────┬────────────────────────────────┘
                    │
                    ▼
┌────────────────────────────────────────────────────┐
│ Citation Impact Agent                              │
│ • Map "influential" → Influence Class C1           │
│ • Tool: find_by_influence_class                    │
│ • Parameters: {                                    │
│     citationClass: "C1",                           │
│     search: "machine learning",                    │
│     detail: "standard",                            │
│     pageSize: 50                                   │
│   }                                                │
└───────────────────┬────────────────────────────────┘
                    │
                    ▼
┌────────────────────────────────────────────────────┐
│ MCP Server: find_by_influence_class                │
│ • Validate input (Zod schema)                      │
│ • Check cache (key: "influence_C1_ml")             │
│ • Build API request                                │
└───────────────────┬────────────────────────────────┘
                    │
                    ▼
┌────────────────────────────────────────────────────┐
│ OpenAIRE API Request                               │
│ GET /search/publications?                          │
│   query=machine learning&                          │
│   influenceClass=C1&                               │
│   sortBy=influence DESC&                           │
│   pageSize=50&                                     │
│   format=json                                      │
└───────────────────┬────────────────────────────────┘
                    │
                    ▼
┌────────────────────────────────────────────────────┐
│ Response Processing                                │
│ • Parse JSON response                              │
│ • Extract papers with metadata                     │
│ • Transform to standard format                     │
│ • Cache result (15 min TTL)                        │
└───────────────────┬────────────────────────────────┘
                    │
                    ▼
┌────────────────────────────────────────────────────┐
│ Agent Result Formatting                            │
│ • Format papers list                               │
│ • Extract DOIs                                     │
│ • Prepare for handoff                              │
└───────────────────┬────────────────────────────────┘
                    │
                    ▼
┌────────────────────────────────────────────────────┐
│ Orchestrator Synthesis                             │
│ • Receive agent result                             │
│ • No follow-up agents needed                       │
│ • Format final response                            │
└───────────────────┬────────────────────────────────┘
                    │
                    ▼
┌────────────────────────────────────────────────────┐
│ Frontend Display                                   │
│ • Render paper list                                │
│ • Show metrics (influence, citations)              │
│ • Display DOI links                                │
└────────────────────────────────────────────────────┘
```

### 2. Complex Multi-Agent Flow

```
User Query: "Find top 3 papers in biology and build their citation networks"
                         │
                         ▼
┌────────────────────────────────────────────────────┐
│ Orchestrator Analysis                              │
│ • Intent: Find + Network                           │
│ • Agents: citation-impact → network-analysis (×3)  │
│ • Pattern: Sequential + Per-result parallelization │
└───────────────────┬────────────────────────────────┘
                    │
                    ▼
┌────────────────────────────────────────────────────┐
│ Phase 1: Citation Impact Agent                     │
│ • Tool: find_by_influence_class                    │
│ • Get top 3 papers                                 │
│ • Extract DOIs: [DOI1, DOI2, DOI3]                │
└───────────────────┬────────────────────────────────┘
                    │
                    ▼
┌────────────────────────────────────────────────────┐
│ Phase 2: Orchestrator Spawns 3 Network Agents     │
│                                                    │
│  ┌──────────────┐ ┌──────────────┐ ┌────────────┐│
│  │ Network      │ │ Network      │ │ Network    ││
│  │ Agent #1     │ │ Agent #2     │ │ Agent #3   ││
│  │ (DOI1)       │ │ (DOI2)       │ │ (DOI3)     ││
│  └──────┬───────┘ └──────┬───────┘ └──────┬─────┘│
│         │                │                │       │
│         │ PARALLEL EXECUTION              │       │
│         │                │                │       │
└─────────┼────────────────┼────────────────┼───────┘
          │                │                │
          ▼                ▼                ▼
  ┌───────────────┐┌───────────────┐┌───────────────┐
  │ MCP: get_     ││ MCP: get_     ││ MCP: get_     │
  │ citation_     ││ citation_     ││ citation_     │
  │ network       ││ network       ││ network       │
  │ (DOI1)        ││ (DOI2)        ││ (DOI3)        │
  └───────┬───────┘└───────┬───────┘└───────┬───────┘
          │                │                │
          ▼                ▼                ▼
  ┌───────────────┐┌───────────────┐┌───────────────┐
  │ Network 1     ││ Network 2     ││ Network 3     │
  │ Completes     ││ Completes     ││ Completes     │
  └───────┬───────┘└───────┬───────┘└───────┬───────┘
          │                │                │
          │ REACTIVE SPAWNING               │
          │                │                │
          ▼                ▼                ▼
  ┌───────────────┐┌───────────────┐┌───────────────┐
  │ Viz Agent #1  ││ Viz Agent #2  ││ Viz Agent #3  │
  │ (Network 1)   ││ (Network 2)   ││ (Network 3)   │
  └───────┬───────┘└───────┬───────┘└───────┬───────┘
          │                │                │
          └────────────────┼────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────┐
│ Phase 3: Orchestrator Synthesis                    │
│ • All 6 agents complete (3 networks + 3 viz)       │
│ • Combine results                                  │
│ • Generate comprehensive report                    │
└───────────────────┬────────────────────────────────┘
                    │
                    ▼
┌────────────────────────────────────────────────────┐
│ Frontend Display                                   │
│ • Paper 1 + Network + Visualization                │
│ • Paper 2 + Network + Visualization                │
│ • Paper 3 + Network + Visualization                │
└────────────────────────────────────────────────────┘
```

### 3. Identifier Transformation Flow

```
Search Result (OpenAIRE)
  └─ Paper {
       id: "doi_________::4637e...",  // OpenAIRE internal ID
       doi: "10.1038/nature12345",    // DOI
       title: "..."
     }
             │
             ▼
Agent Extracts DOI (not internal ID)
             │
             ▼
DOI Handoff: "10.1038/nature12345"
             │
             ▼
Network Agent Uses DOI
             │
             ▼
MCP Tool: get_citation_network("10.1038/nature12345")
             │
             ▼
✅ Success (DOIs work reliably)

─────────────────────────────────────

❌ Bad Flow (using internal IDs):

Search Result
  └─ Paper { id: "doi_________::4637e..." }
             │
             ▼
Agent Uses Internal ID (wrong)
             │
             ▼
Network Agent: "doi_________::4637e..."
             │
             ▼
MCP Tool: get_citation_network("doi_________::4637e...")
             │
             ▼
❌ 404 Error (internal IDs often fail)
```

---

## Design Patterns

### 1. Multi-Agent Orchestration Pattern

**Pattern:** Decompose complex queries into specialized sub-tasks

**Implementation:**
```typescript
class Orchestrator {
  async handleQuery(query: string): Promise<Result> {
    // Phase 1: Analyze query
    const intent = this.analyzeIntent(query);
    const agents = this.selectAgents(intent);
    const pattern = this.determinePattern(agents);

    // Phase 2: Execute agents
    let results;
    if (pattern === 'parallel') {
      results = await this.runParallel(agents);
    } else if (pattern === 'sequential') {
      results = await this.runSequential(agents);
    } else if (pattern === 'per-result') {
      results = await this.runPerResult(agents);
    }

    // Phase 3: Synthesize
    return this.synthesize(results);
  }

  private runPerResult(agents: Agent[]): Promise<Result[]> {
    // Run first agent
    const items = await agents[0].run();

    // Spawn one agent per item (parallel)
    return Promise.all(
      items.map(item => agents[1].run(item))
    );
  }
}
```

**Benefits:**
- Specialization: Each agent is expert in one domain
- Parallelization: Independent tasks run simultaneously
- Flexibility: Dynamic agent selection based on query
- Scalability: Add new agents without changing orchestrator

### 2. DOI-First Architecture Pattern

**Pattern:** Always use DOIs for cross-agent communication

**Implementation:**
```typescript
// Agent 1: Extract DOIs from results
class DataDiscoveryAgent {
  async search(query: string): Promise<SearchResult> {
    const papers = await this.mcp.searchResearchProducts({ query });

    // Extract DOIs (not internal IDs)
    const dois = papers
      .map(p => p.doi)
      .filter(Boolean);

    return {
      papers,
      dois  // For handoff
    };
  }
}

// Agent 2: Use DOIs from handoff
class NetworkAnalysisAgent {
  async buildNetwork(doi: string): Promise<Network> {
    // Use DOI directly (reliable)
    return this.mcp.getCitationNetwork({ identifier: doi });
  }
}
```

**Benefits:**
- Reliability: DOIs work across all OpenAIRE endpoints
- Interoperability: Standard identifiers for cross-system communication
- Error reduction: Fewer 404 errors from unsupported IDs

### 3. Detail Level Optimization Pattern

**Pattern:** Choose response detail level based on expected result count

**Implementation:**
```typescript
function selectDetailLevel(query: Query): DetailLevel {
  // Estimate result count
  const estimatedCount = estimateResults(query);

  // Choose appropriate detail level
  if (estimatedCount >= 50) {
    return 'minimal';  // ~80 bytes/paper, includes all metrics
  } else if (estimatedCount >= 20) {
    return 'standard'; // ~200 bytes/paper, includes authors
  } else {
    return 'full';     // ~482 bytes/paper, includes abstracts
  }
}
```

**Benefits:**
- Response size management: Prevents truncation
- Performance: Smaller responses for large result sets
- Completeness: Full details when feasible

### 4. File-Based Processing Pattern

**Pattern:** Use files for large datasets to avoid streaming issues

**Implementation:**
```typescript
async function buildLargeNetwork(dois: string[]): Promise<Network> {
  // Fetch individual networks in parallel
  const networks = await Promise.all(
    dois.map(async (doi, i) => {
      const network = await getCitationNetwork(doi);
      await write(`/tmp/network_${i}.json`, network);
      return `/tmp/network_${i}.json`;
    })
  );

  // Merge using Bash + jq (avoids streaming issues)
  await bash(`
    jq -s 'reduce .[] as $net ({"nodes": [], "edges": []};
      .nodes += $net.nodes |
      .edges += $net.edges) |
      .nodes |= unique_by(.id) |
      .edges |= unique_by(.source + .target)'
      /tmp/network_*.json > /tmp/merged.json
  `);

  // Load merged result
  const merged = await read('/tmp/merged.json');
  return JSON.parse(merged);
}
```

**Benefits:**
- Handles large datasets (500+ nodes)
- Prevents streaming timeouts
- Leverages Bash for efficient data processing

### 5. Reactive Spawning Pattern

**Pattern:** Spawn follow-up agents immediately as predecessors complete

**Implementation:**
```typescript
async function processWithReactiveSpawning(dois: string[]) {
  // Start network agents in parallel
  const networkPromises = dois.map(doi =>
    runAgent('network-analysis', { doi })
  );

  // Spawn visualization as EACH network completes
  networkPromises.forEach(async (promise) => {
    const network = await promise;

    // Don't wait for others - visualize immediately
    runAgent('visualization', { network });
  });

  // Continue while visualizations are running
  return { status: 'processing' };
}
```

**Benefits:**
- Maximum parallelism: No waiting for batches
- Reduced latency: Results appear progressively
- Better resource utilization: Agents work continuously

### 6. Fail-Fast Error Handling Pattern

**Pattern:** Detect errors early and intervene with corrections

**Implementation:**
```typescript
class NetworkAnalysisAgent {
  async buildNetwork(identifier: string, attempt = 1): Promise<Network> {
    try {
      return await this.mcp.getCitationNetwork({ identifier });
    } catch (error) {
      if (error.status === 404 && attempt === 1) {
        // Fail fast - don't retry with same identifier
        throw new Error(
          `Network not found for ${identifier}. ` +
          `If this is an OpenAIRE internal ID, try using DOI instead.`
        );
      }
      throw error;
    }
  }
}

// Orchestrator intervenes
class Orchestrator {
  async handleNetworkError(agent: Agent, error: Error) {
    if (error.message.includes('try using DOI')) {
      // Extract DOI from previous response
      const doi = this.extractDOI(agent.previousResponse);

      // Retry with DOI
      return agent.retry({ identifier: doi });
    }
  }
}
```

**Benefits:**
- Prevents infinite loops
- Provides actionable error messages
- Enables intelligent orchestrator intervention

### 7. Inline Results Pattern

**Pattern:** Return results directly in response text (avoid file creation)

**Implementation:**
```typescript
class DataDiscoveryAgent {
  async search(query: string): Promise<string> {
    const papers = await this.mcp.searchResearchProducts({ query });

    // ✅ Good: Return inline
    return this.formatPapers(papers);

    // ❌ Bad: Create file unnecessarily
    // await write('/tmp/results.json', papers);
    // return "Results saved to /tmp/results.json";
  }

  private formatPapers(papers: Paper[]): string {
    return papers.map((p, i) =>
      `${i+1}. **${p.title}** (${p.year})\n` +
      `   DOI: ${p.doi} | Citations: ${p.citations}`
    ).join('\n');
  }
}
```

**Benefits:**
- Cleaner filesystem
- Faster for simple queries
- Better user experience (immediate results)

---

## Technology Stack

### Backend (MCP Server)

| Component | Technology | Version |
|-----------|------------|---------|
| Runtime | Node.js | 18+ |
| Language | TypeScript | 5.x |
| Framework | MCP SDK | 0.6.0 |
| Validation | Zod | 3.22.4 |
| Date Handling | date-fns | 3.0.0 |
| HTTP Client | node-fetch | Built-in |
| Transport | stdio | MCP native |

### Frontend (Multi-Agent System)

| Component | Technology | Version |
|-----------|------------|---------|
| Framework | Next.js | 14+ |
| Language | TypeScript | 5.x |
| UI Library | React | 18+ |
| Styling | Tailwind CSS | 3.x |
| Agent SDK | Claude Agent SDK | Latest |
| State Management | Job Store (custom) | - |

### External APIs

| API | Purpose | Base URL |
|-----|---------|----------|
| OpenAIRE Graph API V2 | Research products, organizations, projects | https://api.openaire.eu/search/ |
| ScholeXplorer API V3 | Semantic relationships | https://api.openaire.eu/scholexplorer/v3/ |

### Development Tools

| Tool | Purpose |
|------|---------|
| TypeScript Compiler | Type checking and compilation |
| ESLint | Code linting |
| Prettier | Code formatting |
| Jest | Unit testing |
| Vitest | Integration testing |

---

## Scalability & Performance

### Caching Strategy

**Cache Layer:** 15-minute TTL for API responses

```typescript
// Cache key structure
const cacheKey = `${toolName}_${hash(params)}`;

// Example cache keys
"search_research_products_abc123"
"find_by_influence_class_def456"
"get_citation_network_10.1038/nature12345"
```

**Cache Benefits:**
- Reduces API calls for repeated queries
- Improves response time (cache hit: <10ms vs API: 500-2000ms)
- Reduces load on OpenAIRE infrastructure

### Parallel Execution

**Agent Parallelization:**
- Independent agents run simultaneously
- Per-result parallelization: One agent per item
- Reactive spawning: Follow-up agents launch immediately

**Example Performance:**
```
Sequential Execution (3 papers):
Network 1: 2.3s
Network 2: 2.1s
Network 3: 2.4s
Total: 6.8s

Parallel Execution (3 papers):
Network 1, 2, 3: 2.4s (slowest)
Total: 2.4s

Speedup: 2.8x
```

### Response Size Optimization

**Detail Levels:**

| Level | Bytes/Paper | Use Case | Capacity |
|-------|-------------|----------|----------|
| minimal | ~80 | 50+ papers | 625 papers in 50KB |
| standard | ~200 | 20-50 papers | 250 papers in 50KB |
| full | ~482 | <20 papers | 103 papers in 50KB |

**Pagination:**
- Basic pagination: Up to 10K records (page-based)
- Cursor-based pagination: Unlimited records (for large datasets)

### File-Based Processing

**Threshold:** 500+ nodes in network

**Performance:**
```
Streaming Approach (large network):
- Often times out
- Unreliable for >500 nodes

File-Based Approach (large network):
- Network 1: 2.1s → Save: 0.2s
- Network 2: 2.3s → Save: 0.2s
- Network 3: 2.2s → Save: 0.2s
- Merge (jq): 0.4s
- Load: 0.3s
Total: 2.9s (reliable)
```

### API Rate Limiting

**OpenAIRE Rate Limits:**
- No strict limits documented
- Recommended: <10 requests/second
- Best practice: Use caching and batch requests

**Implementation:**
```typescript
class RateLimiter {
  private queue: Request[] = [];
  private processing = false;
  private requestsPerSecond = 10;

  async enqueue(request: Request): Promise<Response> {
    this.queue.push(request);
    return this.process();
  }

  private async process() {
    if (this.processing) return;
    this.processing = true;

    while (this.queue.length > 0) {
      const batch = this.queue.splice(0, this.requestsPerSecond);
      await Promise.all(batch.map(r => this.execute(r)));
      await sleep(1000);
    }

    this.processing = false;
  }
}
```

### Scalability Considerations

**Current Scale:**
- Supports 5 concurrent agent types
- Each agent type can have multiple instances
- Typical: 1-10 agent instances per query
- Large queries: Up to 50 parallel agent instances

**Future Scale:**
- Add more specialized agents (e.g., funding-analysis, geo-analysis)
- Horizontal scaling: Multiple orchestrator instances
- Distributed agent execution
- Long-running agent sessions with checkpointing

---

[← Frontend Agents](./frontend-agents.md) | [Back to Main](./README.md) | [Integration Guide →](./integration-guide.md)
