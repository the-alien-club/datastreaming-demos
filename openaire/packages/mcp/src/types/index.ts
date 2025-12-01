// Core Research Types
export interface ResearchProduct {
  id: string;
  type: 'publication' | 'dataset' | 'software' | 'other';
  title: string;
  authors: Author[];
  publicationDate: string;
  abstract?: string;
  doi?: string;
  url?: string;
  publisher?: string;
  journal?: string;
  citations: number;
  openAccessColor?: 'gold' | 'green' | 'bronze' | 'hybrid';
  peerReviewed: boolean;
  subjects: string[];
  funding?: FundingInfo[];
  metrics?: QualityMetrics;
}

export interface Author {
  name: string;
  orcid?: string;
  affiliation?: string;
}

export interface FundingInfo {
  funder: string;
  project?: string;
  grantId?: string;
}

export interface QualityMetrics {
  influence: number;
  popularity: number;
  impulse: number;
}

// Search Request/Response - FULLY ALIGNED with OpenAIRE Graph API V2
export interface SearchRequest {
  // Basic search parameters
  query?: string;
  logicalOperator?: 'AND' | 'OR' | 'NOT';
  mainTitle?: string;
  description?: string;

  // Identifiers (arrays for OR logic)
  id?: string[];
  pid?: string[];
  originalId?: string[];

  // Type and classification
  type?: ('publication' | 'dataset' | 'software' | 'other')[];
  subjects?: string[];

  // Author filters (arrays for OR logic)
  authorFullName?: string[];
  authorOrcid?: string[];

  // Publisher and venue
  publisher?: string[];
  countryCode?: string[];

  // Date range
  fromPublicationDate?: string;
  toPublicationDate?: string;

  // Access rights (arrays for OR logic)
  bestOpenAccessRightLabel?: ('OPEN SOURCE' | 'OPEN' | 'EMBARGO' | 'RESTRICTED' | 'CLOSED' | 'UNKNOWN')[];
  openAccessColor?: ('bronze' | 'gold' | 'hybrid')[];

  // Citation metrics (arrays for OR logic)
  influenceClass?: ('C1' | 'C2' | 'C3' | 'C4' | 'C5')[];
  popularityClass?: ('C1' | 'C2' | 'C3' | 'C4' | 'C5')[];
  impulseClass?: ('C1' | 'C2' | 'C3' | 'C4' | 'C5')[];
  citationCountClass?: ('C1' | 'C2' | 'C3' | 'C4' | 'C5')[];

  // Publication-specific filters
  instanceType?: string[];
  sdg?: number[];
  fos?: string[];

  // Boolean flags (publication-specific)
  isPeerReviewed?: boolean;
  isInDiamondJournal?: boolean;
  isPubliclyFunded?: boolean;
  isGreen?: boolean;

  // Relationship filters (arrays for OR logic)
  relOrganizationId?: string[];
  relCommunityId?: string[];
  relProjectId?: string[];
  relProjectCode?: string[];
  hasProjectRel?: boolean;
  relProjectFundingShortName?: string[];
  relProjectFundingStreamId?: string[];
  relHostingDataSourceId?: string[];
  relCollectedFromDatasourceId?: string[];

  // Pagination
  page?: number;
  limit?: number;
  pageSize?: number;
  cursor?: string;

  // Sorting - format: "field ASC|DESC", comma-separated for multiple
  sortBy?: string;

  // Legacy/compatibility fields (kept for backward compatibility)
  openAccess?: boolean;
  peerReviewed?: boolean;
  dateRange?: {
    from?: string;
    to?: string;
  };
}

export interface SearchResponse {
  results: ResearchProduct[];
  total: number;
  page: number;
  pageSize: number;
  nextCursor?: string; // For cursor-based pagination
}

// Citation Network Types
export interface CitationNetwork {
  nodes: NetworkNode[];
  edges: NetworkEdge[];
  center: string;
  metadata: {
    totalNodes: number;
    totalEdges: number;
    depth: number;
    generatedAt: string;
  };
}

export interface NetworkNode {
  id: string;
  type: 'publication' | 'dataset' | 'software' | 'other';
  title: string;
  year: number;
  citations: number;
  level: number;
  openAccess: boolean;
}

export interface NetworkEdge {
  source: string;
  target: string;
  type: 'cites' | 'isCitedBy' | 'references';
  weight?: number;
}

// Citation API Types
export interface CitationRequest {
  source?: string;
  target?: string;
  relationType?: 'cites' | 'isCitedBy';
}

export interface CitationLink {
  source: {
    identifier: string;
    type: string;
    title: string;
    publicationDate?: string;
  };
  target: {
    identifier: string;
    type: string;
    title: string;
    publicationDate?: string;
  };
  relationType: string;
  linkProvider: string;
}

// API Error Types
export class OpenAIREError extends Error {
  constructor(
    public code: string,
    public status: number,
    message: string
  ) {
    super(message);
    this.name = 'OpenAIREError';
  }
}

// Cache Types
export interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

// Logger Types
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

// Organization Types
export interface Organization {
  id: string;
  legalName: string;
  legalShortName?: string;
  alternativeNames?: string[];
  websiteUrl?: string;
  country?: {
    code: string;
    label: string;
  };
  pids?: Array<{
    scheme: string;
    value: string;
  }>;
}

export interface OrganizationSearchRequest {
  search?: string;
  legalName?: string;
  legalShortName?: string;
  pid?: string;
  countryCode?: string;
  page?: number;
  pageSize?: number;
  cursor?: string;
}

