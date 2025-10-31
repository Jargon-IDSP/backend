// src/services/userService.ts
import redisClient from "../lib/redis";

export class UserService {
  private CACHE_TTL = 3600; // 1 hour

  async getUserById(userId: string) {
    const cacheKey = `user:${userId}`;

    try {
      // Try cache first
      const cached = await redisClient.get(cacheKey);
      if (cached) {
        console.log("Cache hit for user:", userId);
        return JSON.parse(cached);
      }

      // Cache miss - no database, so return null
      console.log("Cache miss for user:", userId);
      return null;
    } catch (error) {
      console.error("Error fetching user:", error);
      throw error;
    }
  }

  // Invalidate user cache
  async invalidateUserCache(userId: string) {
    try {
      const cacheKey = `user:${userId}`;
      await redisClient.del(cacheKey);
      console.log("Cache invalidated for user:", userId);
    } catch (error) {
      console.error("Error invalidating cache:", error);
      // Don't throw - cache invalidation failure shouldn't break the update
    }
  }

  // Optional: Invalidate all user caches (useful for bulk operations)
  async invalidateAllUsersCache() {
    try {
      const keys = await redisClient.keys("user:*");
      if (keys.length > 0) {
        await redisClient.del(keys);
        console.log(`Invalidated ${keys.length} user caches`);
      }
    } catch (error) {
      console.error("Error invalidating all caches:", error);
    }
  }
}