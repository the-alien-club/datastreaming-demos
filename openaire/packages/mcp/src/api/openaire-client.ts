import { HttpClient } from './http-client.js';
import { APICache } from '../utils/cache.js';
import { logger } from '../utils/logger.js';
import type {
  ResearchProduct,
  SearchRequest,
  SearchResponse,
  Author,
  FundingInfo,
  QualityMetrics,
  Organization,
  OrganizationSearchRequest,
  OrganizationSearchResponse,
  Project,
  ProjectSearchRequest,
  ProjectSearchResponse,
  DataSource,
  DataSourceSearchRequest,
  DataSourceSearchResponse,
} from '../types/index.js';

const BASE_URL = 'https://api.openaire.eu';
const CACHE_TTL_SEARCH = parseInt(process.env.CACHE_TTL_SEARCH || '3600000', 10);
const CACHE_TTL_PRODUCT = parseInt(process.env.CACHE_TTL_PRODUCT || '86400000', 10);

export class OpenAIREClient {
  private http: HttpClient;
  private cache: APICache;

  constructor() {
    this.http = new HttpClient(BASE_URL);
    this.cache = new APICache(CACHE_TTL_SEARCH);
  }

  async searchResearchProducts(request: SearchRequest): Promise<SearchResponse> {
    const cacheKey = `search:${JSON.stringify(request)}`;
    const cached = this.cache.get<SearchResponse>(cacheKey);

    if (cached) {
      logger.info('Returning cached search results', { query: request.query });
      return cached;
    }

    logger.info('Searching OpenAIRE', {
      query: request.query,
      type: request.type,
      limit: request.limit,
      pageSize: request.pageSize,
    });

    // USE GRAPH API V2 BY DEFAULT (fully aligned with official API)
    // Only use legacy API if explicitly requested via useGraphV1 flag
    const useGraphV1 = (request as any).useGraphV1;

    if (!useGraphV1) {
      return this.searchResearchProductsGraphV2(request);
    }

    // LEGACY API PATH (old /search/* endpoints) - deprecated, kept for backward compatibility
    const params = new URLSearchParams();

    // OpenAIRE uses 'keywords' for general search, not 'search'
    if (request.query) {
      params.append('keywords', request.query);
    }

    if (request.openAccess !== undefined) {
      // OpenAIRE uses 'OA' parameter: true for open access
      params.append('OA', String(request.openAccess));
    }

    if (request.peerReviewed !== undefined) {
      params.append('peerReviewed', String(request.peerReviewed));
    }

    if (request.dateRange) {
      if (request.dateRange.from) {
        params.append('fromDateAccepted', request.dateRange.from);
      }
      if (request.dateRange.to) {
        params.append('toDateAccepted', request.dateRange.to);
      }
    }

    params.append('page', String(request.page || 1));
    // OpenAIRE uses 'size' not 'pageSize'
    params.append('size', String(request.limit || 10));

    // IMPORTANT: format=json is required for structured JSON response
    params.append('format', 'json');

    // Handle type parameter - use first type if array provided
    const typeParam = request.type && Array.isArray(request.type) ? request.type[0] : request.type;
    const endpoint = this.getEndpoint(typeParam as any);
    const url = `${endpoint}?${params.toString()}`;
    const fullUrl = `${BASE_URL}${url}`;

    // Debug: log the exact URL being requested
    logger.info('Making OpenAIRE Legacy API request', { endpoint, fullUrl });
    console.error(`[DEBUG] Full URL: ${fullUrl}`);  // Use stderr for debugging

    try {
      const response = await this.http.get<any>(url);

      // OpenAIRE returns nested structure: response.results.record[]
      // IMPORTANT: When there's 1 result, record is an object. When multiple, it's an array.
      let recordsRaw = response.response?.results?.record;
      const records = Array.isArray(recordsRaw) ? recordsRaw : (recordsRaw ? [recordsRaw] : []);
      const total = response.response?.header?.total?.$ || response.response?.header?.total || 0;

      // Extract actual result objects from records
      const results: any[] = [];
      for (const record of records) {
        if (record.result && Array.isArray(record.result)) {
          results.push(...record.result);
        } else if (record.result) {
          results.push(record.result);
        }
      }

      const transformed: SearchResponse = {
        results: Array.isArray(results)
          ? results.map((item: any) => this.transformResearchProduct(item)).filter((p): p is ResearchProduct => p !== null)
          : [],
        total: typeof total === 'string' ? parseInt(total, 10) : total,
        page: request.page || 1,
        pageSize: request.limit || 10,
      };

      logger.info('Search completed', {
        query: request.query,
        resultsFound: transformed.results.length,
        total: transformed.total,
      });

      // Cache the results
      this.cache.set(cacheKey, transformed, CACHE_TTL_SEARCH);

      return transformed;
    } catch (error) {
      logger.error('Search failed', {
        query: request.query,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  // Graph API V2 search - FULLY ALIGNED with all API parameters
  private async searchResearchProductsGraphV2(request: SearchRequest): Promise<SearchResponse> {
    const params = new URLSearchParams();

    // Helper function to add array parameters (OR logic)
    const addArrayParam = (paramName: string, values: any[] | undefined) => {
      if (values && Array.isArray(values) && values.length > 0) {
        values.forEach(v => params.append(paramName, String(v)));
      }
    };

    // Basic search parameters
    if (request.logicalOperator) {
      params.append('logicalOperator', request.logicalOperator);
    }
    if (request.query) {
      params.append('search', request.query);
    }
    if (request.mainTitle) {
      params.append('mainTitle', request.mainTitle);
    }
    if (request.description) {
      params.append('description', request.description);
    }

    // Identifiers (arrays for OR logic)
    addArrayParam('id', request.id);
    addArrayParam('pid', request.pid);
    addArrayParam('originalId', request.originalId);

    // Type and classification (arrays)
    addArrayParam('type', request.type);
    addArrayParam('subjects', request.subjects);

    // Author filters (arrays)
    addArrayParam('authorFullName', request.authorFullName);
    addArrayParam('authorOrcid', request.authorOrcid);

    // Publisher and location (arrays)
    addArrayParam('publisher', request.publisher);
    addArrayParam('countryCode', request.countryCode);

    // Date range
    if (request.fromPublicationDate) {
      params.append('fromPublicationDate', request.fromPublicationDate);
    }
    if (request.toPublicationDate) {
      params.append('toPublicationDate', request.toPublicationDate);
    }
    // Legacy support for dateRange
    if (request.dateRange) {
      if (request.dateRange.from) {
        params.append('fromPublicationDate', request.dateRange.from);
      }
      if (request.dateRange.to) {
        params.append('toPublicationDate', request.dateRange.to);
      }
    }

    // Access rights (arrays)
    addArrayParam('bestOpenAccessRightLabel', request.bestOpenAccessRightLabel);
    addArrayParam('openAccessColor', request.openAccessColor);

    // Citation metrics (arrays) - C1=top 0.01%, C2=top 0.1%, C3=top 1%, C4=top 10%, C5=average
    addArrayParam('influenceClass', request.influenceClass);
    addArrayParam('popularityClass', request.popularityClass);
    addArrayParam('impulseClass', request.impulseClass);
    addArrayParam('citationCountClass', request.citationCountClass);

    // Publication-specific filters (arrays)
    addArrayParam('instanceType', request.instanceType);
    addArrayParam('sdg', request.sdg);
    addArrayParam('fos', request.fos);

    // Boolean flags (publication-specific)
    if (request.isPeerReviewed !== undefined) {
      params.append('isPeerReviewed', String(request.isPeerReviewed));
    }
    if (request.isInDiamondJournal !== undefined) {
      params.append('isInDiamondJournal', String(request.isInDiamondJournal));
    }
    if (request.isPubliclyFunded !== undefined) {
      params.append('isPubliclyFunded', String(request.isPubliclyFunded));
    }
    if (request.isGreen !== undefined) {
      params.append('isGreen', String(request.isGreen));
    }
    // Legacy support
    if (request.peerReviewed !== undefined) {
      params.append('isPeerReviewed', String(request.peerReviewed));
    }
    if (request.openAccess !== undefined) {
      // Map legacy openAccess boolean to bestOpenAccessRightLabel
      if (request.openAccess) {
        params.append('bestOpenAccessRightLabel', 'OPEN');
      }
    }

    // Relationship filters (arrays)
    addArrayParam('relOrganizationId', request.relOrganizationId);
    addArrayParam('relCommunityId', request.relCommunityId);
    addArrayParam('relProjectId', request.relProjectId);
    addArrayParam('relProjectCode', request.relProjectCode);
    if (request.hasProjectRel !== undefined) {
      params.append('hasProjectRel', String(request.hasProjectRel));
    }
    addArrayParam('relProjectFundingShortName', request.relProjectFundingShortName);
    addArrayParam('relProjectFundingStreamId', request.relProjectFundingStreamId);
    addArrayParam('relHostingDataSourceId', request.relHostingDataSourceId);
    addArrayParam('relCollectedFromDatasourceId', request.relCollectedFromDatasourceId);

    // Pagination
    if (request.cursor) {
      params.append('cursor', request.cursor);
    } else {
      params.append('page', String(request.page || 1));
    }
    params.append('pageSize', String(request.pageSize || request.limit || 10));

    // Sorting - pass through as-is (already in correct format: "field ASC|DESC")
    if (request.sortBy) {
      params.append('sortBy', request.sortBy);
    }

    const url = `/graph/v2/researchProducts?${params.toString()}`;
    const fullUrl = `${BASE_URL}${url}`;

    logger.info('Making Graph API V2 request', {
      fullUrl,
      paramCount: Array.from(params.keys()).length,
    });

    try {
      const response = await this.http.get<any>(url);

      // Graph API V2 returns: { results: [...], total: N, header: { nextCursor?: string } }
      const results = response.results || [];
      const total = response.total || response.header?.numFound || 0;
      const nextCursor = response.header?.nextCursor;

      const transformed: SearchResponse = {
        results: results.map((item: any) => this.transformGraphV2Product(item)).filter((p: ResearchProduct | null): p is ResearchProduct => p !== null),
        total: typeof total === 'string' ? parseInt(total, 10) : total,
        page: request.page || 1,
        pageSize: request.pageSize || request.limit || 10,
        nextCursor,
      };

      logger.info('Graph API V2 search completed', {
        query: request.query,
        resultsFound: transformed.results.length,
        total: transformed.total,
        nextCursor: nextCursor ? 'present' : 'none',
      });

      return transformed;
    } catch (error) {
      logger.error('Graph API V2 search failed', {
        query: request.query,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  // Transform Graph API V2 response format
  private transformGraphV2Product(raw: any): ResearchProduct | null {
    try {
      // Extract citation metrics from OpenAIRE (stored in indicators.citationImpact)
      const citationImpact = raw.indicators?.citationImpact || raw.indicator?.citationImpact;
      const citationCount = citationImpact?.citationCount || 0;

      // Extract quality metrics (influence, popularity, impulse)
      const metrics: QualityMetrics | undefined = citationImpact ? {
        influence: citationImpact.influence || 0,
        popularity: citationImpact.popularity || 0,
        impulse: citationImpact.impulse || 0,
      } : undefined;

      // Extract DOI from pids array (official Graph V2 field name is 'pids' plural)
      const doiPid = raw.pids?.find((p: any) => p.scheme === 'doi');
      const doi = doiPid?.value;

      return {
        id: raw.id || '',
        type: this.normalizeType(raw.type || 'publication'),
        title: raw.mainTitle || raw.title || 'Untitled',
        authors: (raw.authors || []).slice(0, 10).map((a: any) => ({
          name: a.fullName || a.name || 'Unknown',
          orcid: a.orcid,
          affiliation: a.affiliation,
        })),
        publicationDate: raw.publicationDate || new Date().toISOString().split('T')[0],
        abstract: raw.description,
        doi: doi,
        url: doi ? `https://doi.org/${doi}` : undefined,
        publisher: raw.publisher,
        journal: raw.container?.name,
        citations: citationCount,
        openAccessColor: this.normalizeOpenAccessColor(raw.bestOpenAccessRight?.label),
        peerReviewed: raw.peerReviewed || false,
        subjects: (raw.subjects || []).slice(0, 10).map((s: any) =>
          typeof s === 'string' ? s : s.subject || s.label || ''
        ).filter((s: string) => s),
        funding: undefined,
        metrics,
      };
    } catch (error) {
      logger.warn('Failed to transform Graph V2 product', {
        error: error instanceof Error ? error.message : 'Unknown error',
        raw: JSON.stringify(raw).substring(0, 200),
      });
      return null;
    }
  }

  async getResearchProduct(id: string): Promise<ResearchProduct> {
    const cacheKey = `product:${id}`;
    const cached = this.cache.get<ResearchProduct>(cacheKey);

    if (cached) {
      logger.info('Returning cached product', { id });
      return cached;
    }

    logger.info('Fetching research product', { id });

    // If ID looks like a DOI (starts with "10."), use Graph API v2 with pid filter
    const isDoi = id.startsWith('10.');

    try {
      if (isDoi) {
        // Use Graph API v2 with pid filter - construct URL manually to avoid encoding /
        logger.info('Searching by DOI using Graph API v2', { doi: id });
        // Don't use URLSearchParams for DOI to avoid encoding the /
        const url = `/graph/v2/researchProducts?pid=${id}&page=1&pageSize=1`;

        const response = await this.http.get<any>(url);

        if (!response.results || response.results.length === 0) {
          throw new Error(`No results found for DOI: ${id}`);
        }

        const product = response.results[0];

        // Transform from Graph API v2 format using the transformer (which extracts citation data)
        const transformed = this.transformGraphV2Product(product);

        if (!transformed) {
          throw new Error('Failed to transform product data');
        }

        this.cache.set(cacheKey, transformed, CACHE_TTL_PRODUCT);
        return transformed;
      } else {
        // Use old search API for OpenAIRE IDs
        const response = await this.http.get<any>(`/search/researchProducts/${id}?format=json`);
        const product = this.transformResearchProduct(response);

        if (!product) {
          throw new Error('Product not found or invalid data');
        }

        this.cache.set(cacheKey, product, CACHE_TTL_PRODUCT);
        return product;
      }
    } catch (error) {
      logger.error('Failed to fetch product', {
        id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  private getEndpoint(type?: string): string {
    switch (type) {
      case 'publication':
        return '/search/publications';
      case 'dataset':
        return '/search/datasets';
      case 'software':
        return '/search/software';
      case 'other':
        return '/search/other';
      default:
        return '/search/researchProducts';
    }
  }

  private transformResearchProduct(raw: any): ResearchProduct | null {
    try {
      // OpenAIRE structure: raw.metadata['oaf:entity']['oaf:result']
      const oafEntity = raw.metadata?.['oaf:entity'];
      const oafResult = oafEntity?.['oaf:result'];
      const header = raw.header || {};

      if (!oafResult) {
        logger.warn('No oaf:result in response');
        return null;
      }

      // Extract title
      const titleObj = oafResult.title;
      let title = 'Untitled';

      if (Array.isArray(titleObj)) {
        // Find main title (classid = "main title")
        const mainTitle = titleObj.find((t: any) =>
          t['@classid'] === 'main title' || t['@classid'] === 'main'
        );
        title = mainTitle?.$ || titleObj[0]?.$ || titleObj[0] || 'Untitled';
      } else if (titleObj?.$) {
        title = titleObj.$;
      } else if (typeof titleObj === 'string') {
        title = titleObj;
      }

      // Extract authors (creator field)
      const authors: Author[] = [];
      const creatorList = oafResult.creator || [];
      const authorList = Array.isArray(creatorList) ? creatorList : [creatorList];

      for (const author of authorList) {
        if (typeof author === 'string') {
          authors.push({ name: author });
        } else if (author.$) {
          authors.push({
            name: author.$,
            orcid: author['@orcid'] || author['@orcid_pending'],
          });
        }
      }

      // Extract publication date
      const publicationDate = oafResult.dateofacceptance?.$ ||
        oafResult.dateofacceptance ||
        new Date().toISOString().split('T')[0];

      // Extract DOI from originalId or pid
      let doi: string | undefined;
      const originalIds = oafResult.originalId || [];
      const originalIdList = Array.isArray(originalIds) ? originalIds : [originalIds];

      for (const id of originalIdList) {
        const idValue = id.$ || id;
        if (idValue && idValue.startsWith('10.')) {
          doi = idValue;
          break;
        }
      }

      // Extract type from resulttype
      const resultTypeObj = oafResult.resulttype;
      let resultType = 'publication';

      if (resultTypeObj) {
        if (resultTypeObj['@classname']) {
          resultType = resultTypeObj['@classname'];
        } else if (resultTypeObj.$?.['@classname']) {
          resultType = resultTypeObj.$['@classname'];
        } else if (typeof resultTypeObj === 'string') {
          resultType = resultTypeObj;
        }
      }

      // Extract description
      const descriptionObj = oafResult.description;
      let abstract: string | undefined;
      if (Array.isArray(descriptionObj)) {
        abstract = descriptionObj[0]?.$ || descriptionObj[0];
      } else if (descriptionObj?.$) {
        abstract = descriptionObj.$;
      } else if (typeof descriptionObj === 'string') {
        abstract = descriptionObj;
      }

      // Extract publisher
      const publisherObj = oafResult.publisher;
      const publisher = publisherObj?.$ || publisherObj ||
        oafResult.collectedfrom?.['@name'];

      // Extract journal/source
      const journalObj = oafResult.journal;
      const journal = journalObj?.$ || journalObj;

      // Extract access rights
      const bestAccessRight = oafResult.bestaccessright;
      const openAccessColor = bestAccessRight?.['@classname'] ||
        bestAccessRight?.['@classid'];

      // Extract citation metrics if available (usually not in legacy API format, but check anyway)
      const citationImpact = oafResult.indicators?.citationImpact || oafResult.indicator?.citationImpact;
      const citationCount = citationImpact?.citationCount || 0;
      const metrics = this.extractMetrics(citationImpact);

      return {
        id: header['dri:objIdentifier']?.$ || header['dri:objIdentifier'] || '',
        type: this.normalizeType(resultType),
        title,
        authors,
        publicationDate,
        abstract,
        doi,
        url: doi ? `https://doi.org/${doi}` : undefined,
        publisher,
        journal,
        citations: citationCount,
        openAccessColor: this.normalizeOpenAccessColor(openAccessColor),
        peerReviewed: false, // Not directly available in this format
        subjects: this.extractSubjects(oafResult),
        funding: undefined, // Would need additional parsing
        metrics,
      };
    } catch (error) {
      logger.warn('Failed to transform research product', {
        error: error instanceof Error ? error.message : 'Unknown error',
        raw: JSON.stringify(raw).substring(0, 200),
      });
      return null;
    }
  }

  private normalizeType(type: string): 'publication' | 'dataset' | 'software' | 'other' {
    const normalized = type.toLowerCase();
    if (normalized.includes('publication') || normalized.includes('article')) {
      return 'publication';
    }
    if (normalized.includes('dataset') || normalized.includes('data')) {
      return 'dataset';
    }
    if (normalized.includes('software') || normalized.includes('code')) {
      return 'software';
    }
    return 'other';
  }

  private normalizeOpenAccessColor(
    accessRight: any
  ): 'gold' | 'green' | 'bronze' | 'hybrid' | undefined {
    if (!accessRight) return undefined;

    const label = (accessRight.label || accessRight).toLowerCase();

    if (label.includes('gold')) return 'gold';
    if (label.includes('green')) return 'green';
    if (label.includes('bronze')) return 'bronze';
    if (label.includes('hybrid')) return 'hybrid';

    return undefined;
  }

  private extractSubjects(oafResult: any): string[] {
    const subjects: string[] = [];

    const subjectList = oafResult.subject || [];
    const subjectArray = Array.isArray(subjectList) ? subjectList : [subjectList];

    for (const subject of subjectArray) {
      if (typeof subject === 'string') {
        subjects.push(subject);
      } else if (subject.$) {
        subjects.push(subject.$);
      } else if (subject['@classname']) {
        subjects.push(subject['@classname']);
      }
    }

    return [...new Set(subjects)].slice(0, 10); // Limit to 10 subjects
  }

  private extractFunding(metadata: any): FundingInfo[] | undefined {
    const funding: FundingInfo[] = [];

    if (metadata.funding && Array.isArray(metadata.funding)) {
      for (const fund of metadata.funding) {
        funding.push({
          funder: fund.funder || fund.fundername,
          project: fund.projectName || fund.title,
          grantId: fund.grantId || fund.code,
        });
      }
    }

    return funding.length > 0 ? funding : undefined;
  }

  private extractMetrics(citationImpact: any): QualityMetrics | undefined {
    if (!citationImpact) return undefined;

    if (citationImpact.influence !== undefined ||
        citationImpact.popularity !== undefined ||
        citationImpact.impulse !== undefined) {
      return {
        influence: parseFloat(citationImpact.influence || '0'),
        popularity: parseFloat(citationImpact.popularity || '0'),
        impulse: parseFloat(citationImpact.impulse || '0'),
      };
    }

    return undefined;
  }

  // Organization search
  async searchOrganizations(request: OrganizationSearchRequest): Promise<OrganizationSearchResponse> {
    const cacheKey = `orgs:${JSON.stringify(request)}`;
    const cached = this.cache.get<OrganizationSearchResponse>(cacheKey);

    if (cached) {
      logger.info('Returning cached organization search results');
      return cached;
    }

    logger.info('Searching organizations', {
      search: request.search,
      countryCode: request.countryCode,
      pageSize: request.pageSize,
    });

    const params = new URLSearchParams();

    if (request.search) params.append('search', request.search);
    if (request.legalName) params.append('legalName', request.legalName);
    if (request.legalShortName) params.append('legalShortName', request.legalShortName);
    if (request.pid) params.append('pid', request.pid);
    if (request.countryCode) params.append('countryCode', request.countryCode);

    params.append('page', String(request.page || 1));
    params.append('pageSize', String(request.pageSize || 10));

    if (request.cursor) params.append('cursor', request.cursor);

    const url = `/graph/v1/organizations?${params.toString()}`;

    try {
      const response = await this.http.get<any>(url);

      const results = response.results || [];
      const header = response.header || {};

      const transformed: OrganizationSearchResponse = {
        results: results.map((org: any) => this.transformOrganization(org)),
        total: header.numFound || 0,
        page: header.page || 1,
        pageSize: header.pageSize || 10,
        nextCursor: header.nextCursor,
      };

      this.cache.set(cacheKey, transformed, CACHE_TTL_SEARCH);
      return transformed;
    } catch (error) {
      logger.error('Organization search failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  private transformOrganization(raw: any): Organization {
    return {
      id: raw.id || '',
      legalName: raw.legalName || 'Unknown',
      legalShortName: raw.legalShortName,
      alternativeNames: raw.alternativeNames || [],
      websiteUrl: raw.websiteUrl,
      country: raw.country ? {
        code: raw.country.code,
        label: raw.country.label,
      } : undefined,
      pids: raw.pids || [],
    };
  }

  // Project search
  async searchProjects(request: ProjectSearchRequest): Promise<ProjectSearchResponse> {
    const cacheKey = `projects:${JSON.stringify(request)}`;
    const cached = this.cache.get<ProjectSearchResponse>(cacheKey);

    if (cached) {
      logger.info('Returning cached project search results');
      return cached;
    }

    logger.info('Searching projects', {
      search: request.search,
      fundingShortName: request.fundingShortName,
      pageSize: request.pageSize,
    });

    const params = new URLSearchParams();

    if (request.search) params.append('search', request.search);
    if (request.title) params.append('title', request.title);
    if (request.keywords) params.append('keywords', request.keywords);
    if (request.code) params.append('code', request.code);
    if (request.acronym) params.append('acronym', request.acronym);
    if (request.fundingShortName) params.append('fundingShortName', request.fundingShortName);
    if (request.fundingStreamId) params.append('fundingStreamId', request.fundingStreamId);
    if (request.fromStartDate) params.append('fromStartDate', request.fromStartDate);
    if (request.toStartDate) params.append('toStartDate', request.toStartDate);
    if (request.fromEndDate) params.append('fromEndDate', request.fromEndDate);
    if (request.toEndDate) params.append('toEndDate', request.toEndDate);
    if (request.relOrganizationName) params.append('relOrganizationName', request.relOrganizationName);
    if (request.relOrganizationId) params.append('relOrganizationId', request.relOrganizationId);
    if (request.relOrganizationCountryCode) params.append('relOrganizationCountryCode', request.relOrganizationCountryCode);

    params.append('page', String(request.page || 1));
    params.append('pageSize', String(request.pageSize || 10));

    if (request.sortBy && request.sortDirection) {
      params.append('sortBy', `${request.sortBy} ${request.sortDirection}`);
    }

    if (request.cursor) params.append('cursor', request.cursor);

    const url = `/graph/v1/projects?${params.toString()}`;

    try {
      const response = await this.http.get<any>(url);

      const results = response.results || [];
      const header = response.header || {};

      const transformed: ProjectSearchResponse = {
        results: results.map((project: any) => this.transformProject(project)),
        total: header.numFound || 0,
        page: header.page || 1,
        pageSize: header.pageSize || 10,
        nextCursor: header.nextCursor,
      };

      this.cache.set(cacheKey, transformed, CACHE_TTL_SEARCH);
      return transformed;
    } catch (error) {
      logger.error('Project search failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  private transformProject(raw: any): Project {
    return {
      id: raw.id || '',
      code: raw.code,
      acronym: raw.acronym,
      title: raw.title || 'Untitled Project',
      keywords: raw.keywords || [],
      startDate: raw.startDate,
      endDate: raw.endDate,
      funding: raw.funding ? {
        funder: {
          name: raw.funding.funder?.name || '',
          shortName: raw.funding.funder?.shortName || '',
          jurisdiction: raw.funding.funder?.jurisdiction || '',
        },
        fundingStream: raw.funding.fundingStream,
      } : undefined,
      organizations: raw.organizations || [],
      summary: raw.summary,
    };
  }

  // Data source search
  async searchDataSources(request: DataSourceSearchRequest): Promise<DataSourceSearchResponse> {
    const cacheKey = `datasources:${JSON.stringify(request)}`;
    const cached = this.cache.get<DataSourceSearchResponse>(cacheKey);

    if (cached) {
      logger.info('Returning cached data source search results');
      return cached;
    }

    logger.info('Searching data sources', {
      search: request.search,
      type: request.type,
      pageSize: request.pageSize,
    });

    const params = new URLSearchParams();

    if (request.search) params.append('search', request.search);
    if (request.officialName) params.append('officialName', request.officialName);
    if (request.type) params.append('dataSourceTypeName', request.type);
    if (request.subjects) params.append('subjects', request.subjects);
    if (request.contentTypes) params.append('contentTypes', request.contentTypes);
    if (request.relOrganizationId) params.append('relOrganizationId', request.relOrganizationId);

    params.append('page', String(request.page || 1));
    params.append('pageSize', String(request.pageSize || 10));

    const url = `/graph/v1/dataSources?${params.toString()}`;

    try {
      const response = await this.http.get<any>(url);

      const results = response.results || [];
      const header = response.header || {};

      const transformed: DataSourceSearchResponse = {
        results: results.map((ds: any) => this.transformDataSource(ds)),
        total: header.numFound || 0,
        page: header.page || 1,
        pageSize: header.pageSize || 10,
      };

      this.cache.set(cacheKey, transformed, CACHE_TTL_SEARCH);
      return transformed;
    } catch (error) {
      logger.error('Data source search failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  private transformDataSource(raw: any): DataSource {
    return {
      id: raw.id || '',
      officialName: raw.officialName || 'Unknown',
      englishName: raw.englishName,
      legalShortName: raw.legalShortName,
      websiteUrl: raw.websiteUrl,
      type: raw.dataSourceType?.name,
      subjects: raw.subjects || [],
      contentTypes: raw.contentTypes || [],
      country: raw.country ? {
        code: raw.country.code,
        label: raw.country.label,
      } : undefined,
      organization: raw.organization ? {
        id: raw.organization.id,
        name: raw.organization.legalName,
      } : undefined,
    };
  }
}
