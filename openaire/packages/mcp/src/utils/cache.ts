import type { CacheEntry } from '../types/index.js';
import { logger } from './logger.js';

export class APICache {
  private cache: Map<string, CacheEntry<any>>;
  private defaultTTL: number;

  constructor(defaultTTL: number = 3600000) {
    this.cache = new Map();
    this.defaultTTL = defaultTTL;

    // Clean up expired entries every 5 minutes
    setInterval(() => this.cleanup(), 5 * 60 * 1000);
  }

  get<T>(key: string): T | null {
    const entry = this.cache.get(key);

    if (!entry) {
      logger.debug('Cache miss', { key });
      return null;
    }

    const now = Date.now();
    if (now - entry.timestamp > entry.ttl) {
      logger.debug('Cache expired', { key });
      this.cache.delete(key);
      return null;
    }

    logger.debug('Cache hit', { key });
    return entry.data as T;
  }

  set<T>(key: string, data: T, ttl?: number): void {
    const entry: CacheEntry<T> = {
      data,
      timestamp: Date.now(),
      ttl: ttl || this.defaultTTL,
    };

    this.cache.set(key, entry);
    logger.debug('Cache set', { key, ttl: entry.ttl });
  }

  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;

    const now = Date.now();
    if (now - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return false;
    }

    return true;
  }

  delete(key: string): void {
    this.cache.delete(key);
    logger.debug('Cache deleted', { key });
  }

  clear(): void {
    this.cache.clear();
    logger.info('Cache cleared');
  }

  private cleanup(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        this.cache.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.debug('Cache cleanup', { entriesRemoved: cleaned });
    }
  }

  getStats(): { size: number; keys: string[] } {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys()),
    };
  }
}
