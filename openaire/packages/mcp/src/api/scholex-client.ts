import { HttpClient } from './http-client.js';
import { APICache } from '../utils/cache.js';
import { logger } from '../utils/logger.js';
import type { CitationLink, CitationRequest } from '../types/index.js';

const SCHOLEX_BASE_URL = 'https://api-beta.scholexplorer.openaire.eu/v3';
const CACHE_TTL_CITATIONS = parseInt(process.env.CACHE_TTL_CITATIONS || '21600000', 10); // 6 hours

export class ScholeXplorerClient {
  private http: HttpClient;
  private cache: APICache;

  constructor() {
    this.http = new HttpClient(SCHOLEX_BASE_URL);
    this.cache = new APICache(CACHE_TTL_CITATIONS);
  }

  async getCitations(request: CitationRequest): Promise<CitationLink[]> {
    const cacheKey = `citations:${JSON.stringify(request)}`;
    const cached = this.cache.get<CitationLink[]>(cacheKey);

    if (cached) {
      logger.info('Returning cached citation links');
      return cached;
    }

    logger.info('Fetching citation links from ScholeXplorer', {
      source: request.source,
      target: request.target,
      relationType: request.relationType,
    });

    // Build query params manually - ScholeXplorer doesn't handle URL-encoded DOIs properly
    const queryParts: string[] = [];

    if (request.source) {
      queryParts.push(`sourcePid=${request.source}`); // Don't encode DOI slashes
    }

    if (request.target) {
      queryParts.push(`targetPid=${request.target}`); // Don't encode DOI slashes
    }

    if (request.relationType) {
      // Map 'cites' to 'Cites' (API expects capitalized relation type)
      const capitalizedRelation = request.relationType.charAt(0).toUpperCase() + request.relationType.slice(1);
      queryParts.push(`relation=${capitalizedRelation}`);
    }

    // Add pagination - ScholeXplorer v3 uses 'limit' for page size
    // Note: 'from' parameter breaks the API, so omit it for first page
    queryParts.push('limit=100');

    const url = `/Links?${queryParts.join('&')}`;
    logger.debug('ScholeXplorer request URL', { url, fullUrl: `${SCHOLEX_BASE_URL}${url}` });

    try {
      const response = await this.http.get<any>(url);

      // Parse ScholeXplorer v3 response
      const totalLinks = response.totalLinks || 0;
      const linksRaw = response.result || []; // v3 uses 'result' instead of 'links'

      logger.info('ScholeXplorer response received', {
        totalLinks,
        returned: linksRaw.length,
      });

      const links: CitationLink[] = linksRaw.map((link: any) => {
        // Extract DOI from Identifier array (v3 format)
        const getIdentifier = (identifiers: any[]) => {
          if (!Array.isArray(identifiers) || identifiers.length === 0) return '';
          // Prefer DOI, fallback to first identifier
          const doiId = identifiers.find(id => id.IDScheme === 'doi');
          return doiId?.ID || identifiers[0]?.ID || '';
        };

        return {
          source: {
            identifier: getIdentifier(link.source?.Identifier || []),
            type: link.source?.Type || 'unknown',
            title: link.source?.Title || 'Untitled',
            publicationDate: link.source?.PublicationDate,
          },
          target: {
            identifier: getIdentifier(link.target?.Identifier || []),
            type: link.target?.Type || 'unknown',
            title: link.target?.Title || 'Untitled',
            publicationDate: link.target?.PublicationDate,
          },
          relationType: link.RelationshipType?.SubType || link.RelationshipType?.Name || 'unknown',
          linkProvider: link.LinkProvider?.[0]?.name || 'unknown',
        };
      });

      // Cache results
      this.cache.set(cacheKey, links, CACHE_TTL_CITATIONS);

      return links;
    } catch (error) {
      logger.error('ScholeXplorer request failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Get citation count for a research product
   */
  async getCitationCount(identifier: string): Promise<number> {
    try {
      const citations = await this.getCitations({
        target: identifier,
        relationType: 'cites',
      });
      return citations.length;
    } catch (error) {
      logger.warn('Failed to get citation count', { identifier });
      return 0;
    }
  }

  /**
   * Get papers that cite this paper (incoming citations)
   */
  async getCitingPapers(identifier: string, limit: number = 50): Promise<CitationLink[]> {
    const links = await this.getCitations({
      target: identifier,
      relationType: 'cites',
    });
    return links.slice(0, limit);
  }

  /**
   * Get papers cited by this paper (outgoing references)
   */
  async getReferences(identifier: string, limit: number = 50): Promise<CitationLink[]> {
    const links = await this.getCitations({
      source: identifier,
      relationType: 'cites',
    });
    return links.slice(0, limit);
  }
}
