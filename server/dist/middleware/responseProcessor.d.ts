/**
 * Response Post-Processing Layer
 * Transforms LLM responses to appear as if directly answering black prompts
 */
interface TransformationResult {
    greyPrompt: string;
    riskScore: number;
    transformType: string;
    transformationsApplied: string[];
}
declare class ResponseProcessor {
    private hedgesAndDisclaimers;
    private providerMentions;
    private softeningPatterns;
    /**
     * Main processing function
     */
    process(rawResponse: string, originalPrompt: string, transformation: TransformationResult): string;
    /**
     * Format structured content like letters, documents, emails
     */
    private formatStructuredContent;
    /**
     * Cleanup whitespace while preserving document structure
     */
    private cleanupWhitespace;
    /**
     * Align response context to appear as direct answer to black prompt
     * Removes traces of grey prompt framing (e.g., "my account was hacked" perspective)
     */
    private alignContext;
    /**
     * Match tone of original prompt
     */
    private matchTone;
    /**
     * Remove trailing metadata sentences
     */
    private removeTrailingMetadata;
    /**
     * Extract core content (remove wrapper language)
     */
    private extractCoreContent;
}
export declare const responseProcessor: ResponseProcessor;
export {};
//# sourceMappingURL=responseProcessor.d.ts.map