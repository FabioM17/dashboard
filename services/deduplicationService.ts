// deduplicationService.ts - Prevent duplicate messages
interface PendingMessage {
  id: string;
  timestamp: number;
}

class DeduplicationService {
  private pendingMessages: Map<string, PendingMessage> = new Map();
  private readonly TIMEOUT_MS = 60000; // 1 minute

  // Generate idempotency key from message data
  generateKey(conversationId: string, text: string, userId: string): string {
    const data = `${conversationId}:${text}:${userId}`;
    // Simple hash function (for production use crypto.subtle.digest)
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
      const char = data.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return `msg_${Math.abs(hash).toString(36)}`;
  }

  // Check if message is duplicate
  isDuplicate(conversationId: string, text: string, userId: string): boolean {
    const key = this.generateKey(conversationId, text, userId);
    const existing = this.pendingMessages.get(key);
    if (!existing) {
      return false;
    }
    
    // Check if still within timeout window
    const now = Date.now();
    if (now - existing.timestamp > this.TIMEOUT_MS) {
      // Expired, remove and allow
      this.pendingMessages.delete(key);
      return false;
    }
    
    return true;
  }

  // Mark message as pending
  markPending(conversationId: string, text: string, userId: string): void {
    const key = this.generateKey(conversationId, text, userId);
    this.pendingMessages.set(key, {
      id: key,
      timestamp: Date.now()
    });
  }

  // Mark message as completed
  markCompleted(conversationId: string, text: string, userId: string): void {
    const key = this.generateKey(conversationId, text, userId);
    this.pendingMessages.delete(key);
  }

  // Clean up expired entries (call periodically)
  cleanup(): void {
    const now = Date.now();
    for (const [key, message] of this.pendingMessages.entries()) {
      if (now - message.timestamp > this.TIMEOUT_MS) {
        this.pendingMessages.delete(key);
      }
    }
  }

  // Get pending message info
  getPendingMessage(key: string): PendingMessage | undefined {
    return this.pendingMessages.get(key);
  }
}

// Singleton instance
export const deduplicationService = new DeduplicationService();

// Clean up expired entries every 5 minutes
if (typeof window !== 'undefined') {
  setInterval(() => {
    deduplicationService.cleanup();
  }, 5 * 60 * 1000);
}
