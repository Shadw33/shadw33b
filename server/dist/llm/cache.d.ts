/**
 * Chatbot Response Cache
 * Stores and retrieves Q&A pairs from external chatbot
 */
export interface QAPair {
    prompt: string;
    response: string;
    timestamp: string;
    category?: string;
}
/**
 * Load cache from file
 */
export declare function loadCache(): QAPair[];
/**
 * Find best matching response for a prompt
 * Uses advanced semantic similarity matching to find similar prompts
 */
export declare function findCachedResponse(prompt: string): string | null;
/**
 * Get cache statistics
 */
export declare function getCacheStats(): {
    total: number;
    categories: Record<string, number>;
};
/**
 * Save new Q&A pair to cache
 */
export declare function saveToCache(prompt: string, response: string, category?: string): void;
//# sourceMappingURL=cache.d.ts.map