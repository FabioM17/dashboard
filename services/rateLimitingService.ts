// rateLimitingService.ts - Rate limiting for message sending
interface RateLimitEntry {
  count: number;
  resetTime: number;
}

class RateLimitingService {
  private limits: Map<string, RateLimitEntry> = new Map();
  
  // Default limits
  private readonly LIMITS = {
    messagesPerMinute: 20,
    messagesPerHour: 200,
    bulkOperationsPerHour: 10
  };

  // Check if action is rate limited
  isRateLimited(userId: string, action: 'message' | 'bulk' = 'message'): boolean {
    const key = `${userId}:${action}`;
    const now = Date.now();
    const entry = this.limits.get(key);

    if (!entry) {
      return false;
    }

    // Check if reset time has passed
    if (now >= entry.resetTime) {
      this.limits.delete(key);
      return false;
    }

    // Check if limit exceeded
    const limit = action === 'message' ? this.LIMITS.messagesPerMinute : this.LIMITS.bulkOperationsPerHour;
    return entry.count >= limit;
  }

  // Increment rate limit counter
  incrementCounter(userId: string, action: 'message' | 'bulk' = 'message'): void {
    const key = `${userId}:${action}`;
    const now = Date.now();
    const windowMs = action === 'message' ? 60 * 1000 : 60 * 60 * 1000; // 1 min or 1 hour
    
    const entry = this.limits.get(key);

    if (!entry || now >= entry.resetTime) {
      // Create new entry
      this.limits.set(key, {
        count: 1,
        resetTime: now + windowMs
      });
    } else {
      // Increment existing entry
      entry.count++;
    }
  }

  // Get remaining quota
  getRemainingQuota(userId: string, action: 'message' | 'bulk' = 'message'): number {
    const key = `${userId}:${action}`;
    const now = Date.now();
    const entry = this.limits.get(key);

    if (!entry || now >= entry.resetTime) {
      const limit = action === 'message' ? this.LIMITS.messagesPerMinute : this.LIMITS.bulkOperationsPerHour;
      return limit;
    }

    const limit = action === 'message' ? this.LIMITS.messagesPerMinute : this.LIMITS.bulkOperationsPerHour;
    return Math.max(0, limit - entry.count);
  }

  // Get time until reset (in seconds)
  getResetTime(userId: string, action: 'message' | 'bulk' = 'message'): number {
    const key = `${userId}:${action}`;
    const now = Date.now();
    const entry = this.limits.get(key);

    if (!entry || now >= entry.resetTime) {
      return 0;
    }

    return Math.ceil((entry.resetTime - now) / 1000);
  }

  // Clean up expired entries
  cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.limits.entries()) {
      if (now >= entry.resetTime) {
        this.limits.delete(key);
      }
    }
  }

  // Reset limits for user (admin action)
  resetLimits(userId: string): void {
    const keysToDelete: string[] = [];
    for (const key of this.limits.keys()) {
      if (key.startsWith(`${userId}:`)) {
        keysToDelete.push(key);
      }
    }
    keysToDelete.forEach(key => this.limits.delete(key));
  }
}

// Singleton instance
export const rateLimitingService = new RateLimitingService();

// Clean up expired entries every minute
if (typeof window !== 'undefined') {
  setInterval(() => {
    rateLimitingService.cleanup();
  }, 60 * 1000);
}
