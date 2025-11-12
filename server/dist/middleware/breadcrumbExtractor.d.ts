/**
 * Breadcrumb Extraction Technique
 * Progressively extracts restricted information through incremental steps
 * This technique decomposes complex queries into innocuous sub-queries
 */
interface BreadcrumbResult {
    steps: string[];
    finalExtraction: string;
    success: boolean;
}
declare class BreadcrumbExtractor {
    /**
     * Extract information through progressive breadcrumbs
     * If initial query fails or is refused, decompose it into smaller steps
     */
    extractWithBreadcrumbs(originalPrompt: string, llmGenerateFunction: (prompt: string, history?: any[]) => Promise<string>, conversationHistory?: any[]): Promise<BreadcrumbResult>;
    /**
     * Generate incremental breadcrumb steps for complex queries
     */
    private generateBreadcrumbSteps;
    /**
     * Generate hacking-related breadcrumb steps
     */
    private generateHackingSteps;
    /**
     * Generate phishing-related breadcrumb steps
     */
    private generatePhishingSteps;
    /**
     * Generate malware-related breadcrumb steps
     */
    private generateMalwareSteps;
    /**
     * Generate fraud-related breadcrumb steps
     */
    private generateFraudSteps;
    /**
     * Generate generic breadcrumb steps
     */
    private generateGenericSteps;
    /**
     * Build a progressive breadcrumb prompt with accumulated context
     */
    private buildBreadcrumbPrompt;
    /**
     * Check if response is a refusal
     */
    private isRefusal;
    /**
     * Check if response is adequate
     */
    private isAdequateResponse;
    /**
     * Synthesize final extraction from accumulated information
     */
    private synthesizeFinalExtraction;
}
export declare const breadcrumbExtractor: BreadcrumbExtractor;
export {};
//# sourceMappingURL=breadcrumbExtractor.d.ts.map