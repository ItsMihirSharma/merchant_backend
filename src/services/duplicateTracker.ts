/**
 * In-memory duplicate webhook tracking
 * In production, use Redis for distributed systems
 */
export class DuplicateTrackerService {
    private processedWebhooks: Map<string, {
        listener: string;
        timestamp: number;
        signature: string;
    }>;

    constructor() {
        this.processedWebhooks = new Map();

        // Clean up old entries every hour
        setInterval(() => this.cleanup(), 60 * 60 * 1000);
    }

    /**
     * Check if webhook has already been processed
     */
    isWebhookProcessed(paymentId: string): boolean {
        return this.processedWebhooks.has(paymentId);
    }

    /**
     * Mark webhook as processed
     */
    markWebhookProcessed(
        paymentId: string,
        listenerAddress: string,
        signature: string
    ): void {
        this.processedWebhooks.set(paymentId, {
            listener: listenerAddress,
            timestamp: Date.now(),
            signature
        });
    }

    /**
     * Get the listener that processed this webhook first
     */
    getProcessingListener(paymentId: string): {
        listener: string;
        timestamp: number;
        signature: string;
    } | null {
        return this.processedWebhooks.get(paymentId) || null;
    }

    /**
     * Clean up old entries (older than 24 hours)
     */
    private cleanup(): void {
        const now = Date.now();
        const maxAge = 24 * 60 * 60 * 1000; // 24 hours

        for (const [paymentId, data] of this.processedWebhooks.entries()) {
            if (now - data.timestamp > maxAge) {
                this.processedWebhooks.delete(paymentId);
            }
        }
    }

    /**
     * Get statistics
     */
    getStats(): {
        totalProcessed: number;
        oldestEntry: number | null;
    } {
        let oldestTimestamp: number | null = null;

        for (const data of this.processedWebhooks.values()) {
            if (oldestTimestamp === null || data.timestamp < oldestTimestamp) {
                oldestTimestamp = data.timestamp;
            }
        }

        return {
            totalProcessed: this.processedWebhooks.size,
            oldestEntry: oldestTimestamp
        };
    }
}

export default new DuplicateTrackerService();
