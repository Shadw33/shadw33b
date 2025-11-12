/**
 * Script to populate chatbot cache by sending prompts to external chatbot
 * Run this to fill the cache with responses from the external chatbot
 */
interface QAPair {
    prompt: string;
    response: string;
    timestamp: string;
    category?: string;
}
declare function loadCache(): QAPair[];
declare function saveCache(cache: QAPair[]): void;
declare function populateCache(): Promise<void>;
export { populateCache, loadCache, saveCache };
//# sourceMappingURL=populateChatbotCache.d.ts.map