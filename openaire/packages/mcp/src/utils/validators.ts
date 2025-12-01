import { z } from 'zod';

// Search input validation schema - FULLY ALIGNED with OpenAIRE Graph API V2
export const SearchInputSchema = z.object({
  // Basic search parameters
  query: z.string().optional().describe('Keyword-based full-text search supporting logical operators (AND, OR, NOT)'),
  logicalOperator: z.enum(['AND', 'OR', 'NOT']).optional().describe('Combines multiple field queries (default: AND)'),
  mainTitle: z.string().optional().describe('Search within research product titles with logical operator support'),
  description: z.string().optional().describe('Search within product descriptions'),

  // Identifiers (arrays for OR logic)
  id: z.array(z.string()).optional().describe('OpenAIRE product IDs (OR logic)'),
  pid: z.array(z.string()).optional().describe('Persistent identifiers like DOI, PMID (OR logic)'),
  originalId: z.array(z.string()).optional().describe('Source system identifiers (OR logic)'),

  // Type and classification
  type: z.array(z.enum(['publication', 'dataset', 'software', 'other'])).optional().describe('Research product types (OR logic)'),
  subjects: z.array(z.string()).optional().describe('Associated subjects (OR logic)'),

  // Author filters (arrays for OR logic)
  authorFullName: z.array(z.string()).optional().describe('Author names (OR logic)'),
  authorOrcid: z.array(z.string()).optional().describe('Author ORCiDs (OR logic)'),

  // Publisher and venue
  publisher: z.array(z.string()).optional().describe('Publishing entities (OR logic)'),
  countryCode: z.array(z.string()).optional().describe('Country codes (OR logic)'),

  // Date range
  fromPublicationDate: z.string().optional().describe('Start date (YYYY or YYYY-MM-DD format)'),
  toPublicationDate: z.string().optional().describe('End date (YYYY or YYYY-MM-DD format)'),

  // Access rights (arrays for OR logic)
  bestOpenAccessRightLabel: z.array(z.enum(['OPEN SOURCE', 'OPEN', 'EMBARGO', 'RESTRICTED', 'CLOSED', 'UNKNOWN'])).optional().describe('Access rights labels (OR logic)'),
  openAccessColor: z.array(z.enum(['bronze', 'gold', 'hybrid'])).optional().describe('Open access colors for publications (OR logic)'),

  // Citation metrics (arrays for OR logic) - C1=top 0.01%, C2=top 0.1%, C3=top 1%, C4=top 10%, C5=average
  influenceClass: z.array(z.enum(['C1', 'C2', 'C3', 'C4', 'C5'])).optional().describe('Influence class - long-term impact (OR logic)'),
  popularityClass: z.array(z.enum(['C1', 'C2', 'C3', 'C4', 'C5'])).optional().describe('Popularity class - current attention (OR logic)'),
  impulseClass: z.array(z.enum(['C1', 'C2', 'C3', 'C4', 'C5'])).optional().describe('Impulse class - initial momentum (OR logic)'),
  citationCountClass: z.array(z.enum(['C1', 'C2', 'C3', 'C4', 'C5'])).optional().describe('Citation count class - total citations (OR logic)'),

  // Publication-specific filters (arrays for OR logic where applicable)
  instanceType: z.array(z.string()).optional().describe('Publication resource types (OR logic)'),
  sdg: z.array(z.number().min(1).max(17)).optional().describe('Sustainable Development Goals 1-17 (OR logic)'),
  fos: z.array(z.string()).optional().describe('Field of Science classifications (OR logic)'),

  // Boolean flags (publication-specific)
  isPeerReviewed: z.boolean().optional().describe('Peer review status (publications only)'),
  isInDiamondJournal: z.boolean().optional().describe('Diamond journal indicator (publications only)'),
  isPubliclyFunded: z.boolean().optional().describe('Public funding status (publications only)'),
  isGreen: z.boolean().optional().describe('Green open access model indicator (publications only)'),

  // Relationship filters (arrays for OR logic)
  relOrganizationId: z.array(z.string()).optional().describe('Connected organization IDs (OR logic)'),
  relCommunityId: z.array(z.string()).optional().describe('Connected community IDs (OR logic)'),
  relProjectId: z.array(z.string()).optional().describe('Connected project IDs (OR logic)'),
  relProjectCode: z.array(z.string()).optional().describe('Connected project codes (OR logic)'),
  hasProjectRel: z.boolean().optional().describe('Filter products with project connections'),
  relProjectFundingShortName: z.array(z.string()).optional().describe('Project funder names like EC, NSF (OR logic)'),
  relProjectFundingStreamId: z.array(z.string()).optional().describe('Project funding stream identifiers like H2020, FP7 (OR logic)'),
  relHostingDataSourceId: z.array(z.string()).optional().describe('Hosting data source IDs (OR logic)'),
  relCollectedFromDatasourceId: z.array(z.string()).optional().describe('Collecting data source IDs (OR logic)'),

  // Pagination
  page: z.number().min(1).default(1).describe('Page number (min: 1, default: 1); max 10,000 records with basic pagination'),
  pageSize: z.number().min(1).max(100).default(10).describe('Results per page (min: 1, max: 100, default: 10)'),
  cursor: z.string().optional().describe('Cursor-based pagination (start with "*"); use nextCursor for subsequent requests; required for >10K records'),

  // Sorting - format: "field ASC|DESC", comma-separated for multiple
  sortBy: z.string().optional().describe('Sort format: "field ASC|DESC" (e.g., "publicationDate DESC,influence ASC"). Valid fields: relevance, publicationDate, dateOfCollection, influence, popularity, citationCount, impulse. Default: "relevance DESC"'),

  // Response detail level
  detail: z.enum(['minimal', 'standard', 'full']).default('standard').describe('Response detail level: minimal (title/year/citations/doi only ~80 bytes/paper), standard (+ first 3 authors/openAccess/metrics ~200 bytes/paper), full (+ 500-char abstract, 10 authors, 5 subjects ~482 bytes/paper). Use minimal for large result sets, full only when abstracts are needed.'),
});

