/**
 * In-Memory Cache with LRU Eviction
 * 
 * Enterprise-level caching layer for high-performance data access.
 * Implements Least Recently Used (LRU) eviction when cache reaches capacity.
 * 
 * Architecture:
 * - Layer 1: Memory Cache (this file) - <5ms access time
 * - Layer 2: KV Store - ~50ms access time
 * - Layer 3: Database - ~200ms access time
 */

/**
 * Cache entry structure with metadata for LRU eviction
 */
interface CacheEntry<T> {
  data: T;
  timestamp: number;  // Creation time (Date.now())
  expiresAt: number;  // Expiration time (timestamp + ttl)
  hits: number;       // Access counter for LRU calculation
}

/**
 * Generic in-memory cache with automatic expiration and LRU eviction
 */
export class MemoryCache<T> {
  private cache: Map<string, CacheEntry<T>> = new Map();
  private totalGets = 0;
  private totalHits = 0;

  constructor(
    private maxSize: number = 100,
    private defaultTTL: number = 5 * 60 * 1000 // 5 minutes default
  ) {}

  /**
   * Retrieve value from cache
   * Returns null if key doesn't exist or has expired
   */
  get(key: string): T | null {
    this.totalGets++;
    
    const entry = this.cache.get(key);
    if (!entry) {
      return null;
    }

    // Check expiration
    const now = Date.now();
    if (now > entry.expiresAt) {
      // Expired - delete and return null
      this.cache.delete(key);
      return null;
    }

    // Valid entry - increment hit counter and return data
    entry.hits++;
    this.totalHits++;
    return entry.data;
  }

  /**
   * Store value in cache with optional TTL override
   */
  set(key: string, data: T, ttlMs?: number): void {
    const now = Date.now();
    const ttl = ttlMs ?? this.defaultTTL;

    // Evict LRU entry if at capacity
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      this.evictLRU();
    }

    // Store new entry
    this.cache.set(key, {
      data,
      timestamp: now,
      expiresAt: now + ttl,
      hits: 0,
    });
  }

  /**
   * Remove specific key from cache
   */
  invalidate(key: string): void {
    this.cache.delete(key);
  }

  /**
   * Remove all keys matching a pattern (e.g., "customer:*")
   */
  invalidatePattern(pattern: string): number {
    let count = 0;
    const regex = new RegExp(pattern.replace('*', '.*'));
    
    for (const key of this.cache.keys()) {
      if (regex.test(key)) {
        this.cache.delete(key);
        count++;
      }
    }
    
    return count;
  }

  /**
   * Clear entire cache
   */
  clear(): void {
    this.cache.clear();
    this.totalGets = 0;
    this.totalHits = 0;
  }

  /**
   * Get cache statistics for monitoring
   */
  getStats(): { size: number; maxSize: number; hitRate: number } {
    const hitRate = this.totalGets > 0 ? this.totalHits / this.totalGets : 0;
    
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      hitRate: Math.round(hitRate * 100) / 100, // Round to 2 decimals
    };
  }

  /**
   * Evict least recently used entry (lowest hits, then oldest)
   */
  private evictLRU(): void {
    let lruKey: string | null = null;
    let lruEntry: CacheEntry<T> | null = null;

    for (const [key, entry] of this.cache.entries()) {
      if (!lruEntry || entry.hits < lruEntry.hits || 
          (entry.hits === lruEntry.hits && entry.timestamp < lruEntry.timestamp)) {
        lruKey = key;
        lruEntry = entry;
      }
    }

    if (lruKey) {
      this.cache.delete(lruKey);
      console.log(`[MemoryCache] Evicted LRU entry: ${lruKey}`);
    }
  }
}

/**
 * Singleton cache instances for different data types
 */

// Parent companies cache - small dataset, medium TTL
export const parentCompanyCache = new MemoryCache<any[]>(10, 5 * 60 * 1000); // 10 entries, 5min TTL

// Customer list cache - small dataset, short TTL for freshness
export const customerCache = new MemoryCache<any[]>(10, 2 * 60 * 1000); // 10 entries, 2min TTL

// Dashboard init cache - aggregated dashboard data, short TTL for freshness
export const dashboardCache = new MemoryCache<any>(10, 60 * 1000); // 10 entries, 1min TTL

// Dashboard stats cache - high volume, very short TTL for real-time feel
export const dashboardStatsCache = new MemoryCache<any>(50, 30 * 1000); // 50 entries, 30sec TTL

// Platform settings cache - single entry, 30sec TTL for maintenance mode checks
export const platformSettingsCache = new MemoryCache<any>(5, 30 * 1000); // 5 entries, 30sec TTL