export interface OrganizationSearchResponse {
  results: Organization[];
  total: number;
  page: number;
  pageSize: number;
  nextCursor?: string;
}

// Project Types
export interface Project {
  id: string;
  code?: string;
  acronym?: string;
  title: string;
  keywords?: string[];
  startDate?: string;
  endDate?: string;
  funding?: {
    funder: {
      name: string;
      shortName: string;
      jurisdiction: string;
    };
    fundingStream?: string;
  };
  organizations?: Array<{
    id: string;
    name: string;
    role: string;
  }>;
  summary?: string;
}

export interface ProjectSearchRequest {
  search?: string;
  title?: string;
  keywords?: string;
  code?: string;
  acronym?: string;
  fundingShortName?: string;
  fundingStreamId?: string;
  fromStartDate?: string;
  toStartDate?: string;
  fromEndDate?: string;
  toEndDate?: string;
  relOrganizationName?: string;
  relOrganizationId?: string;
  relOrganizationCountryCode?: string;
  page?: number;
  pageSize?: number;
  cursor?: string;
  sortBy?: 'relevance' | 'startDate' | 'endDate';
  sortDirection?: 'ASC' | 'DESC';
}

export interface ProjectSearchResponse {
  results: Project[];
  total: number;
  page: number;
  pageSize: number;
  nextCursor?: string;
}

// Author/Person Types
export interface AuthorProfile {
  orcid?: string;
  name: string;
  publications: ResearchProduct[];
  totalPublications: number;
  coAuthors: Array<{
    name: string;
    orcid?: string;
    collaborationCount: number;
  }>;
  researchAreas: string[];
  affiliations: Array<{
    organizationId?: string;
    organizationName?: string;
    startDate?: string;
    endDate?: string;
  }>;
}

export interface AuthorProfileRequest {
  orcid?: string;
  authorName?: string;
  limit?: number;
  includeCoAuthors?: boolean;
}

// Dataset Search Types
export interface DatasetSearchRequest {
  search?: string;
  title?: string;
  description?: string;
  subjects?: string;
  publisher?: string;
  openAccessOnly?: boolean;
  fromPublicationDate?: string;
  toPublicationDate?: string;
  relProjectId?: string;
  relOrganizationId?: string;
  page?: number;
  pageSize?: number;
  sortBy?: 'relevance' | 'date' | 'popularity';
  sortDirection?: 'ASC' | 'DESC';
}

// Co-authorship Network Types
export interface CoAuthorshipNetwork {
  nodes: CoAuthorNode[];
  edges: CoAuthorEdge[];
  centerAuthor: {
    name: string;
    orcid?: string;
  };
  metadata: {
    totalAuthors: number;
    totalCollaborations: number;
    generatedAt: string;
  };
}

export interface CoAuthorNode {
  id: string; // orcid or name
  name: string;
  orcid?: string;
  publicationCount: number;
  affiliations?: string[];
}

export interface CoAuthorEdge {
  source: string;
  target: string;
  weight: number; // number of co-authored papers
  papers: string[]; // paper titles or IDs
}

// Data Source Types
export interface DataSource {
  id: string;
  officialName: string;
  englishName?: string;
  legalShortName?: string;
  websiteUrl?: string;
  type?: string;
  subjects?: string[];
  contentTypes?: string[];
  country?: {
    code: string;
    label: string;
  };
  organization?: {
    id: string;
    name: string;
  };
}

export interface DataSourceSearchRequest {
  search?: string;
  officialName?: string;
  type?: string;
  subjects?: string;
  contentTypes?: string;
  relOrganizationId?: string;
  page?: number;
  pageSize?: number;
}

export interface DataSourceSearchResponse {
  results: DataSource[];
  total: number;
  page: number;
  pageSize: number;
}

// Research Trends Types
export interface ResearchTrend {
  year: number;
  count: number;
  breakdown?: {
    publications: number;
    datasets: number;
    software: number;
  };
}

export interface ResearchTrendsRequest {
  search: string;
  subjects?: string;
  fromYear: number;
  toYear: number;
  type?: 'publication' | 'dataset' | 'software' | 'all';
}

export interface ResearchTrendsResponse {
  query: string;
  timeRange: {
    from: number;
    to: number;
  };
  trends: ResearchTrend[];
  summary: {
    totalPapers: number;
    averagePerYear: number;
    peakYear: number;
    peakCount: number;
  };
}

// Relationship Types (ScholeXplorer)
export interface RelationshipExploration {
  sourceId: string;
  relationships: RelationshipLink[];
  summary: {
    totalRelationships: number;
    byType: Record<string, number>;
    byTargetType: Record<string, number>;
  };
}

export interface RelationshipLink {
  relationType: string;
  target: {
    identifier: string;
    type: string;
    title: string;
    publicationDate?: string;
  };
  linkProvider: string;
}

// Subgraph Types
export interface SubgraphRequest {
  dois: string[];
  includeRelationTypes?: string[];
  fetchMetadata?: boolean;
}

export interface SubgraphResponse {
  nodes: SubgraphNode[];
  edges: SubgraphEdge[];
  statistics: {
    totalNodes: number;
    totalEdges: number;
    relationshipTypes: Record<string, number>;
    isolatedNodes: number;
  };
}

export interface SubgraphNode {
  id: string; // DOI
  title?: string;
  type?: string;
  publicationDate?: string;
  authors?: Author[];
  citationCount?: number;
  openAccess?: boolean;
}

export interface SubgraphEdge {
  source: string; // DOI
  target: string; // DOI
  relationType: string;
  linkProvider: string;
}