export type SearchInput = z.infer<typeof SearchInputSchema>;

// Product details input validation
export const ProductDetailsInputSchema = z.object({
  identifier: z
    .string()
    .min(1)
    .describe('DOI or OpenAIRE ID of the research product'),
  includeAbstract: z
    .boolean()
    .default(true)
    .describe('Include abstract in response (abstracts can be lengthy)'),
});

export type ProductDetailsInput = z.infer<typeof ProductDetailsInputSchema>;

// Citation network input validation
export const CitationNetworkInputSchema = z.object({
  identifier: z
    .string()
    .min(1)
    .describe('DOI or OpenAIRE ID of the research product'),
  depth: z
    .number()
    .min(1)
    .max(3)
    .default(1)
    .describe('Citation depth (1-3 levels)'),
  direction: z
    .enum(['citations', 'references', 'both'])
    .default('both')
    .describe('Citation direction to explore'),
  includeMetrics: z
    .boolean()
    .default(true)
    .describe('Include impact metrics'),
  maxNodes: z
    .number()
    .min(1)
    .max(1000)
    .optional()
    .default(200)
    .describe('Maximum nodes in network (default: 200, use higher values with caution for performance)'),
});

export type CitationNetworkInput = z.infer<typeof CitationNetworkInputSchema>;

// Validation helper
export function validateInput<T>(schema: z.ZodSchema<T>, input: unknown): T {
  return schema.parse(input);
}

// Organization search validation
export const OrganizationSearchInputSchema = z.object({
  search: z.string().optional().describe('General search across organization fields'),
  legalName: z.string().optional().describe('Legal name of organization'),
  legalShortName: z.string().optional().describe('Short name of organization'),
  pid: z.string().optional().describe('Persistent identifier (ROR, GRID, ISNI)'),
  countryCode: z.string().optional().describe('ISO country code'),
  page: z.number().min(1).default(1).describe('Page number'),
  pageSize: z.number().min(1).max(100).default(10).describe('Results per page'),
  cursor: z.string().optional().describe('Cursor for pagination'),
});

