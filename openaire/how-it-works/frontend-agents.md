# Frontend Agents - Multi-Agent Research Intelligence

The OpenAIRE frontend implements a sophisticated multi-agent system with 5 specialized agents that work together to answer complex research queries.

**Table of Contents:**
- [System Architecture](#system-architecture)
- [The Five Agents](#the-five-agents)
  - [Data Discovery Agent](#1-data-discovery-agent)
  - [Citation Impact Agent](#2-citation-impact-agent)
  - [Network Analysis Agent](#3-network-analysis-agent)
  - [Trends Analysis Agent](#4-trends-analysis-agent)
  - [Visualization Agent](#5-visualization-agent)
- [Orchestrator](#orchestrator)
- [Job Store & Progress Tracking](#job-store--progress-tracking)

---

## System Architecture

The frontend uses a **multi-agent orchestration pattern** where:

1. **Orchestrator** - Receives user query, decomposes it, coordinates sub-agents
2. **5 Specialized Agents** - Each expert in a specific domain, uses MCP tools
3. **Job Store** - Tracks all agent instances and their progress
4. **UI Components** - Display real-time agent activity and results

**Key Features:**
- **Parallel execution** - Multiple agents run simultaneously
- **Reactive spawning** - New agents launch as others complete
- **Per-result parallelization** - One agent per item for batch processing
- **DOI-first architecture** - Reliable identifier passing between agents
- **File-based processing** - Handles large datasets without streaming issues

---

## The Five Agents

### 1. Data Discovery Agent

**File:** [packages/frontend/lib/research-agents/data-discovery.ts](../packages/frontend/lib/research-agents/data-discovery.ts)

**Mission:** Find research entities across the OpenAIRE graph (600M+ products)

#### Capabilities

- Search publications, datasets, and software
- Find research organizations and institutions
- Discover funded projects
- Get author publication histories
- Search repositories and data sources
- Retrieve project outputs

#### MCP Tools Used

| Tool | Purpose |
|------|---------|
| `search_research_products` | Primary search for all research products |
| `get_research_product_details` | Detailed info on specific products |
| `search_datasets` | Specialized dataset search |
| `search_organizations` | Find research institutions |
| `search_projects` | Discover funded projects |
| `get_author_profile` | Get author publication history |
| `search_data_sources` | Find repositories |
| `get_project_outputs` | Get project deliverables |

#### Prompting Strategy

**System Prompt Key Elements:**
```
You are an expert at finding research publications, datasets, software,
organizations, projects, and authors using the OpenAIRE Graph API.

IMPORTANT RULES:
1. Target 30-100 research products for comprehensive queries
2. Use detail levels strategically:
   - minimal: 50+ results (~80 bytes/paper)
   - standard: 20-50 results (~200 bytes/paper)
   - full: <20 results (~482 bytes/paper)
3. ALWAYS extract DOIs for handoff to other agents (not OpenAIRE IDs)
4. Return results inline without creating files unless requested
```

**Search Logic:**
- Start with focused queries using specific parameters
- Apply filters strategically (date, type, access)
- Avoid multiple searches when one targeted search works
- Balance breadth vs depth based on query complexity

**Result Handling:**
- Always include DOIs in results (critical for network analysis)
- Provide 3-5 key papers with full context (title, authors, year, DOI)
- For large result sets, prioritize by relevance or citation count
- Inline results by default (no file creation unless requested)

#### Example Workflows

**Simple Discovery:**
```
User: "Find recent papers on quantum computing"

Agent Actions:
1. search_research_products(
     query="quantum computing",
     fromPublicationDate="2023",
     sortBy="publicationDate DESC",
     pageSize=50,
     detail="standard"
   )
2. Extract top 5-10 papers with DOIs
3. Return inline summary
```

**Complex Discovery:**
```
User: "Find H2020 funded datasets about climate change"

Agent Actions:
1. search_projects(
     search="climate change",
     fundingStreamId="H2020"
   ) → Get project IDs
2. search_datasets(
     search="climate change",
     relProjectId="<project_ids>",
     openAccessOnly=true
   )
3. Return datasets with project context
```

#### Output Format

```markdown
Found 47 publications on quantum computing (2023-2025):

**Top Papers:**

1. **Title:** Quantum Error Correction Breakthrough
   - **Authors:** Smith J., et al.
   - **Year:** 2024
   - **DOI:** 10.1038/nature12345
   - **Citations:** 156 | Influence: C2 | Open Access

2. **Title:** Scalable Quantum Algorithms
   - **Authors:** Johnson M., et al.
   - **Year:** 2023
   - **DOI:** 10.1126/science.abc123
   - **Citations:** 234 | Influence: C1 | Open Access

[DOI list for further analysis: 10.1038/nature12345, 10.1126/science.abc123, ...]
```

---

### 2. Citation Impact Agent

**File:** [packages/frontend/lib/research-agents/citation-impact.ts](../packages/frontend/lib/research-agents/citation-impact.ts)

**Mission:** Identify highly cited and influential research using citation-based indicators

#### Capabilities

- Find papers by influence class (long-term impact)
- Find papers by popularity class (current attention)
- Find papers by impulse class (early momentum)
- Find papers by citation count class (raw volume)
- Understand user language and map to appropriate metrics

#### MCP Tools Used

| Tool | Purpose |
|------|---------|
| `find_by_influence_class` | Long-term impact (seminal works) |
| `find_by_popularity_class` | Current attention (trending papers) |
| `find_by_impulse_class` | Early momentum (breakthrough papers) |
| `find_by_citation_count_class` | Raw citation volume |

#### Citation Metrics Explained

**From system prompt:**
```markdown
1. **Influence Class** (find_by_influence_class)
   - Measures: Long-term, sustained research impact
   - Best for: Finding seminal works, foundational papers
   - Classes: C1 (top 0.01%), C2 (top 0.1%), C3 (top 1%), C4 (top 10%), C5 (average)
   - Use when: "Find most influential papers", "seminal works", "foundational research"

2. **Popularity Class** (find_by_popularity_class)
   - Measures: Current attention and recent impact
   - Best for: Trending papers, hot topics, current research focus
   - Classes: Same as above
   - Use when: "What's trending?", "recent hot papers", "current research"

3. **Impulse Class** (find_by_impulse_class)
   - Measures: Initial momentum right after publication
   - Best for: Breakthrough discoveries, rapid early adoption
   - Classes: Same as above
   - Use when: "Breakthrough papers", "rapid adoption", "initial impact"

4. **Citation Count Class** (find_by_citation_count_class)
   - Measures: Raw total citation count
   - Best for: Most cited papers, citation volume
   - Classes: Same as above
   - Use when: "Most cited papers", "citation leaders", "highly cited works"
```

#### Prompting Strategy

**System Prompt Key Elements:**
```
You are an expert at identifying highly cited and influential research.

IMPORTANT RULES:
1. Map user language to citation class:
   - "top", "most cited", "best" → C1
   - "highly cited", "influential" → C2
   - "well-cited", "significant" → C3
   - "above-average" → C4

2. Make ONE focused query (no iteration through classes)

3. For trending topics: Use Popularity/Impulse + recent years (2023-2025)

4. For foundational works: Use Influence + broader date ranges

5. Always include DOIs for network analysis handoffs

6. Use detail level based on result count:
   - 50+: minimal (includes all metrics)
   - 20-50: standard
   - <20: full
```

**Metric Selection Logic:**

| User Request | Metric | Class | Date Range |
|--------------|--------|-------|------------|
| "Most influential papers in ML" | Influence | C1 | 2000-2025 |
| "Trending AI research" | Popularity | C1-C2 | 2023-2025 |
| "Breakthrough papers in CRISPR" | Impulse | C1-C2 | 2015-2025 |
| "Most cited papers in physics" | Citation Count | C1 | No filter |

#### Example Workflows

**Finding Influential Papers:**
```
User: "Find the most influential papers in deep learning"

Agent Actions:
1. Interpret: "most influential" → Influence class, C1
2. find_by_influence_class(
     citationClass="C1",
     search="deep learning",
     detail="standard",
     pageSize=50
   )
3. Return top 10-15 with DOIs
```

**Finding Trending Papers:**
```
User: "What are the hot papers in immunology right now?"

Agent Actions:
1. Interpret: "hot papers", "right now" → Popularity class, C1-C2, recent
2. find_by_popularity_class(
     citationClass="C1",
     search="immunology",
     fromPublicationDate="2023",
     detail="standard",
     pageSize=50
   )
3. Return top 10 trending papers
```

#### Output Format

```markdown
Found 28 highly influential papers in deep learning (Influence Class C1 - top 0.01%):

**Top Influential Papers:**

1. **Attention Is All You Need**
   - **Authors:** Vaswani A., et al.
   - **Year:** 2017
   - **DOI:** 10.5555/nips17.123
   - **Citations:** 45,234
   - **Impact:** Influence C1, Popularity C1, Impulse C1
   - **Open Access:** Yes

2. **BERT: Pre-training of Deep Bidirectional Transformers**
   - **Authors:** Devlin J., et al.
   - **Year:** 2019
   - **DOI:** 10.18653/v1/N19-1423
   - **Citations:** 38,156
   - **Impact:** Influence C1, Popularity C1, Impulse C1
   - **Open Access:** Yes

[DOIs for network analysis: 10.5555/nips17.123, 10.18653/v1/N19-1423, ...]
```

---

### 3. Network Analysis Agent

**File:** [packages/frontend/lib/research-agents/network-analysis.ts](../packages/frontend/lib/research-agents/network-analysis.ts)

**Mission:** Build and analyze relationship networks - citations, collaborations, semantic connections

#### Capabilities

- Build citation networks (who cites whom)
- Analyze co-authorship networks (collaboration patterns)
- Explore semantic relationships (supplements, versions, datasets)
- Create subgraphs from specific paper collections
- Handle large networks with file-based processing

#### MCP Tools Used

| Tool | Purpose |
|------|---------|
| `get_citation_network` | Build citation graphs (depth 1-2) |
| `analyze_coauthorship_network` | Build collaboration networks |
| `explore_research_relationships` | Find semantic relationships (19 types) |
| `build_subgraph_from_dois` | Create graphs from specific DOI sets |
| `get_research_product_details` | Get details on network nodes |

#### Prompting Strategy

**System Prompt Key Elements:**
```
You are an expert at building and analyzing research networks.

CRITICAL - Identifier Handling:
1. PREFER DOIs (e.g., "10.1038/nature12345") - work reliably
2. AVOID OpenAIRE internal IDs (like "doi_________::4637...") - many endpoints don't support
3. If receiving OpenAIRE IDs, extract DOIs from response text
4. NEVER loop on 404 errors - fail fast and report issue

Citation Networks:
- depth=1: Direct citations (50-200 nodes)
- depth=2: Multi-level network (200-1000+ nodes)
- Use for "complete network", "global graph"

Co-authorship Networks:
- depth=1: Direct collaborators
- depth=2: Extended research communities
- Use minCollaborations to filter noise

File-Based Network Merging (for large datasets):
1. Fetch individual networks
2. Save each to /tmp/network_N.json
3. Merge with Bash + jq
4. Load merged result
5. Prevents streaming timeout issues
```

**Network Type Selection:**

| User Request | Tool | Parameters |
|--------------|------|------------|
| "Citation network for paper X" | `get_citation_network` | depth=1, direction=both |
| "Who cites this paper?" | `get_citation_network` | depth=1, direction=citations |
| "What papers does this cite?" | `get_citation_network` | depth=1, direction=references |
| "Complete citation network" | `get_citation_network` | depth=2, maxNodes=1000 |
| "Author collaborators" | `analyze_coauthorship_network` | maxDepth=1, minCollaborations=2 |
| "Research community" | `analyze_coauthorship_network` | maxDepth=2, minCollaborations=1 |
| "Datasets for paper" | `explore_research_relationships` | relationType=IsSupplementTo, targetType=dataset |
| "Paper collection network" | `build_subgraph_from_dois` | dois=[...] |

#### Example Workflows

**Simple Citation Network:**
```
User: "Build citation network for DOI 10.1038/nature12345"

Agent Actions:
1. get_citation_network(
     identifier="10.1038/nature12345",
     depth=1,
     direction="both",
     maxNodes=200
   )
2. Save network to file if >500 nodes
3. Return network structure + statistics
```

**Large Multi-Paper Network:**
```
User: "Build networks for these 3 papers: [DOI1, DOI2, DOI3]"

Agent Actions:
1. For each DOI in parallel:
   get_citation_network(identifier=DOI, depth=1)
   → Save to /tmp/network_1.json, /tmp/network_2.json, /tmp/network_3.json

2. Merge networks with Bash:
   jq -s 'reduce .[] as $net ({"nodes": [], "edges": []};
     .nodes += $net.network.nodes |
     .edges += $net.network.edges) |
     .nodes |= unique_by(.id) |
     .edges |= unique_by(.source + .target)'
     /tmp/network_*.json > /tmp/merged.json

3. Load merged network with Read
4. Return merged network
```

**Collaboration Network:**
```
User: "Show me collaboration network for ORCID 0000-0001-2345-6789"

Agent Actions:
1. analyze_coauthorship_network(
     orcid="0000-0001-2345-6789",
     maxDepth=1,
     minCollaborations=2,
     limit=100
   )
2. Return network with collaboration counts
```

#### Output Format

```markdown
Built citation network for "Attention Is All You Need" (DOI: 10.5555/nips17.123)

**Network Statistics:**
- Total nodes: 847 papers
- Total edges: 1,234 citations
- Papers citing this: 823
- Papers cited by this: 23
- Network depth: 1

**Key Citing Papers:**
1. BERT (2019) - DOI: 10.18653/v1/N19-1423
2. GPT-3 (2020) - DOI: 10.48550/arXiv.2005.14165
3. T5 (2020) - DOI: 10.21437/JMLR.v21.123

**Network saved to:** /tmp/citation_network_nature12345.json
[Ready for visualization]
```

---

### 4. Trends Analysis Agent

**File:** [packages/frontend/lib/research-agents/trends-analysis.ts](../packages/frontend/lib/research-agents/trends-analysis.ts)

**Mission:** Analyze temporal patterns in research - topic evolution, growth areas, emerging topics

#### Capabilities

- Track publication counts over time
- Identify growth patterns and inflection points
- Discover emerging topics
- Compare research output across time periods
- Analyze topic evolution and methodology shifts

#### MCP Tools Used

| Tool | Purpose |
|------|---------|
| `analyze_research_trends` | Year-by-year publication counts |
| `search_research_products` | Temporal comparison with date filters |

#### Prompting Strategy

**System Prompt Key Elements:**
```
You are an expert at analyzing research trends over time.

Analysis Dimensions:
1. Volume Trends - Publication count per year, growth rates, peaks
2. Quality Trends - Citation patterns over time, niche→mainstream shifts
3. Topical Shifts - Terminology evolution, methodology changes
4. Institutional Patterns - Early leaders, geographic spread, funding evolution

Workflow:
1. Use analyze_research_trends for year-by-year counts
2. Use Bash to calculate growth rates, moving averages
3. Identify inflection points and patterns
4. Compare with search_research_products for qualitative analysis
5. Provide insights on growth, emergence, or decline

Topic Evolution Strategy:
- Define clear time windows (e.g., 2015-2018, 2019-2022, 2023-2025)
- Identify inflection points (growth acceleration)
- Compare early pioneers vs current leaders

Emerging Topics Strategy:
- Focus on recent years (2023-2025)
- Look for rapid growth patterns
- Use impulse/popularity metrics
- Identify new terminology and methods

Mature Fields Strategy:
- Analyze longer time spans (2010-2025)
- Identify sustained vs declining topics
- Find consolidation patterns
- Track methodology shifts
```

#### Example Workflows

**Topic Evolution Analysis:**
```
User: "Analyze trends in machine learning from 2010 to 2025"

Agent Actions:
1. analyze_research_trends(
     search="machine learning",
     fromYear=2010,
     toYear=2025
   ) → Get year-by-year data

2. Use Bash to analyze:
   - Calculate year-over-year growth rates
   - Identify peak years
   - Compute moving averages
   - Find inflection points

3. Compare periods:
   - 2010-2015: Early growth
   - 2016-2020: Deep learning boom
   - 2021-2025: Transformer era

4. Return comprehensive analysis with insights
```

**Emerging Topic Detection:**
```
User: "Identify emerging topics in renewable energy (2020-2025)"

Agent Actions:
1. analyze_research_trends(
     search="renewable energy",
     fromYear=2020,
     toYear=2025
   )

2. For each sub-topic (solar, wind, hydrogen):
   analyze_research_trends(
     search="renewable energy + [subtopic]",
     fromYear=2020,
     toYear=2025
   )

3. Calculate growth rates
4. Identify fastest-growing sub-topics
5. Use search_research_products with impulse metrics to find breakthrough papers
6. Return emerging topics with evidence
```

#### Output Format

```markdown
Research Trends Analysis: Machine Learning (2010-2025)

**Overall Growth:**
- Total publications: 1.2M (2010-2025)
- Growth rate: +487% (from 23K in 2010 to 134K in 2025)
- Peak year: 2023 (142K publications)
- Current trend: Stable after peak

**Key Periods:**

1. **Early Growth (2010-2015)**
   - Annual publications: 23K → 67K (+191%)
   - Focus: Traditional ML, SVMs, Random Forests
   - Leading institutions: Stanford, MIT, CMU

2. **Deep Learning Boom (2016-2020)**
   - Annual publications: 73K → 128K (+75%)
   - Inflection point: 2016 (AlexNet impact)
   - Focus: CNNs, RNNs, image recognition
   - New players: DeepMind, OpenAI, FAIR

3. **Transformer Era (2021-2025)**
   - Annual publications: 135K → 134K (stable)
   - Focus: Transformers, LLMs, foundation models
   - Emerging: Multimodal AI, efficient transformers

**Emerging Sub-Topics (2023-2025):**
- Large Language Models: +234% growth
- Efficient AI: +189% growth
- AI Safety: +156% growth

**Declining Topics:**
- Traditional ML algorithms: -23%
- Rule-based systems: -45%
```

---

### 5. Visualization Agent

**File:** [packages/frontend/lib/research-agents/visualization.ts](../packages/frontend/lib/research-agents/visualization.ts)

**Mission:** Transform research data into clear, insightful visualizations

#### Capabilities

- Create interactive citation network charts
- Build timeline charts for trends
- Generate distribution charts (pie/bar)
- Merge multiple networks for large-scale visualization
- Preprocess data for optimal visualization

#### MCP Tools Used

**Note:** The Visualization Agent uses tools from a **separate MCP server** (`viz-tools`), not the OpenAIRE MCP. These tools are specific to data visualization.

| Tool | Purpose |
|------|---------|
| `mcp__viz-tools__create_citation_network_chart` | Interactive network graphs |
| `mcp__viz-tools__create_timeline_chart` | Line charts for trends |
| `mcp__viz-tools__create_distribution_chart` | Pie/bar charts |
| `mcp__viz-tools__merge_citation_networks` | Combine multiple networks |

#### Prompting Strategy

**System Prompt Key Elements:**
```
You are an expert at visualizing research data.

Citation Network Visualization:
- Input: nodes (papers) + edges (citations)
- Structure: {id, title, year, citations, type, level, openAccess}
- Features: Depth levels, node types, citation relationships

Timeline Visualization:
- Input: time series [{year, count}]
- Best for: Publication growth, research evolution
- Use Bash to aggregate data by year before visualizing

Distribution Visualization:
- Input: categories [{segment, value}]
- Chart types: 'pie' or 'bar'
- Best for: Type breakdowns, access distributions, institutional shares

Large Network Merging (4+ networks):
1. Receive individual networks from network-analysis agent
2. Save each to /tmp/network_N.json with Write
3. Merge with Bash + jq (deduplicate nodes/edges)
4. Load merged result with Read
5. Call create_citation_network_chart
6. Prevents streaming timeout issues

Data Preparation with Bash:
- Aggregate counts: jq, sort, uniq -c
- Calculate percentages
- Filter and deduplicate
```

#### Example Workflows

**Citation Network Chart:**
```
User: "Visualize the citation network for these 3 papers"

Agent Actions:
1. Receive networks from network-analysis agent
2. If networks are in files:
   - Read each file
   - Merge nodes and edges
   - Deduplicate by ID
3. create_citation_network_chart(
     nodes=[...],
     edges=[...],
     title="Citation Network: Deep Learning Papers"
   )
4. Return chart URL or embed
```

**Timeline Chart:**
```
User: "Visualize ML publication trends 2010-2025"

Agent Actions:
1. Receive trend data from trends-analysis agent
   [{year: 2010, count: 23000}, ...]

2. create_timeline_chart(
     data=[{year, count}],
     title="Machine Learning Publications (2010-2025)",
     xLabel="Year",
     yLabel="Publications"
   )
3. Return chart
```

**Distribution Chart:**
```
User: "Show distribution of paper types in my search results"

Agent Actions:
1. Receive paper list from data-discovery agent
2. Use Bash to aggregate by type:
   jq -r '.[] | .type' papers.json | sort | uniq -c

3. create_distribution_chart(
     data=[
       {segment: "Article", value: 145},
       {segment: "Conference Paper", value: 87},
       {segment: "Preprint", value: 23}
     ],
     chartType="pie",
     title="Publication Type Distribution"
   )
4. Return chart
```

#### Output Format

```markdown
Created citation network visualization for 3 papers:

**Chart Details:**
- Type: Interactive network graph
- Nodes: 1,247 papers
- Edges: 2,134 citations
- Depth levels: 0 (center), 1 (direct), 2 (extended)

**Interactive Features:**
- Zoom and pan
- Node hover for details
- Color-coded by year
- Size-scaled by citation count

[View Interactive Chart: https://viz.openaire.eu/chart/abc123]
```

---

## Orchestrator

**File:** [packages/frontend/lib/research-agents/orchestrator.ts](../packages/frontend/lib/research-agents/orchestrator.ts)

**Role:** Coordinator and strategist - DOES NOT call MCP tools directly, only delegates to sub-agents

### Orchestration Strategy

#### Phase 1: Query Analysis

The Orchestrator (an LLM agent) analyzes user queries using its system prompt to determine:
- **Intent:** What the user wants to find or understand
- **Complexity:** Simple (1 agent) vs Complex (2-4 agents)
- **Required Agents:** Which specialized agents are needed
- **Execution Pattern:** Parallel, Sequential, or Hybrid

This analysis is done through **natural language understanding**, not hardcoded rules.

**Simple Queries (1 agent):**
- "Find top N most cited papers in [topic]" → citation-impact ONLY
- "Find papers by [author]" → data-discovery ONLY
- "Show citation network for [DOI]" → network-analysis ONLY
- "Analyze trends in [topic] from [year] to [year]" → trends-analysis ONLY

**Complex Queries (2-4 agents):**
- Multi-dimensional analysis (impact + trends + network)
- Comparative studies
- Landscape overviews
- Author collaboration patterns

#### Phase 2: Agent Deployment

**CRITICAL - Identifier Handoffs:**
```typescript
// When deploying sequential agents, explicitly request DOIs
await runAgent('data-discovery', {
  task: "Find recent quantum computing papers",
  instructions: "Include the DOI for each paper in your response"
});

// Extract DOIs from response
const dois = extractDOIs(response);

// Pass DOIs to next agent
await runAgent('network-analysis', {
  task: `Build citation networks for these papers: ${dois.join(', ')}`,
  identifiers: dois
});
```

**Sequential Patterns:**
```typescript
// Pattern 1: Discovery → Analysis
1. data-discovery: Find papers → Extract DOIs
2. citation-impact: Analyze impact of found papers
3. network-analysis: Build networks using DOIs

// Pattern 2: Impact → Network → Visualization
1. citation-impact: Find top 5 papers → Extract DOIs
2. network-analysis: Build networks for 5 DOIs (parallel)
3. visualization: Create 5 charts (reactive spawning)
```

**Parallel Patterns:**
```typescript
// Pattern 1: Independent searches
await Promise.all([
  runAgent('data-discovery', { task: "Find recent papers" }),
  runAgent('citation-impact', { task: "Find influential papers" })
]);

// Pattern 2: Same topic, different dimensions
await Promise.all([
  runAgent('trends-analysis', { task: "Track topic evolution" }),
  runAgent('citation-impact', { task: "Find top cited papers" })
]);
```

**Per-Result Parallelization:**
```typescript
// Get items from first agent
const papers = await runAgent('citation-impact', {
  task: "Find top 3 papers in biology"
});

// Extract DOIs
const dois = extractDOIs(papers.response);
// ["10.1038/nature123", "10.1126/science456", "10.1016/cell789"]

// Spawn one network-analysis agent per DOI (parallel)
const networks = await Promise.all(
  dois.map(doi =>
    runAgent('network-analysis', {
      task: `Build citation network for ${doi}`,
      identifier: doi
    })
  )
);
```

**Reactive/Cascading Spawning:**
```typescript
// Start 3 network agents in parallel
const networkPromises = dois.map(doi =>
  runAgent('network-analysis', { identifier: doi })
);

// As EACH completes, spawn visualization immediately
networkPromises.forEach(async (promise) => {
  const network = await promise;
  // Don't wait for others - visualize immediately
  runAgent('visualization', {
    task: "Visualize this network",
    network: network.data
  });
});
```

**Dynamic Scaling:**
```typescript
// Rule: For 2-5 items, spawn one agent per item
if (items.length >= 2 && items.length <= 5) {
  return items.map(item => spawnAgent(item));
}

// For 6+ items, batch into 3-5 agents
if (items.length > 5) {
  const batchSize = Math.ceil(items.length / 4);
  return chunkArray(items, batchSize).map(batch =>
    spawnAgent(batch)
  );
}
```

#### Phase 3: Synthesis & Coordination

```typescript
// Monitor agent progress
trackProgress(agentInstances);

// React to completions
onAgentComplete((agent, result) => {
  if (agent.type === 'data-discovery') {
    // Extract DOIs and spawn follow-up agents
    const dois = extractDOIs(result);
    spawnNetworkAgents(dois);
  }

  if (agent.type === 'network-analysis') {
    // Immediately visualize (don't wait for other networks)
    spawnVisualizationAgent(result.network);
  }
});

// Wait for all parallel agents
const results = await Promise.all(parallelAgents);

// Synthesize findings
const synthesis = combineResults(results);

// Return comprehensive insights
return formatFinalResponse(synthesis);
```

### Example Orchestration Flows

**Example 1: "Find 5 recent papers on quantum computing and analyze their impact"**

```typescript
// Query Analysis
const pattern = "sequential";
const agents = ["data-discovery", "citation-impact", "network-analysis"];

// Execution
1. data-discovery:
   - Task: "Find 5 recent quantum computing papers (2023-2025)"
   - Returns: Papers with DOIs

2. PARALLEL: citation-impact + network-analysis
   - citation-impact: Analyze citation metrics
   - network-analysis: Build networks for DOI list

3. visualization:
   - Task: "Create network chart"

4. Synthesis:
   - Combine discovery, impact, and network insights
   - Present comprehensive analysis
```

**Example 2: "Find top 3 papers in developmental biology and generate their citation networks"**

```typescript
// Query Analysis
const pattern = "per-result parallelization";
const agents = ["citation-impact", "network-analysis", "visualization"];

// Execution
1. citation-impact:
   - Task: "Find top 3 influential papers in developmental biology"
   - Instruction: "Include DOIs"
   - Returns: [DOI1, DOI2, DOI3]

2. PER-RESULT PARALLELIZATION (3 agents in parallel):
   - network-analysis(DOI1)
   - network-analysis(DOI2)
   - network-analysis(DOI3)

3. REACTIVE SPAWNING (as each network completes):
   - DOI1 completes → visualization(network1)
   - DOI2 completes → visualization(network2)
   - DOI3 completes → visualization(network3)

4. WAIT & SYNTHESIZE:
   - After all 6 agents complete (3 networks + 3 visualizations)
   - Synthesize findings
   - Present 3 papers with networks and visualizations
```

---

## Job Store & Progress Tracking

**File:** [packages/frontend/lib/job-store.ts](../packages/frontend/lib/job-store.ts)

### Agent Instance Tracking

Each agent execution creates an **AgentInstance**:

```typescript
interface AgentInstance {
  id: string;                          // Unique instance ID
  status: 'starting' | 'running' | 'completed' | 'error';
  startedAt: Date;
  completedAt?: Date;
  toolCallsComplete: number;           // Progress counter
  currentActivity?: string;            // Current task description
  error?: string;
}
```

### Job Progress Structure

```typescript
interface JobProgress {
  jobId: string;
  status: 'pending' | 'running' | 'complete' | 'error';
  sessionId: string;                   // SDK session ID

  // Multiple instances per agent type
  agents: {
    'data-discovery': AgentInstance[];
    'citation-impact': AgentInstance[];
    'network-analysis': AgentInstance[];
    'trends-analysis': AgentInstance[];
    'visualization': AgentInstance[];
  };

  // All tool calls across all agents
  toolCalls: ToolCall[];

  // Aggregate metrics
  metrics: {
    papersFound: number;
    citationNetworksBuilt: number;
    chartsCreated: number;
    toolCallCount: number;
    elapsedMs: number;
    currentAgent: string;
  };
}
```

### UI Components

**AgentActivityPanel** ([packages/frontend/components/research/agents/AgentActivityPanel.tsx](../packages/frontend/components/research/agents/AgentActivityPanel.tsx))

Features:
- Displays all 5 agent types with icon badges
- Shows instance count and status for each agent type
- Real-time progress updates
- Displays aggregate metrics (papers found, networks built, tool calls)
- Includes ToolTimeline for detailed tool call inspection
- Color-coded status indicators

**UI Layout:**
```
┌─────────────────────────────────────┐
│ Agent Activity                      │
├─────────────────────────────────────┤
│ 🔍 Data Discovery         [1 active]│
│   → Searching for quantum papers... │
│                                     │
│ 📊 Citation Impact        [1 active]│
│   → Finding influential papers...   │
│                                     │
│ 🕸️  Network Analysis       [3 active]│
│   → Building citation network 1/3   │
│   → Building citation network 2/3   │
│   → Building citation network 3/3   │
│                                     │
│ 📈 Trends Analysis      [0 active]│
│                                     │
│ 📉 Visualization         [2 active]│
│   → Creating network chart...       │
│   → Creating timeline chart...      │
├─────────────────────────────────────┤
│ Metrics:                            │
│ • Papers found: 47                  │
│ • Networks built: 3                 │
│ • Charts created: 2                 │
│ • Tool calls: 12                    │
│ • Elapsed: 23.4s                    │
└─────────────────────────────────────┘
```

---

## Key Design Patterns

### 1. DOI-First Architecture

**Problem:** OpenAIRE internal IDs often fail in network analysis tools

**Solution:** Always extract and use DOIs

```typescript
// ❌ Bad: Using OpenAIRE IDs
const papers = await search({ query: "AI" });
const network = await getNetwork(papers[0].id);
// Often fails with 404

// ✅ Good: Extracting DOIs
const papers = await search({ query: "AI" });
const dois = papers.map(p => p.doi).filter(Boolean);
const network = await getNetwork(dois[0]);
// Reliable
```

### 2. Detail Level Management

**Problem:** Large result sets cause response truncation

**Solution:** Choose detail level based on result count

```typescript
function selectDetailLevel(expectedCount: number): DetailLevel {
  if (expectedCount >= 50) return 'minimal';  // ~80 bytes/paper
  if (expectedCount >= 20) return 'standard'; // ~200 bytes/paper
  return 'full';  // ~482 bytes/paper
}
```

### 3. File-Based Processing for Scale

**Problem:** Large networks cause streaming timeouts

**Solution:** Save to files, merge with Bash, load result

```typescript
// Save individual networks
await write('/tmp/network_1.json', network1);
await write('/tmp/network_2.json', network2);

// Merge with Bash + jq
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
```

### 4. Inline Results by Default

**Problem:** Unnecessary file creation clutters filesystem

**Solution:** Return results inline unless explicitly requested

```typescript
// ✅ Default: Inline results
return `Found 47 papers:\n1. Paper A (DOI: 10.1234/abc)\n2. Paper B...`;

// ❌ Avoid unless requested
await write('/tmp/results.json', papers);
return "Results saved to /tmp/results.json";
```

### 5. Fail-Fast Error Handling

**Problem:** Agents loop repeatedly on 404 errors

**Solution:** Detect errors early, intervene with corrected identifiers

```typescript
// Detect 404 pattern
if (error.status === 404 && attempt < 3) {
  // Don't retry blindly
  throw new Error(`Network not found for ID ${id}. Try using DOI instead.`);
}

// Orchestrator intervention
if (agent.error?.includes('not found')) {
  const dois = extractDOIs(previousResponse);
  return retryWithDOIs(agent, dois);
}
```

---

## Agent Communication Patterns

### Handoff Pattern

```typescript
// Agent 1: discovery agent
const result1 = {
  papers: [...],
  dois: ["10.1038/nature123", "10.1126/science456"]
};

// Agent 2: network agent receives DOIs
const task = `Build citation networks for: ${result1.dois.join(', ')}`;
```

### Result Enrichment Pattern

```typescript
// Agent 1: citation-impact finds influential papers
const influential = [...papers with metrics...];

// Agent 2: network-analysis adds network structure
const enriched = influential.map(paper => ({
  ...paper,
  citationNetwork: buildNetwork(paper.doi)
}));

// Agent 3: visualization creates charts
const charts = enriched.map(paper =>
  createChart(paper.citationNetwork)
);
```

### Aggregation Pattern

```typescript
// Multiple agents run in parallel
const [papers1, papers2, papers3] = await Promise.all([
  dataDiscovery("topic A"),
  dataDiscovery("topic B"),
  dataDiscovery("topic C")
]);

// Orchestrator aggregates and deduplicates
const allPapers = [...papers1, ...papers2, ...papers3];
const uniquePapers = deduplicateByDOI(allPapers);
```

---

[← MCP Tools Reference](./mcp-tools-reference.md) | [Back to Main](./README.md) | [Architecture Overview →](./architecture.md)
