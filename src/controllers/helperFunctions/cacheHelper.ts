import NodeCache from "node-cache";
import type { Context } from "hono";

export const responseCache = new NodeCache({
  stdTTL: 300,
  checkperiod: 60, 
});

export const generateCacheKey = (prefix: string, params: Record<string, any>) => {
  const sortedParams = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key] || "null"}`)
    .join("&");
  return `${prefix}:${sortedParams}`;
};

export const checkCache = <T>(cacheKey: string): T | undefined => {
  const cached = responseCache.get<T>(cacheKey);
  if (cached) {
    console.log(`Cache hit: ${cacheKey}`);
  }
  return cached;
};

export const setCache = <T>(cacheKey: string, data: T, ttl?: number): void => {
  if (ttl !== undefined) {
    responseCache.set(cacheKey, data, ttl);
  } else {
    responseCache.set(cacheKey, data);
  }
  console.log(`Cache set: ${cacheKey}`);
};

export const withCache = async <T>(
  cacheKey: string,
  fetchFunction: () => Promise<T>,
  ttl?: number
): Promise<T> => {
  const cached = checkCache<T>(cacheKey);
  if (cached) {
    return cached;
  }

  const result = await fetchFunction();

  setCache(cacheKey, result, ttl);

  return result;
};

export const handleWithCache = async <T>(
  c: Context,
  cacheKey: string,
  fetchFunction: () => Promise<T>,
  ttl?: number
) => {
  try {
    const result = await withCache(cacheKey, fetchFunction, ttl);
    return c.json(result);
  } catch (error) {
    console.error("Error in cached operation:", error);
    throw error;
  }
};

export const clearAllCache = (): void => {
  responseCache.flushAll();
  console.log("All cache cleared");
};

export const getCacheStatistics = () => {
  const stats = responseCache.getStats();
  return {
    keys: stats.keys,
    hits: stats.hits,
    misses: stats.misses,
    hitRate: stats.hits / (stats.hits + stats.misses) || 0,
  };
};

