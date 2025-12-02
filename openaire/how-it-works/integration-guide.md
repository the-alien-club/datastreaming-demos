# Integration Guide - Agents & Tools

This guide shows how frontend agents use MCP tools through concrete examples and workflows.

**Important:** This guide uses **conceptual examples** to illustrate agent behavior. Agents are powered by LLMs that use system prompts to make intelligent decisions - there is no hardcoded keyword matching or decision logic. When you see code examples showing agent reasoning, these illustrate the **conceptual decision-making process**, not actual implementation code.

**Table of Contents:**
- [Agent-Tool Mapping](#agent-tool-mapping)
- [Complete Workflow Examples](#complete-workflow-examples)
- [Best Practices](#best-practices)
- [Common Patterns](#common-patterns)
- [Troubleshooting](#troubleshooting)

---

## Agent-Tool Mapping

### Data Discovery Agent → Tools

| Agent Capability | MCP Tool | Use Case |
|------------------|----------|----------|
| Find publications | `search_research_products` | General paper search |
| Find datasets | `search_datasets` | Specialized dataset discovery |
| Find organizations | `search_organizations` | Institution lookup |
| Find projects | `search_projects` | Grant/project search |
| Get author papers | `get_author_profile` | Author publication history |
| Find repositories | `search_data_sources` | Repository discovery |
| Get project outputs | `get_project_outputs` | Project deliverables |
| Get paper details | `get_research_product_details` | Full metadata retrieval |

**Example Usage:**
```typescript
// Simple search
await mcp.search_research_products({
  query: "quantum computing",
  fromPublicationDate: "2023",
  pageSize: 50,
  detail: "standard"
});

// Author search
await mcp.get_author_profile({
  orcid: "0000-0001-2345-6789",
  limit: 100,
  includeCoAuthors: true
});

// Project search
await mcp.search_projects({
  fundingStreamId: "H2020",
  keywords: "artificial intelligence",
  relOrganizationCountryCode: "US"
});
```

---

### Citation Impact Agent → Tools

| Agent Capability | MCP Tool | Use Case |
|------------------|----------|----------|
| Find influential papers | `find_by_influence_class` | Long-term impact (C1-C5) |
| Find trending papers | `find_by_popularity_class` | Current attention (C1-C5) |
| Find breakthrough papers | `find_by_impulse_class` | Early momentum (C1-C5) |
| Find most cited | `find_by_citation_count_class` | Raw citation volume (C1-C5) |

**Example Usage:**
```typescript
// Find top influential papers
await mcp.find_by_influence_class({
  citationClass: "C1",  // Top 0.01%
  search: "deep learning",
  fromPublicationDate: "2015",
  detail: "standard",
  pageSize: 50
});

// Find trending papers
await mcp.find_by_popularity_class({
  citationClass: "C2",  // Top 0.1%
  search: "large language models",
  fromPublicationDate: "2023",
  detail: "minimal",
  pageSize: 100
});

// Find breakthrough papers
await mcp.find_by_impulse_class({
  citationClass: "C1",
  search: "CRISPR",
  fromPublicationDate: "2012",
  toPublicationDate: "2020",
  detail: "full",
  pageSize: 20
});
```

**How Citation Class Selection Works:**

The Citation Impact Agent uses its **system prompt** (not hardcoded logic) to intelligently map user language to citation metrics. The agent's prompt explains:

```markdown
CITATION METRICS EXPLAINED:

1. Influence Class - Long-term impact
   Use for: "seminal works", "foundational papers", "most influential"

2. Popularity Class - Current attention
   Use for: "trending", "hot papers", "current research"

3. Impulse Class - Early momentum
   Use for: "breakthrough", "rapid adoption", "initial impact"

4. Citation Count Class - Raw volume
   Use for: "most cited", "citation leaders"

CITATION CLASSES: C1 (top 0.01%), C2 (top 0.1%), C3 (top 1%), C4 (top 10%), C5 (average)
```

**Example Agent Reasoning:**
- User: "Find the **top** papers in ML" → Agent chooses Influence C1
- User: "What's **trending** in AI?" → Agent chooses Popularity C1 + recent years
- User: "Show **breakthrough** discoveries" → Agent chooses Impulse C1
- User: "Find **well-cited** work" → Agent chooses Influence C2-C3

The LLM understands context, synonyms, and implicit meaning - no keyword matching required.

---

### Network Analysis Agent → Tools

| Agent Capability | MCP Tool | Use Case |
|------------------|----------|----------|
| Build citation network | `get_citation_network` | Who cites whom (depth 1-2) |
| Build collaboration network | `analyze_coauthorship_network` | Co-author patterns (depth 1-2) |
| Find semantic relationships | `explore_research_relationships` | Supplements, versions, datasets |
| Build paper collection network | `build_subgraph_from_dois` | Internal connections only |
| Get paper details | `get_research_product_details` | Node enrichment |

**Example Usage:**
```typescript
// Simple citation network
await mcp.get_citation_network({
  identifier: "10.1038/nature12345",  // DOI preferred
  depth: 1,
  direction: "both",
  maxNodes: 200
});

// Deep network exploration
await mcp.get_citation_network({
  identifier: "10.1038/nature12345",
  depth: 2,  // Multi-level
  direction: "citations",  // Only papers citing this
  maxNodes: 1000
});

// Collaboration network
await mcp.analyze_coauthorship_network({
  orcid: "0000-0001-2345-6789",
  maxDepth: 2,  // Extended community
  minCollaborations: 2,  // Filter noise
  limit: 200
});

// Find datasets for paper
await mcp.explore_research_relationships({
  identifier: "10.1038/nature12345",
  relationType: "IsSupplementTo",
  targetType: "dataset",
  limit: 50
});

// Analyze paper collection
await mcp.build_subgraph_from_dois({
  dois: [
    "10.1038/nature123",
    "10.1126/science456",
    "10.1016/cell789"
  ],
  fetchMetadata: true,
  includeRelationTypes: ["Cites", "IsSupplementTo"]
});
```

**How Network Parameters Are Selected:**

The Network Analysis Agent uses its **system prompt** to choose appropriate network parameters based on user intent:

**Agent's Decision Guidelines:**
```markdown
Network Size Selection:
- "citation network" → depth=1, maxNodes=200 (standard)
- "complete network", "comprehensive" → depth=2, maxNodes=1000 (deep exploration)
- "direct citations" → depth=1, direction=citations
- "references" → depth=1, direction=references

File Processing Decision:
- Networks >500 nodes → Save to files, merge with Bash
- Smaller networks → Return directly
```

**Example Agent Reasoning:**
- User: "Build citation network for this paper" → depth=1, maxNodes=200
- User: "Show me the **complete** citation landscape" → depth=2, maxNodes=1000, use files
- User: "Who cites this?" → depth=1, direction="citations"

The agent interprets natural language to select optimal parameters.

---

### Trends Analysis Agent → Tools

| Agent Capability | MCP Tool | Use Case |
|------------------|----------|----------|
| Track topic evolution | `analyze_research_trends` | Year-by-year publication counts |
| Compare time periods | `search_research_products` | Temporal comparison with filters |

**Example Usage:**
```typescript
// Basic trend analysis
await mcp.analyze_research_trends({
  search: "machine learning",
  fromYear: 2010,
  toYear: 2025,
  type: "publication"
});

// Sub-topic analysis
const topics = ["deep learning", "reinforcement learning", "transfer learning"];
await Promise.all(
  topics.map(topic =>
    mcp.analyze_research_trends({
      search: `machine learning + ${topic}`,
      fromYear: 2015,
      toYear: 2025
    })
  )
);

// Compare periods with search
await mcp.search_research_products({
  query: "quantum computing",
  fromPublicationDate: "2015-01-01",
  toPublicationDate: "2018-12-31",
  pageSize: 100,
  detail: "minimal"
});

await mcp.search_research_products({
  query: "quantum computing",
  fromPublicationDate: "2023-01-01",
  toPublicationDate: "2025-12-31",
  pageSize: 100,
  detail: "minimal"
});
```

**Conceptual Agent Workflow:**

This shows what the Trends Analysis Agent conceptually does (not actual implementation code):

```typescript
async function analyzeTrends(topic: string, fromYear: number, toYear: number) {
  // 1. Get year-by-year data
  const trends = await mcp.analyze_research_trends({
    search: topic,
    fromYear,
    toYear
  });

  // 2. Calculate growth metrics with Bash
  await bash(`
    echo '${JSON.stringify(trends.data)}' |
    jq -r '.[] | "\\(.year) \\(.count)"' |
    awk '{
      if (NR > 1) {
        growth = ($2 - prev) / prev * 100
        printf "%d: %d papers (+%.1f%%)\n", $1, $2, growth
      }
      prev = $2
    }'
  `);

  // 3. Identify inflection points
  const inflectionPoints = findInflectionPoints(trends.data);

  // 4. Compare with citation impact
  const recentImpactful = await mcp.find_by_impulse_class({
    citationClass: "C1",
    search: topic,
    fromPublicationDate: String(toYear - 2),
    pageSize: 20
  });

  return {
    trends,
    inflectionPoints,
    recentBreakthroughs: recentImpactful
  };
}
```

---

### Visualization Agent → Tools

**Note:** The Visualization Agent uses tools from a **separate MCP server** (`viz-tools`), not the OpenAIRE MCP documented in this guide.

| Agent Capability | MCP Tool | Use Case |
|------------------|----------|----------|
| Network visualization | `create_citation_network_chart` | Interactive network graphs |
| Timeline visualization | `create_timeline_chart` | Trend line charts |
| Distribution visualization | `create_distribution_chart` | Pie/bar charts |
| Merge networks | `merge_citation_networks` | Combine multiple networks |

**Example Usage:**
```typescript
// Visualize citation network
await mcp.create_citation_network_chart({
  nodes: [
    { id: "paper1", title: "Title 1", year: 2020, citations: 123 },
    { id: "paper2", title: "Title 2", year: 2021, citations: 45 }
  ],
  edges: [
    { source: "paper2", target: "paper1", type: "cites" }
  ],
  title: "Citation Network: Deep Learning"
});

// Visualize trends
await mcp.create_timeline_chart({
  data: [
    { year: 2020, count: 1200 },
    { year: 2021, count: 1450 },
    { year: 2022, count: 1780 }
  ],
  title: "ML Publications Over Time",
  xLabel: "Year",
  yLabel: "Publications"
});

// Visualize distribution
await mcp.create_distribution_chart({
  data: [
    { segment: "Article", value: 145 },
    { segment: "Conference Paper", value: 87 },
    { segment: "Preprint", value: 23 }
  ],
  chartType: "pie",
  title: "Publication Type Distribution"
});
```

**Conceptual Large Network Merging Workflow:**

This shows what the Visualization Agent conceptually does for large networks:

```typescript
async function mergeAndVisualize(dois: string[]) {
  // 1. Fetch networks (parallel)
  const networkFiles = await Promise.all(
    dois.map(async (doi, i) => {
      const network = await mcp.get_citation_network({ identifier: doi });
      await write(`/tmp/network_${i}.json`, JSON.stringify(network));
      return `/tmp/network_${i}.json`;
    })
  );

  // 2. Merge with Bash + jq
  await bash(`
    jq -s 'reduce .[] as $net ({"nodes": [], "edges": []};
      .nodes += $net.network.nodes |
      .edges += $net.network.edges) |
      .nodes |= unique_by(.id) |
      .edges |= unique_by(.source + .target)'
      /tmp/network_*.json > /tmp/merged.json
  `);

  // 3. Load merged network
  const merged = JSON.parse(await read('/tmp/merged.json'));

  // 4. Visualize
  await mcp.create_citation_network_chart({
    nodes: merged.nodes,
    edges: merged.edges,
    title: `Merged Citation Network (${dois.length} papers)`
  });
}
```

---

## Complete Workflow Examples

**Note:** The following examples show **conceptual agent workflows** to illustrate how agents collaborate and use MCP tools. These are not actual implementation code - agents use LLMs with system prompts to make intelligent decisions, not hardcoded functions.

### Example 1: Simple Discovery Query

**User Query:** "Find recent papers on quantum computing"

**Workflow:**
```typescript
// Phase 1: Orchestrator analysis
const intent = {
  type: "discovery",
  agents: ["data-discovery"],
  pattern: "simple"
};

// Phase 2: Data Discovery Agent execution
const result = await dataDiscoveryAgent.run({
  task: "Find recent papers on quantum computing",
  instructions: "Focus on 2023-2025, get 30-50 papers with DOIs"
});

// Agent implementation
async function run(task) {
  const papers = await mcp.search_research_products({
    query: "quantum computing",
    fromPublicationDate: "2023",
    sortBy: "publicationDate DESC",
    pageSize: 50,
    detail: "standard"
  });

  // Extract DOIs for potential handoff
  const dois = papers.results.map(p => p.doi).filter(Boolean);

  return {
    summary: formatPapers(papers.results.slice(0, 10)),
    allDois: dois,
    totalFound: papers.totalResults
  };
}

// Phase 3: Orchestrator synthesis
const finalResponse = `
Found ${result.totalFound} recent publications on quantum computing (2023-2025):

**Top Papers:**
${result.summary}

[Available DOIs for further analysis: ${result.allDois.length} papers]
`;
```

---

### Example 2: Impact Analysis Query

**User Query:** "Find the most influential papers in machine learning"

**Workflow:**
```typescript
// Phase 1: Orchestrator analysis
const intent = {
  type: "impact",
  agents: ["citation-impact"],
  pattern: "simple"
};

// Phase 2: Citation Impact Agent execution
const result = await citationImpactAgent.run({
  task: "Find most influential ML papers",
  instructions: "Use influence class C1, focus on foundational works"
});

// Agent implementation
async function run(task) {
  // Map "most influential" → Influence Class C1
  const papers = await mcp.find_by_influence_class({
    citationClass: "C1",  // Top 0.01%
    search: "machine learning",
    sortBy: "influence DESC",
    pageSize: 50,
    detail: "standard"
  });

  // Extract DOIs
  const dois = papers.results.map(p => p.doi).filter(Boolean);

  return {
    papers: papers.results,
    dois,
    metric: "influence",
    class: "C1"
  };
}

// Phase 3: Orchestrator synthesis
const finalResponse = `
Found ${result.papers.length} highly influential papers in ML (Influence Class C1 - top 0.01%):

**Top Influential Papers:**
${formatInfluentialPapers(result.papers.slice(0, 10))}

These papers have demonstrated sustained long-term impact and shaped the field.
`;
```

---

### Example 3: Multi-Agent Complex Query

**User Query:** "Find top 3 papers in developmental biology and build their citation networks"

**Workflow:**
```typescript
// Phase 1: Orchestrator analysis
const intent = {
  type: "impact-network",
  agents: ["citation-impact", "network-analysis", "visualization"],
  pattern: "sequential-per-result"
};

// Phase 2a: Citation Impact Agent
const impactResult = await citationImpactAgent.run({
  task: "Find top 3 influential papers in developmental biology",
  instructions: "Use influence class C1, extract DOIs"
});

// Agent gets top 3 papers
const papers = await mcp.find_by_influence_class({
  citationClass: "C1",
  search: "developmental biology",
  pageSize: 3,
  detail: "full"
});

const dois = papers.results.map(p => p.doi);
// Result: ["10.1038/nature123", "10.1126/science456", "10.1016/cell789"]

// Phase 2b: Spawn 3 Network Analysis Agents (parallel)
const networkPromises = dois.map(doi =>
  networkAnalysisAgent.run({
    task: `Build citation network for ${doi}`,
    identifier: doi
  })
);

// Each agent builds network
async function buildNetwork(doi) {
  const network = await mcp.get_citation_network({
    identifier: doi,
    depth: 1,
    direction: "both",
    maxNodes: 200
  });

  // Save for large networks
  if (network.statistics.totalNodes > 500) {
    await write(`/tmp/network_${doi.replace(/\//g, '_')}.json`,
                 JSON.stringify(network));
  }

  return network;
}

// Phase 2c: As each network completes, spawn visualization (reactive)
const visualizations = [];
for (const promise of networkPromises) {
  const network = await promise;

  // Spawn visualization immediately (don't wait for others)
  const viz = visualizationAgent.run({
    task: "Visualize citation network",
    network: network
  });

  visualizations.push(viz);
}

// Visualization agent creates chart
async function visualizeNetwork(network) {
  return await mcp.create_citation_network_chart({
    nodes: network.network.nodes,
    edges: network.network.edges,
    title: `Citation Network: ${network.centerPaper.title}`
  });
}

// Phase 3: Wait for all agents and synthesize
const [networks, charts] = await Promise.all([
  Promise.all(networkPromises),
  Promise.all(visualizations)
]);

const finalResponse = `
Found top 3 influential papers in developmental biology and built citation networks:

**Paper 1:** ${papers.results[0].title}
- DOI: ${dois[0]}
- Citations: ${papers.results[0].citationCount}
- Influence: C1 (top 0.01%)
- Network: ${networks[0].statistics.totalNodes} nodes, ${networks[0].statistics.totalEdges} edges
[View Network Visualization]

**Paper 2:** ${papers.results[1].title}
[...similar structure...]

**Paper 3:** ${papers.results[2].title}
[...similar structure...]

All citation networks have been visualized and are ready for exploration.
`;
```

**Timeline:**
```
0.0s: Orchestrator starts
0.0s: Citation Impact Agent starts
1.2s: Citation Impact completes, returns 3 DOIs
1.2s: Spawn 3 Network Analysis Agents (parallel)
1.2s: Network Agent #1 starts (DOI1)
1.2s: Network Agent #2 starts (DOI2)
1.2s: Network Agent #3 starts (DOI3)
3.5s: Network Agent #1 completes → Spawn Visualization Agent #1
3.7s: Network Agent #2 completes → Spawn Visualization Agent #2
3.9s: Network Agent #3 completes → Spawn Visualization Agent #3
4.2s: Visualization Agent #1 completes
4.4s: Visualization Agent #2 completes
4.5s: Visualization Agent #3 completes
4.5s: Orchestrator synthesizes and returns

Total: 4.5s (vs 10.2s if sequential)
Speedup: 2.3x
```

---

### Example 4: Trend Analysis Query

**User Query:** "Analyze research trends in AI from 2015 to 2025"

**Workflow:**
```typescript
// Phase 1: Orchestrator analysis
const intent = {
  type: "trends",
  agents: ["trends-analysis", "visualization"],
  pattern: "sequential"
};

// Phase 2: Trends Analysis Agent
const trendsResult = await trendsAnalysisAgent.run({
  task: "Analyze AI trends 2015-2025",
  instructions: "Include growth analysis and inflection points"
});

// Agent implementation
async function analyzeTrends() {
  // Get year-by-year data
  const trends = await mcp.analyze_research_trends({
    search: "artificial intelligence",
    fromYear: 2015,
    toYear: 2025,
    type: "publication"
  });

  // Calculate growth rates
  const growthData = await bash(`
    echo '${JSON.stringify(trends.data)}' |
    jq -r '.[] | "\\(.year)\\t\\(.count)"' |
    awk 'BEGIN { FS="\\t" }
         NR > 1 {
           growth = ($2 - prev) / prev * 100
           print $1 "\\t" $2 "\\t" growth
         }
         { prev = $2 }'
  `);

  // Find inflection points
  const inflectionPoints = findInflectionPoints(trends.data);

  // Get recent breakthrough papers
  const breakthroughs = await mcp.find_by_impulse_class({
    citationClass: "C1",
    search: "artificial intelligence",
    fromPublicationDate: "2023",
    pageSize: 10
  });

  return {
    trends: trends.data,
    statistics: trends.statistics,
    inflectionPoints,
    breakthroughs
  };
}

// Phase 3: Visualization Agent
const vizResult = await visualizationAgent.run({
  task: "Create timeline chart",
  data: trendsResult.trends
});

await mcp.create_timeline_chart({
  data: trendsResult.trends,
  title: "AI Research Publications (2015-2025)",
  xLabel: "Year",
  yLabel: "Publications"
});

// Phase 4: Orchestrator synthesis
const finalResponse = `
Research Trends Analysis: Artificial Intelligence (2015-2025)

**Overall Growth:**
- Total publications: ${trendsResult.statistics.totalPublications}
- Growth rate: +${trendsResult.statistics.growthRate.overall}%
- Peak year: ${trendsResult.statistics.peakYear.year} (${trendsResult.statistics.peakYear.count} papers)

**Key Inflection Points:**
${formatInflectionPoints(trendsResult.inflectionPoints)}

**Recent Breakthroughs (2023-2025):**
${formatBreakthroughs(trendsResult.breakthroughs)}

[View Interactive Timeline Chart]
`;
```

---

### Example 5: Author Collaboration Analysis

**User Query:** "Analyze collaboration network for author with ORCID 0000-0001-2345-6789"

**Workflow:**
```typescript
// Phase 1: Orchestrator analysis
const intent = {
  type: "network",
  agents: ["network-analysis", "visualization"],
  pattern: "sequential"
};

// Phase 2: Network Analysis Agent
const networkResult = await networkAnalysisAgent.run({
  task: "Build collaboration network for ORCID 0000-0001-2345-6789",
  instructions: "Include direct collaborators, filter out single collaborations"
});

// Agent implementation
async function buildCollaboration() {
  // Build co-authorship network
  const network = await mcp.analyze_coauthorship_network({
    orcid: "0000-0001-2345-6789",
    maxDepth: 1,  // Direct collaborators
    minCollaborations: 2,  // Filter noise
    limit: 200
  });

  // Get author profile for context
  const profile = await mcp.get_author_profile({
    orcid: "0000-0001-2345-6789",
    limit: 100,
    includeCoAuthors: true
  });

  return {
    network,
    profile,
    topCollaborators: network.network.nodes
      .sort((a, b) => b.collaborationCount - a.collaborationCount)
      .slice(0, 10)
  };
}

// Phase 3: Visualization Agent
await visualizationAgent.run({
  task: "Visualize collaboration network",
  network: networkResult.network
});

await mcp.create_citation_network_chart({
  nodes: networkResult.network.network.nodes,
  edges: networkResult.network.network.edges,
  title: `Collaboration Network: ${networkResult.profile.author.name}`
});

// Phase 4: Orchestrator synthesis
const finalResponse = `
Collaboration Network Analysis: ${networkResult.profile.author.name}

**Author Profile:**
- Total publications: ${networkResult.profile.statistics.totalPublications}
- Total citations: ${networkResult.profile.statistics.totalCitations}
- Career span: ${networkResult.profile.statistics.yearRange.first} - ${networkResult.profile.statistics.yearRange.last}

**Collaboration Network:**
- Total collaborators: ${networkResult.network.statistics.totalCollaborators}
- Total collaborations: ${networkResult.network.statistics.totalCollaborations}
- Average collaborations per author: ${networkResult.network.statistics.averageCollaborationsPerAuthor.toFixed(1)}

**Top Collaborators:**
${formatTopCollaborators(networkResult.topCollaborators)}

[View Interactive Network Visualization]
`;
```

---

## Best Practices

### 1. Always Extract DOIs

**❌ Bad:**
```typescript
const papers = await mcp.search_research_products({ query: "AI" });
// Later, pass OpenAIRE internal ID
await mcp.get_citation_network({ identifier: papers.results[0].id });
// Often fails with 404
```

**✅ Good:**
```typescript
const papers = await mcp.search_research_products({ query: "AI" });
// Extract DOIs
const dois = papers.results.map(p => p.doi).filter(Boolean);
// Pass DOI
await mcp.get_citation_network({ identifier: dois[0] });
// Reliable
```

### 2. Choose Appropriate Detail Level

**❌ Bad:**
```typescript
// Always using full detail
await mcp.search_research_products({
  query: "machine learning",
  pageSize: 100,  // Large result set
  detail: "full"  // Will truncate at ~103 papers
});
```

**✅ Good:**
```typescript
// Select based on result count
const pageSize = 100;
const detail = pageSize >= 50 ? "minimal" : "standard";

await mcp.search_research_products({
  query: "machine learning",
  pageSize,
  detail  // Appropriate for size
});
```

### 3. Use File-Based Processing for Large Networks

**❌ Bad:**
```typescript
// Building 5 networks in memory
const networks = await Promise.all(
  dois.map(doi => mcp.get_citation_network({ identifier: doi, depth: 2, maxNodes: 1000 }))
);
// May timeout or truncate
```

**✅ Good:**
```typescript
// Save each network to file
await Promise.all(
  dois.map(async (doi, i) => {
    const network = await mcp.get_citation_network({ identifier: doi, depth: 2 });
    await write(`/tmp/network_${i}.json`, JSON.stringify(network));
  })
);

// Merge with Bash
await bash(`jq -s ... /tmp/network_*.json > /tmp/merged.json`);

// Load merged result
const merged = JSON.parse(await read('/tmp/merged.json'));
```

### 4. Return Results Inline When Possible

**❌ Bad:**
```typescript
// Unnecessary file creation
const papers = await mcp.search_research_products({ query: "AI" });
await write('/tmp/results.json', JSON.stringify(papers));
return "Results saved to /tmp/results.json";
```

**✅ Good:**
```typescript
// Return inline
const papers = await mcp.search_research_products({ query: "AI" });
return formatPapers(papers.results);
```

### 5. Fail Fast on Errors

**❌ Bad:**
```typescript
// Retrying with same bad identifier
for (let i = 0; i < 5; i++) {
  try {
    return await mcp.get_citation_network({ identifier: badId });
  } catch (error) {
    // Keep trying with same ID
  }
}
```

**✅ Good:**
```typescript
// Fail fast with actionable error
try {
  return await mcp.get_citation_network({ identifier });
} catch (error) {
  if (error.status === 404) {
    throw new Error(
      `Network not found for ${identifier}. ` +
      `If this is an OpenAIRE ID, try extracting the DOI instead.`
    );
  }
  throw error;
}
```

### 6. Use Parallel Execution When Possible

**❌ Bad:**
```typescript
// Sequential execution
for (const doi of dois) {
  const network = await mcp.get_citation_network({ identifier: doi });
  results.push(network);
}
// Takes N × time
```

**✅ Good:**
```typescript
// Parallel execution
const results = await Promise.all(
  dois.map(doi => mcp.get_citation_network({ identifier: doi }))
);
// Takes 1 × time (fastest)
```

---

## Common Patterns

### Pattern: Discovery → Analysis

```typescript
// 1. Find papers
const papers = await mcp.search_research_products({
  query: "quantum computing",
  pageSize: 50
});

// 2. Extract DOIs
const dois = papers.results.map(p => p.doi).filter(Boolean);

// 3. Analyze impact
const impactful = await Promise.all(
  dois.slice(0, 5).map(doi =>
    mcp.get_research_product_details({ identifier: doi })
  )
);

// 4. Build networks
const networks = await Promise.all(
  impactful.map(paper =>
    mcp.get_citation_network({ identifier: paper.doi })
  )
);
```

### Pattern: Impact → Network → Visualization

```typescript
// 1. Find influential papers
const papers = await mcp.find_by_influence_class({
  citationClass: "C1",
  search: "deep learning",
  pageSize: 3
});

// 2. Build networks (parallel)
const networks = await Promise.all(
  papers.results.map(p =>
    mcp.get_citation_network({ identifier: p.doi })
  )
);

// 3. Visualize (reactive spawning)
const charts = [];
for (const network of networks) {
  const chart = await mcp.create_citation_network_chart({
    nodes: network.network.nodes,
    edges: network.network.edges,
    title: network.centerPaper.title
  });
  charts.push(chart);
}
```

### Pattern: Trends → Discovery → Impact

```typescript
// 1. Analyze trends
const trends = await mcp.analyze_research_trends({
  search: "machine learning",
  fromYear: 2015,
  toYear: 2025
});

// 2. Identify growth period
const growthPeriod = identifyGrowthPeriod(trends.data);
// Result: 2017-2020

// 3. Find papers from growth period
const growthPapers = await mcp.search_research_products({
  query: "machine learning",
  fromPublicationDate: "2017",
  toPublicationDate: "2020",
  pageSize: 100
});

// 4. Find influential papers from that period
const influential = await mcp.find_by_influence_class({
  citationClass: "C1",
  search: "machine learning",
  fromPublicationDate: "2017",
  toPublicationDate: "2020"
});
```

---

## Troubleshooting

### Issue: 404 Error on get_citation_network

**Symptom:** `Network not found for identifier`

**Cause:** Using OpenAIRE internal ID instead of DOI

**Solution:**
```typescript
// Extract DOI from search result
const papers = await mcp.search_research_products({ query: "AI" });
const doi = papers.results[0].doi;  // Not .id

// Use DOI for network
await mcp.get_citation_network({ identifier: doi });
```

### Issue: Response Truncation

**Symptom:** Results cut off, incomplete data

**Cause:** Using `detail: "full"` with large result sets

**Solution:**
```typescript
// Use appropriate detail level
const pageSize = 100;
const detail = pageSize >= 50 ? "minimal" :
               pageSize >= 20 ? "standard" : "full";

await mcp.search_research_products({ query: "AI", pageSize, detail });
```

### Issue: Streaming Timeout on Large Networks

**Symptom:** Network requests timeout or hang

**Cause:** Large networks (500+ nodes) streaming in memory

**Solution:**
```typescript
// Use file-based processing
const network = await mcp.get_citation_network({
  identifier: doi,
  maxNodes: 1000
});

// Save to file
await write('/tmp/network.json', JSON.stringify(network));

// Process later
const network = JSON.parse(await read('/tmp/network.json'));
```

### Issue: No Results from Citation Class Search

**Symptom:** `find_by_influence_class` returns 0 results

**Cause:** Too restrictive filters (C1 + narrow topic + narrow date range)

**Solution:**
```typescript
// Broaden search
await mcp.find_by_influence_class({
  citationClass: "C2",  // Broaden from C1
  search: "machine learning",  // Broader topic
  fromPublicationDate: "2010",  // Wider date range
  // Remove toPublicationDate to include all recent papers
});
```

### Issue: Agent Looping on Same Error

**Symptom:** Agent repeatedly calls same failing tool

**Cause:** No error handling or intervention

**Solution (Conceptual):**

The orchestrator can detect and intervene when agents loop on errors:

```typescript
// Conceptual orchestrator behavior (not actual implementation)
class Orchestrator {
  async monitorAgent(agent) {
    try {
      return await agent.run();
    } catch (error) {
      if (error.message.includes('404') && error.attempt === 1) {
        // Extract DOI and retry
        const doi = this.extractDOI(agent.context);
        return agent.retry({ identifier: doi });
      }
      throw error;
    }
  }
}
```

### Issue: Slow Multi-Network Queries

**Symptom:** Building multiple networks takes too long

**Cause:** Sequential execution

**Solution:**
```typescript
// ❌ Sequential (slow)
for (const doi of dois) {
  networks.push(await mcp.get_citation_network({ identifier: doi }));
}

// ✅ Parallel (fast)
const networks = await Promise.all(
  dois.map(doi => mcp.get_citation_network({ identifier: doi }))
);
```

---

[← Architecture Overview](./architecture.md) | [Back to Main](./README.md)