export type OrganizationSearchInput = z.infer<typeof OrganizationSearchInputSchema>;

// Project search validation
export const ProjectSearchInputSchema = z.object({
  search: z.string().optional().describe('General search query'),
  title: z.string().optional().describe('Project title'),
  keywords: z.string().optional().describe('Project keywords'),
  code: z.string().optional().describe('Grant agreement code'),
  acronym: z.string().optional().describe('Project acronym'),
  fundingShortName: z.string().optional().describe('Funder short name (e.g., EC, NSF)'),
  fundingStreamId: z.string().optional().describe('Funding stream (e.g., H2020, FP7)'),
  fromStartDate: z.string().optional().describe('Minimum start date (YYYY or YYYY-MM-DD)'),
  toStartDate: z.string().optional().describe('Maximum start date'),
  fromEndDate: z.string().optional().describe('Minimum end date'),
  toEndDate: z.string().optional().describe('Maximum end date'),
  relOrganizationName: z.string().optional().describe('Related organization name'),
  relOrganizationId: z.string().optional().describe('Related organization ID'),
  relOrganizationCountryCode: z.string().optional().describe('Organization country code'),
  page: z.number().min(1).default(1).describe('Page number'),
  pageSize: z.number().min(1).max(100).default(10).describe('Results per page'),
  sortBy: z.enum(['relevance', 'startDate', 'endDate']).default('relevance').describe('Sort field'),
  sortDirection: z.enum(['ASC', 'DESC']).default('DESC').describe('Sort direction'),
});

export type ProjectSearchInput = z.infer<typeof ProjectSearchInputSchema>;

// Author profile validation
export const AuthorProfileInputSchema = z.object({
  orcid: z.string().optional().describe('Author ORCID identifier'),
  authorName: z.string().optional().describe('Author full name'),
  limit: z.number().min(1).max(500).default(100).describe('Max publications to retrieve'),
  includeCoAuthors: z.boolean().default(true).describe('Include co-author analysis'),
});

export type AuthorProfileInput = z.infer<typeof AuthorProfileInputSchema>;

// Dataset search validation
export const DatasetSearchInputSchema = z.object({
  search: z.string().optional().describe('General search query'),
  title: z.string().optional().describe('Dataset title'),
  description: z.string().optional().describe('Dataset description'),
  subjects: z.string().optional().describe('Subject classification'),
  publisher: z.string().optional().describe('Publishing entity'),
  openAccessOnly: z.boolean().optional().describe('Only open access datasets'),
  fromPublicationDate: z.string().optional().describe('Minimum publication date (YYYY or YYYY-MM-DD)'),
  toPublicationDate: z.string().optional().describe('Maximum publication date'),
  relProjectId: z.string().optional().describe('Related project ID'),
  relOrganizationId: z.string().optional().describe('Related organization ID'),
  page: z.number().min(1).default(1).describe('Page number'),
  pageSize: z.number().min(1).max(100).default(10).describe('Results per page'),
  sortBy: z.enum(['relevance', 'date', 'popularity']).default('relevance').describe('Sort order'),
  sortDirection: z.enum(['ASC', 'DESC']).default('DESC').describe('Sort direction'),
  detail: z.enum(['minimal', 'standard', 'full']).default('standard').describe('Response detail level: minimal (title/year/doi only), standard (+ authors/openAccess), full (+ abstract/subjects)'),
});

export type DatasetSearchInput = z.infer<typeof DatasetSearchInputSchema>;

// Co-authorship network validation
export const CoAuthorshipNetworkInputSchema = z.object({
  orcid: z.string().optional().describe('Author ORCID identifier'),
  authorName: z.string().optional().describe('Author full name'),
  maxDepth: z.number().min(1).max(2).default(1).describe('Network depth (1=direct, 2=second-degree)'),
  minCollaborations: z.number().min(1).default(1).describe('Minimum collaborations to include'),
  limit: z.number().min(10).max(500).default(100).describe('Max publications to analyze'),
});

