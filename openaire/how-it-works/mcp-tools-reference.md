# MCP Tools Reference

Complete reference for all 17 OpenAIRE MCP tools. Each tool is documented with its purpose, parameters, return values, and usage guidance.

**Table of Contents:**
- [Search & Discovery Tools](#search--discovery-tools)
- [Citation Analysis Tools](#citation-analysis-tools)
- [Network Analysis Tools](#network-analysis-tools)
- [Author & Project Intelligence Tools](#author--project-intelligence-tools)
- [Semantic Relationship Tools](#semantic-relationship-tools)
- [Trends & Temporal Analysis Tools](#trends--temporal-analysis-tools)

---

## Search & Discovery Tools

### search_research_products

**Purpose:** Comprehensive search across 600M+ publications, datasets, and software in the OpenAIRE Graph.

**Implementation:** [packages/mcp/src/tools/search.ts](../packages/mcp/src/tools/search.ts)

**API Target:** OpenAIRE Graph API V2
- **Base URL:** `https://api.openaire.eu`
- **Endpoint:** `GET /graph/v2/researchProducts`

**Example Request:**
```http
GET https://api.openaire.eu/graph/v2/researchProducts?search=quantum%20computing&fromPublicationDate=2023&pageSize=50&sortBy=publicationDate%20DESC&influenceClass=C1
```

**Example MCP Tool Call:**
```json
{
  "query": "quantum computing",
  "fromPublicationDate": "2023",
  "pageSize": 50,
  "sortBy": "publicationDate DESC",
  "influenceClass": ["C1"],
  "detail": "standard"
}
```

**Key Features:**
- Full-text search with logical operators (AND, OR, NOT)
- 50+ filter parameters
- Citation metrics filtering
- Funding relationship filters
- SDG and FOS classification filters
- Cursor-based pagination for datasets >10K records

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `query` | string | Full-text keyword search. Supports uppercase AND, OR, NOT (e.g., "machine AND learning NOT supervised") |
| `mainTitle` | string | Search specifically within titles |
| `description` | string | Search within abstracts/descriptions |
| `type` | array | Filter by: publication, dataset, software, other |
| `authorFullName` | array | Author names (OR logic between items) |
| `authorOrcid` | array | Author ORCID identifiers |
| `pid` | array | Persistent identifiers (DOI, PMID, etc.) |
| `fromPublicationDate` | string | Start date (YYYY or YYYY-MM-DD) |
| `toPublicationDate` | string | End date (YYYY or YYYY-MM-DD) |
| `subjects` | array | Subject classifications |
| `fos` | array | Field of Science classifications |
| `sdg` | array | UN Sustainable Development Goals (1-17) |
| `countryCode` | array | ISO country codes (e.g., US, GB, DE) |
| `instanceType` | array | Resource types (e.g., Article, Conference paper) |
| `publisher` | array | Publishing entities |
| `isPeerReviewed` | boolean | Peer review status |
| `isInDiamondJournal` | boolean | Diamond/platinum OA journals |
| `isPubliclyFunded` | boolean | Public funding indicator |
| `isGreen` | boolean | Green OA (self-archived) |
| `openAccessColor` | array | OA colors: bronze, gold, hybrid |
| `bestOpenAccessRightLabel` | array | Access rights: OPEN, EMBARGO, RESTRICTED, CLOSED |
| **Citation Metrics** | | |
| `influenceClass` | array | C1-C5: Long-term impact |
| `popularityClass` | array | C1-C5: Current attention |
| `impulseClass` | array | C1-C5: Early momentum |
| `citationCountClass` | array | C1-C5: Raw citation count |
| **Funding Filters** | | |
| `relProjectId` | array | OpenAIRE project IDs |
| `relProjectCode` | array | Grant codes |
| `relProjectFundingShortName` | array | Funder names (EC, NSF, NIH) |
| `relProjectFundingStreamId` | array | Funding streams (H2020, FP7, Horizon Europe) |
| `hasProjectRel` | boolean | Has project connections |
| **Organization Filters** | | |
| `relOrganizationId` | array | Organization OpenAIRE IDs |
| **Data Source Filters** | | |
| `relHostingDataSourceId` | array | Hosting repository IDs |
| `relCollectedFromDatasourceId` | array | Collecting source IDs |
| `relCommunityId` | array | Research community IDs |
| **Pagination** | | |
| `page` | number | Page number (default: 1, limited to 10K records) |
| `pageSize` | number | Results per page (1-100, default: 10) |
| `cursor` | string | Cursor token for >10K records (start with "*") |
| **Output Control** | | |
| `sortBy` | string | Format: "field ASC\|DESC". Fields: relevance, publicationDate, dateOfCollection, influence, popularity, citationCount, impulse |
| `detail` | enum | Response detail: minimal (~80 bytes/paper), standard (~200 bytes/paper), full (~482 bytes/paper) |
| `logicalOperator` | enum | Combine fields with AND, OR, NOT (default: AND) |

**Returns:**
```typescript
{
  totalResults: number,
  page: number,
  pageSize: number,
  nextCursor?: string,  // For cursor-based pagination
  results: [
    {
      id: string,           // OpenAIRE ID
      doi?: string,         // DOI (preferred identifier)
      title: string,
      year: number,
      type: string,
      // Minimal detail includes:
      citationCount?: number,
      influenceClass?: string,
      popularityClass?: string,
      impulseClass?: string,
      // Standard detail adds:
      authors?: Author[],   // First 3 authors
      openAccess?: boolean,
      // Full detail adds:
      abstract?: string,    // 500 chars max
      subjects?: string[],
      funding?: Funding[],
      // ... more fields
    }
  ]
}
```

**Usage Guidance:**
- For large result sets (50+), use `detail: 'minimal'` to prevent truncation
- Use cursor-based pagination for datasets >10K records
- Apply citation class filters early to reduce result sets
- Use specific field searches (`mainTitle`, `description`) instead of general `query` when possible

**Example Prompts:**
- "Find recent publications on quantum computing with high influence"
- "Search for publicly funded datasets in climate science"
- "Find papers from Horizon 2020 projects about AI in healthcare"

---

### get_research_product_details

**Purpose:** Get complete metadata for a specific research product (publication, dataset, or software).

**Implementation:** [packages/mcp/src/tools/details.ts](../packages/mcp/src/tools/details.ts)

**API Target:** OpenAIRE Graph API V2
- **Base URL:** `https://api.openaire.eu`
- **Endpoint:** `GET /graph/v2/researchProducts` (with `pid` filter for DOIs)

**Example Request:**
```http
GET https://api.openaire.eu/graph/v2/researchProducts?pid=10.1038/nature12345&page=1&pageSize=1
```

**Example MCP Tool Call:**
```json
{
  "identifier": "10.1038/nature12345",
  "includeAbstract": true
}
```

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `identifier` | string | DOI or OpenAIRE ID (DOIs preferred) |
| `includeAbstract` | boolean | Include full abstract (default: true) |

**Returns:**
```typescript
{
  id: string,
  doi: string,
  title: string,
  abstract?: string,
  year: number,
  type: string,
  authors: Author[],         // All authors with ORCID if available
  subjects: string[],
  funding: Funding[],        // All funding sources
  relatedProjects: Project[],
  relatedOrganizations: Organization[],
  citationCount: number,
  influenceClass: string,
  popularityClass: string,
  impulseClass: string,
  openAccess: boolean,
  accessRights: string,
  publisher: string,
  publicationDate: string,
  // ... additional metadata
}
```

**Usage Guidance:**
- Always use DOIs when available (more reliable than OpenAIRE IDs)
- Use this for detailed analysis of specific papers
- Set `includeAbstract: false` when only metadata is needed

**Example Prompts:**
- "Get full details for DOI 10.1038/nature12345"
- "Show me complete metadata for this paper"

---

### search_datasets

**Purpose:** Specialized search for research datasets in the OpenAIRE Graph.

**Implementation:** [packages/mcp/src/tools/datasets.ts](../packages/mcp/src/tools/datasets.ts)

**API Target:** OpenAIRE Graph API V2
- **Base URL:** `https://api.openaire.eu`
- **Endpoint:** `GET /graph/v2/researchProducts` (with `type=dataset` filter)

**Example Request:**
```http
GET https://api.openaire.eu/graph/v2/researchProducts?type=dataset&search=climate%20change&bestOpenAccessRightLabel=OPEN&pageSize=50
```

**Example MCP Tool Call:**
```json
{
  "search": "climate change",
  "openAccessOnly": true,
  "pageSize": 50,
  "sortBy": "date",
  "detail": "standard"
}
```

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `search` | string | General search query |
| `title` | string | Dataset title search |
| `description` | string | Description/abstract search |
| `subjects` | string | Subject classification |
| `publisher` | string | Publishing repository |
| `openAccessOnly` | boolean | Filter to open datasets only |
| `fromPublicationDate` | string | Start date (YYYY or YYYY-MM-DD) |
| `toPublicationDate` | string | End date (YYYY or YYYY-MM-DD) |
| `relProjectId` | string | Related project OpenAIRE ID |
| `relOrganizationId` | string | Related organization ID |
| `page` | number | Page number (default: 1) |
| `pageSize` | number | Results per page (1-100, default: 10) |
| `sortBy` | enum | relevance, date, popularity |
| `sortDirection` | enum | ASC, DESC |
| `detail` | enum | minimal, standard, full |

**Returns:** Similar structure to `search_research_products` but filtered to datasets only.

**Usage Guidance:**
- Use `openAccessOnly: true` to find reusable datasets
- Filter by `publisher` to find datasets in specific repositories
- Use `relProjectId` to find project-specific datasets

**Example Prompts:**
- "Find open datasets about climate change"
- "Search for genomics datasets from European projects"

---

### search_organizations

**Purpose:** Find research institutions, universities, research centers, and companies.

**Implementation:** [packages/mcp/src/tools/organizations.ts](../packages/mcp/src/tools/organizations.ts)

**API Target:** OpenAIRE Graph API V1
- **Base URL:** `https://api.openaire.eu`
- **Endpoint:** `GET /graph/v1/organizations`

**Example Request:**
```http
GET https://api.openaire.eu/graph/v1/organizations?search=Stanford&countryCode=US&page=1&pageSize=10
```

**Example MCP Tool Call:**
```json
{
  "search": "Stanford",
  "countryCode": "US",
  "pageSize": 10
}
```

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `search` | string | General search across all fields |
| `legalName` | string | Full legal name |
| `legalShortName` | string | Abbreviation or short name |
| `countryCode` | string | ISO country code (e.g., "US", "GB") |
| `pid` | string | Persistent identifier (ROR, GRID, ISNI) |
| `page` | number | Page number (default: 1) |
| `pageSize` | number | Results per page (1-100, default: 10) |
| `cursor` | string | Cursor for large result sets |

**Returns:**
```typescript
{
  totalResults: number,
  results: [
    {
      id: string,
      legalName: string,
      legalShortName: string,
      country: string,
      countryCode: string,
      websiteUrl?: string,
      alternativeNames: string[],
      pid: {
        type: string,  // ROR, GRID, ISNI
        value: string
      }[]
    }
  ]
}
```

**Usage Guidance:**
- Use ROR IDs for international standardization
- Search by country to find regional institutions
- Use short names for common abbreviations (MIT, CERN, etc.)

**Example Prompts:**
- "Find organizations in Germany working on AI"
- "Search for universities with ROR ID"

---

### search_projects

**Purpose:** Discover funded research projects and grants across international funding bodies.

**Implementation:** [packages/mcp/src/tools/projects.ts](../packages/mcp/src/tools/projects.ts)

**API Target:** OpenAIRE Graph API V1
- **Base URL:** `https://api.openaire.eu`
- **Endpoint:** `GET /graph/v1/projects`

**Example Request:**
```http
GET https://api.openaire.eu/graph/v1/projects?fundingStreamId=H2020&keywords=artificial%20intelligence&page=1&pageSize=50
```

**Example MCP Tool Call:**
```json
{
  "fundingStreamId": "H2020",
  "keywords": "artificial intelligence",
  "pageSize": 50,
  "sortBy": "startDate",
  "sortDirection": "DESC"
}
```

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `search` | string | General search query |
| `title` | string | Project title |
| `keywords` | string | Project keywords |
| `code` | string | Grant agreement code |
| `acronym` | string | Project acronym |
| `fundingShortName` | string | Funder name (EC, NSF, NIH, etc.) |
| `fundingStreamId` | string | Funding program (H2020, FP7, Horizon Europe) |
| `fromStartDate` | string | Minimum start date (YYYY or YYYY-MM-DD) |
| `toStartDate` | string | Maximum start date |
| `fromEndDate` | string | Minimum end date |
| `toEndDate` | string | Maximum end date |
| `relOrganizationName` | string | Participating organization name |
| `relOrganizationId` | string | Organization OpenAIRE ID |
| `relOrganizationCountryCode` | string | Organization country |
| `page` | number | Page number (default: 1) |
| `pageSize` | number | Results per page (1-100, default: 10) |
| `sortBy` | enum | relevance, startDate, endDate |
| `sortDirection` | enum | ASC, DESC (default: DESC) |

**Returns:**
```typescript
{
  totalResults: number,
  results: [
    {
      id: string,
      code: string,
      title: string,
      acronym?: string,
      startDate: string,
      endDate: string,
      keywords: string[],
      funding: {
        funder: string,
        fundingStream: string,
        fundingStreamId: string
      },
      organizations: Organization[],
      summary?: string
    }
  ]
}
```

**Usage Guidance:**
- Use `fundingStreamId` to filter by specific programs (H2020, FP7)
- Combine with `relOrganizationCountryCode` for regional analysis
- Use date filters for active projects

**Example Prompts:**
- "Find H2020 projects about renewable energy"
- "Search for NSF-funded AI projects in the US"

---

### search_data_sources

**Purpose:** Find repositories, journals, data archives, and CRIS systems.

**Implementation:** [packages/mcp/src/tools/datasources.ts](../packages/mcp/src/tools/datasources.ts)

**API Target:** OpenAIRE Graph API V1
- **Base URL:** `https://api.openaire.eu`
- **Endpoint:** `GET /graph/v1/dataSources`

**Example Request:**
```http
GET https://api.openaire.eu/graph/v1/dataSources?dataSourceTypeName=Data%20Repository&subjects=genomics&page=1&pageSize=50
```

**Example MCP Tool Call:**
```json
{
  "type": "Data Repository",
  "subjects": "genomics",
  "pageSize": 50
}
```

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `search` | string | General search query |
| `officialName` | string | Repository official name |
| `type` | string | Repository type (Institutional Repository, Data Repository, Journal, etc.) |
| `subjects` | string | Subject areas covered |
| `contentTypes` | string | Content types (Articles, Datasets, Software) |
| `relOrganizationId` | string | Operating organization ID |
| `page` | number | Page number (default: 1) |
| `pageSize` | number | Results per page (1-100, default: 10) |

**Returns:**
```typescript
{
  totalResults: number,
  results: [
    {
      id: string,
      officialName: string,
      type: string,
      country: string,
      websiteUrl: string,
      contentTypes: string[],
      subjects: string[],
      organization?: Organization
    }
  ]
}
```

**Usage Guidance:**
- Filter by `type` to find specific repository categories
- Use `contentTypes` to find repositories for specific content
- Combine with subject filters for domain-specific repositories

**Example Prompts:**
- "Find data repositories for genomics"
- "Search for institutional repositories in Europe"

---

## Citation Analysis Tools

These tools use **BIP! (Bibliometric Impact Predictor)** citation classes to identify research by impact level.

**Citation Classes:**
- **C1** - Top 0.01% (absolute leaders)
- **C2** - Top 0.1% (highly influential)
- **C3** - Top 1% (significant impact)
- **C4** - Top 10% (above average)
- **C5** - Average impact

### find_by_influence_class

**Purpose:** Find papers with sustained long-term research impact (seminal works, foundational papers).

**Implementation:** [packages/mcp/src/tools/highly-cited.ts](../packages/mcp/src/tools/highly-cited.ts)

**API Target:** OpenAIRE Graph API V2
- **Base URL:** `https://api.openaire.eu`
- **Endpoint:** `GET /graph/v2/researchProducts` (with `influenceClass` filter)

**Example Request:**
```http
GET https://api.openaire.eu/graph/v2/researchProducts?search=deep%20learning&influenceClass=C1&sortBy=influence%20DESC&pageSize=50
```

**Example MCP Tool Call:**
```json
{
  "citationClass": "C1",
  "search": "deep learning",
  "fromPublicationDate": "2015",
  "detail": "standard",
  "pageSize": 50
}
```

**Metric Explanation:**
- Measures overall long-term impact and sustained influence
- Best for finding foundational research and seminal works
- Papers that have shaped their field over many years

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `citationClass` | enum | C1, C2, C3, C4, C5 (default: C1) |
| `search` | string | Topic filter (optional) |
| `subjects` | string | Subject classification filter |
| `type` | enum | publication, dataset, software, all (default: publication) |
| `fromPublicationDate` | string | Start date (YYYY or YYYY-MM-DD) |
| `toPublicationDate` | string | End date (YYYY or YYYY-MM-DD) |
| `page` | number | Page number (default: 1) |
| `pageSize` | number | Results per page (1-100, default: 50) |
| `detail` | enum | minimal, standard, full (default: standard) |

**Returns:** Research products with influence metrics included.

**Usage Guidance:**
- Use for "seminal works", "foundational papers", "most influential"
- Default to C1 for truly exceptional papers
- Use C2-C3 for broader influential work
- Combine with broad date ranges for historical perspective

**Example Prompts:**
- "Find the most influential papers in machine learning"
- "Show me seminal works in quantum computing"
- "Find foundational research in CRISPR technology"

---

### find_by_popularity_class

**Purpose:** Find papers with current attention and recent impact (trending papers, hot topics).

**Implementation:** [packages/mcp/src/tools/highly-cited.ts](../packages/mcp/src/tools/highly-cited.ts)

**API Target:** OpenAIRE Graph API V2
- **Base URL:** `https://api.openaire.eu`
- **Endpoint:** `GET /graph/v2/researchProducts` (with `popularityClass` filter)

**Example Request:**
```http
GET https://api.openaire.eu/graph/v2/researchProducts?search=large%20language%20models&popularityClass=C1&fromPublicationDate=2023&sortBy=popularity%20DESC&pageSize=100
```

**Example MCP Tool Call:**
```json
{
  "citationClass": "C1",
  "search": "large language models",
  "fromPublicationDate": "2023",
  "detail": "minimal",
  "pageSize": 100
}
```

**Metric Explanation:**
- Measures current attention and recent citation activity
- Best for identifying trending research and hot topics
- Papers receiving significant attention right now

**Parameters:** Same as `find_by_influence_class`

**Usage Guidance:**
- Use for "trending", "hot papers", "current research focus"
- Combine with recent date filters (2023-2025)
- Best for understanding what's popular NOW

**Example Prompts:**
- "What are the trending papers in AI?"
- "Show me hot topics in climate science"
- "Find currently popular research in immunology"

---

### find_by_impulse_class

**Purpose:** Find papers with strong initial momentum after publication (breakthrough discoveries, rapid adoption).

**Implementation:** [packages/mcp/src/tools/highly-cited.ts](../packages/mcp/src/tools/highly-cited.ts)

**API Target:** OpenAIRE Graph API V2
- **Base URL:** `https://api.openaire.eu`
- **Endpoint:** `GET /graph/v2/researchProducts` (with `impulseClass` filter)

**Example Request:**
```http
GET https://api.openaire.eu/graph/v2/researchProducts?search=CRISPR&impulseClass=C1&fromPublicationDate=2012&toPublicationDate=2020&sortBy=impulse%20DESC
```

**Example MCP Tool Call:**
```json
{
  "citationClass": "C1",
  "search": "CRISPR",
  "fromPublicationDate": "2012",
  "toPublicationDate": "2020",
  "detail": "full",
  "pageSize": 20
}
```

**Metric Explanation:**
- Measures initial impact directly after publication
- Best for breakthrough discoveries and rapid early adoption
- Papers that made an immediate splash in their field

**Parameters:** Same as `find_by_influence_class`

**Usage Guidance:**
- Use for "breakthrough", "rapid adoption", "initial impact"
- Look for papers that gained citations quickly
- Combine with recent years to find emerging breakthroughs

**Example Prompts:**
- "Find breakthrough papers in gene editing"
- "Show me rapidly adopted research in deep learning"
- "Find papers with strong initial impact in materials science"

---

### find_by_citation_count_class

**Purpose:** Find papers by raw total citation count (most cited papers, citation leaders).

**Implementation:** [packages/mcp/src/tools/highly-cited.ts](../packages/mcp/src/tools/highly-cited.ts)

**API Target:** OpenAIRE Graph API V2
- **Base URL:** `https://api.openaire.eu`
- **Endpoint:** `GET /graph/v2/researchProducts` (with `citationCountClass` filter)

**Example Request:**
```http
GET https://api.openaire.eu/graph/v2/researchProducts?search=neuroscience&citationCountClass=C1&sortBy=citationCount%20DESC&pageSize=50
```

**Example MCP Tool Call:**
```json
{
  "citationClass": "C1",
  "search": "neuroscience",
  "detail": "standard",
  "pageSize": 50
}
```

**Metric Explanation:**
- Measures total citation count (simple sum)
- Best for identifying citation leaders
- Raw volume without temporal adjustment

**Parameters:** Same as `find_by_influence_class`

**Usage Guidance:**
- Use for "most cited", "citation leaders", "highly cited works"
- Simpler metric than influence/popularity/impulse
- Good for general "top papers" queries

**Example Prompts:**
- "Find the most cited papers in neuroscience"
- "Show me citation leaders in renewable energy"
- "Find highly cited works in computational biology"

---

## Network Analysis Tools

### get_citation_network

**Purpose:** Build citation network graphs showing citing papers, cited papers, and multi-level relationships.

**Implementation:** [packages/mcp/src/tools/citations.ts](../packages/mcp/src/tools/citations.ts)

**API Target:** ScholeXplorer API V3 + OpenAIRE Graph API V2
- **ScholeXplorer Base URL:** `https://api-beta.scholexplorer.openaire.eu/v3`
- **Endpoint:** `GET /Links` (for citation relationships)
- **OpenAIRE API:** Used for fetching paper metadata

**Example Request:**
```http
GET https://api-beta.scholexplorer.openaire.eu/v3/Links?sourcePid=10.1038/nature12345&relation=Cites&limit=100
GET https://api-beta.scholexplorer.openaire.eu/v3/Links?targetPid=10.1038/nature12345&relation=Cites&limit=100
```

**Example MCP Tool Call:**
```json
{
  "identifier": "10.1038/nature12345",
  "depth": 1,
  "direction": "both",
  "maxNodes": 200
}
```

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `identifier` | string | DOI or OpenAIRE ID (DOIs strongly preferred) |
| `depth` | enum | 1 (direct), 2 (multi-level). Default: 1 |
| `direction` | enum | citations (papers citing this), references (papers cited by this), both. Default: both |
| `maxNodes` | number | Maximum nodes (1-1000, default: 200) |

**Returns:**
```typescript
{
  centerPaper: {
    id: string,
    doi: string,
    title: string,
    year: number,
    citationCount: number
  },
  network: {
    nodes: [
      {
        id: string,
        doi: string,
        title: string,
        year: number,
        citationCount: number,
        type: 'center' | 'citation' | 'reference',
        level: number  // Distance from center (0, 1, 2)
      }
    ],
    edges: [
      {
        source: string,
        target: string,
        type: 'cites'
      }
    ]
  },
  statistics: {
    totalNodes: number,
    totalEdges: number,
    citingPapers: number,
    referencedPapers: number,
    depth: number
  }
}
```

**Usage Guidance:**
- **Always use DOIs**, not OpenAIRE IDs (avoids 404 errors)
- Use `depth: 1` for focused analysis (50-200 nodes)
- Use `depth: 2` for comprehensive networks (200-1000+ nodes)
- For large networks (500+ nodes), save to files to avoid streaming issues
- Use `direction: 'citations'` to see impact (who cites this)
- Use `direction: 'references'` to see foundations (what this cites)

**Example Prompts:**
- "Build citation network for DOI 10.1038/nature12345"
- "Show me all papers citing this influential work (depth 2)"
- "Find the references network for this paper"

---

### analyze_coauthorship_network

**Purpose:** Build collaboration networks showing who works with whom.

**Implementation:** [packages/mcp/src/tools/authors.ts](../packages/mcp/src/tools/authors.ts)

**API Target:** OpenAIRE Graph API V2
- **Base URL:** `https://api.openaire.eu`
- **Endpoint:** `GET /graph/v2/researchProducts` (with author filters)

**Example Request:**
```http
GET https://api.openaire.eu/graph/v2/researchProducts?authorOrcid=0000-0001-2345-6789&pageSize=100
```

**Example MCP Tool Call:**
```json
{
  "orcid": "0000-0001-2345-6789",
  "maxDepth": 1,
  "minCollaborations": 2,
  "limit": 100
}
```

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `orcid` OR `authorName` | string | Author identifier (one required) |
| `maxDepth` | enum | 1 (direct collaborators), 2 (extended community). Default: 1 |
| `minCollaborations` | number | Minimum co-authored papers (default: 1) |
| `limit` | number | Max publications to analyze (1-500, default: 100) |

**Returns:**
```typescript
{
  centerAuthor: {
    name: string,
    orcid?: string,
    publicationCount: number
  },
  network: {
    nodes: [
      {
        id: string,
        name: string,
        orcid?: string,
        publicationCount: number,
        collaborationCount: number,  // Papers with center author
        level: number  // Distance from center (0, 1, 2)
      }
    ],
    edges: [
      {
        source: string,
        target: string,
        weight: number  // Number of co-authored papers
      }
    ]
  },
  statistics: {
    totalCollaborators: number,
    totalCollaborations: number,
    averageCollaborationsPerAuthor: number
  }
}
```

**Usage Guidance:**
- Use ORCID for accurate author identification
- Set `minCollaborations: 2+` to filter out one-off collaborations
- Use `maxDepth: 1` for immediate team, `2` for research community
- Increase `limit` for more comprehensive analysis (but slower)

**Example Prompts:**
- "Show me the collaboration network for author with ORCID 0000-0001-2345-6789"
- "Find frequent collaborators of Jane Smith"
- "Build extended research community network for this author"

---

### build_subgraph_from_dois

**Purpose:** Build a network showing ONLY relationships between a specific set of papers (curated literature, project outputs).

**Implementation:** [packages/mcp/src/tools/subgraph.ts](../packages/mcp/src/tools/subgraph.ts)

**API Target:** ScholeXplorer API V3 + OpenAIRE Graph API V2
- **ScholeXplorer Base URL:** `https://api-beta.scholexplorer.openaire.eu/v3`
- **Endpoint:** `GET /Links` (for each DOI pair)
- **OpenAIRE API:** Used for fetching paper metadata

**Example Request:**
```http
# For each DOI pair, check relationships
GET https://api-beta.scholexplorer.openaire.eu/v3/Links?sourcePid=10.1038/nature123&targetPid=10.1126/science456&limit=100
```

**Example MCP Tool Call:**
```json
{
  "dois": [
    "10.1038/nature123",
    "10.1126/science456",
    "10.1016/cell789"
  ],
  "fetchMetadata": true,
  "includeRelationTypes": ["Cites", "IsSupplementTo"]
}
```

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `dois` | array | Array of DOIs (2-100 required) |
| `includeRelationTypes` | array | Filter to specific types (optional). See explore_research_relationships for types |
| `fetchMetadata` | boolean | Fetch full paper metadata (default: true) |

**Returns:**
```typescript
{
  nodes: [
    {
      doi: string,
      title: string,
      year: number,
      authors: Author[],
      // ... metadata if fetchMetadata: true
    }
  ],
  edges: [
    {
      source: string,  // DOI
      target: string,  // DOI
      relationType: string  // Cites, IsSupplementTo, etc.
    }
  ],
  statistics: {
    totalNodes: number,
    totalRelationships: number,
    relationshipTypes: {
      [type: string]: number
    }
  }
}
```

**Usage Guidance:**
- Perfect for analyzing relationships within a curated set of papers
- Use for project literature reviews, specific research threads
- Does NOT include external citations (only internal connections)
- Use with 10-50 papers for best results

**Example Prompts:**
- "Show relationships between these 10 papers from my literature review"
- "Build network for project outputs (DOI list)"
- "Find internal citations in this paper collection"

---

## Author & Project Intelligence Tools

### get_author_profile

**Purpose:** Comprehensive researcher profile with all publications, collaborators, and research areas.

**Implementation:** [packages/mcp/src/tools/authors.ts](../packages/mcp/src/tools/authors.ts)

**API Target:** OpenAIRE Graph API V2
- **Base URL:** `https://api.openaire.eu`
- **Endpoint:** `GET /graph/v2/researchProducts` (with author filters)

**Example Request:**
```http
GET https://api.openaire.eu/graph/v2/researchProducts?authorOrcid=0000-0001-2345-6789&pageSize=100&sortBy=publicationDate%20DESC
```

**Example MCP Tool Call:**
```json
{
  "orcid": "0000-0001-2345-6789",
  "limit": 100,
  "includeCoAuthors": true
}
```

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `orcid` OR `authorName` | string | Author identifier (one required, ORCID preferred) |
| `limit` | number | Max publications (1-500, default: 100) |
| `includeCoAuthors` | boolean | Include collaboration analysis (default: true) |

**Returns:**
```typescript
{
  author: {
    name: string,
    orcid?: string
  },
  publications: [
    {
      doi: string,
      title: string,
      year: number,
      citationCount: number,
      type: string,
      openAccess: boolean
    }
  ],
  statistics: {
    totalPublications: number,
    totalCitations: number,
    yearRange: { first: number, last: number },
    publicationsPerYear: number,
    averageCitationsPerPaper: number
  },
  topCollaborators?: [
    {
      name: string,
      orcid?: string,
      collaborationCount: number
    }
  ],
  researchAreas: [
    {
      subject: string,
      count: number
    }
  ]
}
```

**Usage Guidance:**
- Always use ORCID when available for accurate matching
- Set `limit: 500` for comprehensive profiles
- Use `includeCoAuthors: true` to understand collaboration patterns
- Results include DOIs for further analysis

**Example Prompts:**
- "Get profile for author with ORCID 0000-0001-2345-6789"
- "Show me all publications by John Smith"
- "Find research areas and collaborators for this author"

---

### get_project_outputs

**Purpose:** Get all research outputs (publications, datasets, software) produced by a funded project.

**Implementation:** [packages/mcp/src/tools/projects.ts](../packages/mcp/src/tools/projects.ts)

**API Target:** OpenAIRE Graph API V2
- **Base URL:** `https://api.openaire.eu`
- **Endpoint:** `GET /graph/v2/researchProducts` (with project filters)

**Example Request:**
```http
GET https://api.openaire.eu/graph/v2/researchProducts?relProjectCode=123456&pageSize=100&sortBy=publicationDate%20DESC
```

**Example MCP Tool Call:**
```json
{
  "projectCode": "123456",
  "type": "all",
  "pageSize": 100,
  "sortBy": "date"
}
```

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `projectId` OR `projectCode` | string | Project identifier (one required) |
| `type` | enum | publication, dataset, software, all (default: all) |
| `pageSize` | number | Results per page (1-100, default: 100) |
| `sortBy` | enum | date, popularity, relevance (default: date) |

**Returns:**
```typescript
{
  project: {
    id: string,
    code: string,
    title: string,
    funder: string
  },
  outputs: [
    {
      doi: string,
      title: string,
      year: number,
      type: string,
      citationCount?: number,
      openAccess: boolean
    }
  ],
  statistics: {
    totalOutputs: number,
    byType: {
      publication: number,
      dataset: number,
      software: number
    },
    openAccessCount: number,
    totalCitations: number
  }
}
```

**Usage Guidance:**
- Use project grant codes for easier identification
- Filter by `type` to focus on specific outputs
- Results include DOIs for network analysis
- Use for project ROI and impact assessment

**Example Prompts:**
- "Get all outputs from H2020 project with code 123456"
- "Show me publications from this NSF grant"
- "Find datasets produced by this EU project"

---

## Semantic Relationship Tools

### explore_research_relationships

**Purpose:** Discover semantic relationships beyond citations using ScholeXplorer (supplements, versions, datasets, documentation).

**Implementation:** [packages/mcp/src/tools/relationships.ts](../packages/mcp/src/tools/relationships.ts)

**API Target:** ScholeXplorer API V3
- **Base URL:** `https://api-beta.scholexplorer.openaire.eu/v3`
- **Endpoint:** `GET /Links`

**Example Request:**
```http
GET https://api-beta.scholexplorer.openaire.eu/v3/Links?sourcePid=10.1038/nature12345&relation=IsSupplementTo&limit=50
```

**Example MCP Tool Call:**
```json
{
  "identifier": "10.1038/nature12345",
  "relationType": "IsSupplementTo",
  "targetType": "dataset",
  "limit": 50
}
```

**Supported Relationship Types (19 total):**
- **Cites** / **IsCitedBy** - Citation relationships
- **IsSupplementTo** / **IsSupplementedBy** - Supplementary materials
- **HasPart** / **IsPartOf** - Component relationships
- **IsNewVersionOf** / **IsPreviousVersionOf** - Version control
- **IsSourceOf** / **IsDerivedFrom** - Derivation relationships
- **Documents** / **IsDocumentedBy** - Documentation
- **Compiles** / **IsCompiledBy** - Compilation relationships
- **IsIdenticalTo** - Duplicate records
- **IsRelatedTo** - General relationships
- **References** / **IsReferencedBy** - Reference links
- **IsReviewedBy** - Peer review relationships

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `identifier` | string | DOI or PID (required) |
| `relationType` | string | Filter to specific type (optional) |
| `targetType` | enum | publication, dataset, software, other, all (default: all) |
| `limit` | number | Max relationships (1-100, default: 50) |

**Returns:**
```typescript
{
  source: {
    identifier: string,
    title: string,
    type: string
  },
  relationships: [
    {
      relationType: string,
      target: {
        identifier: string,
        doi?: string,
        title: string,
        type: string,
        year?: number
      }
    }
  ],
  statistics: {
    totalRelationships: number,
    byType: {
      [relationType: string]: number
    },
    byTargetType: {
      publication: number,
      dataset: number,
      software: number,
      other: number
    }
  }
}
```

**Usage Guidance:**
- Use to find datasets associated with publications
- Find supplementary materials and appendices
- Discover version history and updates
- Identify documentation and related works
- Filter by `relationType` for specific relationship types
- Filter by `targetType` to find specific content (e.g., datasets only)

**Example Prompts:**
- "Find datasets associated with DOI 10.1038/nature12345"
- "Show me all supplements for this paper"
- "Find previous versions of this publication"
- "Discover documentation for this software"

---

## Trends & Temporal Analysis Tools

### analyze_research_trends

**Purpose:** Track publication counts over time, identify growth patterns, and discover emerging topics.

**Implementation:** [packages/mcp/src/tools/trends.ts](../packages/mcp/src/tools/trends.ts)

**API Target:** OpenAIRE Graph API V2
- **Base URL:** `https://api.openaire.eu`
- **Endpoint:** Multiple `GET /graph/v2/researchProducts` requests (one per year)

**Example Request:**
```http
# Year-by-year requests
GET https://api.openaire.eu/graph/v2/researchProducts?search=machine%20learning&fromPublicationDate=2015&toPublicationDate=2015&pageSize=1
GET https://api.openaire.eu/graph/v2/researchProducts?search=machine%20learning&fromPublicationDate=2016&toPublicationDate=2016&pageSize=1
# ... (one request per year in range)
```

**Example MCP Tool Call:**
```json
{
  "search": "machine learning",
  "fromYear": 2015,
  "toYear": 2025,
  "type": "publication"
}
```

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `search` | string | Topic to track (required) |
| `fromYear` | number | Start year (1900-2100, required) |
| `toYear` | number | End year (1900-2100, required) |
| `subjects` | string | Subject classification filter |
| `type` | enum | publication, dataset, software, all (default: all) |

**Note:** Maximum year range is 50 years.

**Returns:**
```typescript
{
  topic: string,
  yearRange: { from: number, to: number },
  data: [
    {
      year: number,
      count: number
    }
  ],
  statistics: {
    totalPublications: number,
    peakYear: {
      year: number,
      count: number
    },
    averagePerYear: number,
    growthRate: {
      overall: number,        // % change from first to last year
      recentYears: number     // % change in last 3 years
    },
    trend: 'growing' | 'stable' | 'declining'
  }
}
```

**Usage Guidance:**
- Use for topic evolution analysis
- Identify inflection points and growth acceleration
- Compare different time periods
- Combine with Bash for advanced analytics (moving averages, growth rates)
- Look for emerging topics (rapid recent growth)
- Identify mature fields (stabilization patterns)

**Example Prompts:**
- "Analyze trends in machine learning from 2010 to 2025"
- "Show me publication growth in CRISPR technology"
- "Track research evolution in quantum computing over 20 years"
- "Identify emerging topics in renewable energy (2020-2025)"

---

## Common Patterns & Best Practices

### Identifier Handling

**DOIs vs OpenAIRE IDs:**
- **ALWAYS prefer DOIs** (e.g., "10.1038/nature12345")
- OpenAIRE internal IDs (e.g., "doi_________::4637e...") often fail in network tools
- Extract DOIs from search results for handoff to network analysis
- If you receive OpenAIRE IDs, look for DOI fields in the response

### Detail Level Selection

Choose the right detail level to prevent response truncation:

| Result Count | Recommended Detail | Bytes/Paper | Includes |
|--------------|-------------------|-------------|----------|
| 50+ papers | minimal | ~80 | Title, year, DOI, citation metrics |
| 20-50 papers | standard | ~200 | + First 3 authors, openAccess |
| <20 papers | full | ~482 | + 500-char abstract, 10 authors, subjects |

### Pagination Strategies

**Basic Pagination (≤10K records):**
```typescript
{
  page: 1,
  pageSize: 100
}
```

**Cursor-Based Pagination (>10K records):**
```typescript
// First request
{ cursor: "*", pageSize: 100 }

// Subsequent requests
{ cursor: response.nextCursor, pageSize: 100 }
```

### Large Network Handling

For networks with 500+ nodes:
1. Save network to file using Write tool
2. Merge multiple networks with Bash + jq
3. Load merged result with Read tool
4. Pass to visualization
5. Prevents streaming timeout issues

### Search Optimization

**Efficient Searches:**
- Start with focused queries (use specific fields)
- Apply filters early (date, type, citation class)
- Use citation metrics to reduce result sets
- Prefer `mainTitle` over general `query` when searching titles

**Inefficient Searches:**
- Broad queries without filters
- Multiple searches when one targeted search would work
- Iterating through citation classes (make ONE query)
- Using general `query` for everything

---

## Tool Selection Guide

**When to use each tool:**

| User Goal | Recommended Tool |
|-----------|------------------|
| Find papers by topic | `search_research_products` |
| Find influential papers | `find_by_influence_class` |
| Find trending papers | `find_by_popularity_class` |
| Find breakthrough papers | `find_by_impulse_class` |
| Find most cited papers | `find_by_citation_count_class` |
| Get paper details | `get_research_product_details` |
| Build citation network | `get_citation_network` |
| Find collaborators | `analyze_coauthorship_network` or `get_author_profile` |
| Get author publications | `get_author_profile` |
| Find datasets | `search_datasets` |
| Find institutions | `search_organizations` |
| Find funded projects | `search_projects` |
| Get project outputs | `get_project_outputs` |
| Find repositories | `search_data_sources` |
| Find supplements/versions | `explore_research_relationships` |
| Track topic evolution | `analyze_research_trends` |
| Analyze paper collection | `build_subgraph_from_dois` |

---

[Back to Main Documentation](./README.md) | [Frontend Agents →](./frontend-agents.md)