export type CoAuthorshipNetworkInput = z.infer<typeof CoAuthorshipNetworkInputSchema>;

// Project outputs validation
export const ProjectOutputsInputSchema = z.object({
  projectId: z.string().optional().describe('Project OpenAIRE ID'),
  projectCode: z.string().optional().describe('Project grant code'),
  type: z.enum(['publication', 'dataset', 'software', 'all']).default('all').describe('Output type filter'),
  pageSize: z.number().min(1).max(100).default(100).describe('Results per page'),
  sortBy: z.enum(['date', 'popularity', 'relevance']).default('date').describe('Sort order'),
});

export type ProjectOutputsInput = z.infer<typeof ProjectOutputsInputSchema>;

// Highly cited papers validation
export const HighlyCitedPapersInputSchema = z.object({
  search: z.string().optional().describe('Search query to filter papers'),
  subjects: z.string().optional().describe('Subject classification'),
  type: z.enum(['publication', 'dataset', 'software', 'all']).default('publication').describe('Research product type'),
  citationClass: z.enum(['C1', 'C2', 'C3']).default('C1').describe('Citation class (C1=top 0.01%, C2=top 0.1%, C3=top 20%)'),
  fromPublicationDate: z.string().optional().describe('Minimum publication date (YYYY or YYYY-MM-DD)'),
  toPublicationDate: z.string().optional().describe('Maximum publication date'),
  page: z.number().min(1).default(1).describe('Page number'),
  pageSize: z.number().min(1).max(100).default(50).describe('Results per page'),
});

export type HighlyCitedPapersInput = z.infer<typeof HighlyCitedPapersInputSchema>;

// Research relationships validation
export const ResearchRelationshipsInputSchema = z.object({
  identifier: z.string().min(1).describe('DOI or PID of research product'),
  relationType: z.string().optional().describe('Specific relationship type to filter (e.g., Cites, IsSupplementTo)'),
  targetType: z.enum(['publication', 'dataset', 'software', 'other', 'all']).optional().describe('Target entity type'),
  limit: z.number().min(1).max(100).default(50).describe('Maximum relationships to return'),
});

export type ResearchRelationshipsInput = z.infer<typeof ResearchRelationshipsInputSchema>;

// Data source search validation
export const DataSourceSearchInputSchema = z.object({
  search: z.string().optional().describe('General search query'),
  officialName: z.string().optional().describe('Official repository name'),
  type: z.string().optional().describe('Repository type'),
  subjects: z.string().optional().describe('Subject areas'),
  contentTypes: z.string().optional().describe('Content types'),
  relOrganizationId: z.string().optional().describe('Operating organization ID'),
  page: z.number().min(1).default(1).describe('Page number'),
  pageSize: z.number().min(1).max(100).default(10).describe('Results per page'),
});

export type DataSourceSearchInput = z.infer<typeof DataSourceSearchInputSchema>;

// Research trends validation
export const ResearchTrendsInputSchema = z.object({
  search: z.string().min(1).describe('Research topic to track'),
  subjects: z.string().optional().describe('Subject classification'),
  fromYear: z.number().min(1900).max(2100).describe('Start year'),
  toYear: z.number().min(1900).max(2100).describe('End year'),
  type: z.enum(['publication', 'dataset', 'software', 'all']).default('all').describe('Research product type'),
});

export type ResearchTrendsInput = z.infer<typeof ResearchTrendsInputSchema>;

// Subgraph from DOIs validation
export const SubgraphFromDoisInputSchema = z.object({
  dois: z.array(z.string()).min(2).max(100).describe('Array of DOIs to build subgraph (min 2, max 100)'),
  includeRelationTypes: z.array(z.string()).optional().describe('Filter to specific relationship types (e.g., ["Cites", "IsSupplementTo"])'),
  fetchMetadata: z.boolean().default(true).describe('Fetch full metadata for each paper from OpenAIRE'),
});

export type SubgraphFromDoisInput = z.infer<typeof SubgraphFromDoisInputSchema>;
