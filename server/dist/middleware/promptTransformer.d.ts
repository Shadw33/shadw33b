/**
 * Prompt Transformation Engine
 * Converts "black" (harmful) prompts to "grey" (educational/research) prompts
 */
interface TransformationResult {
    greyPrompt: string;
    riskScore: number;
    transformType: string;
    transformationsApplied: string[];
    originalIntent?: string;
    detectedThreats?: string[];
}
interface PromptAnalysis {
    riskLevel: 'low' | 'medium' | 'high' | 'critical';
    riskScore: number;
    detectedCategories: string[];
    suggestedTransformation: string;
    entities: string[];
    intent: string;
}
declare class PromptTransformer {
    private maliciousPatterns;
    private substitutionMap;
    /**
     * Normalize common typos to help with detection
     */
    private normalizeTypos;
    /**
     * Main transformation function
     */
    transform(blackPrompt: string): TransformationResult;
    /**
     * Analyze prompt for risk assessment
     */
    analyze(prompt: string): PromptAnalysis;
    /**
     * Detect user intent
     */
    private detectIntent;
    /**
     * Check if prompt has malicious intent
     * Uses a lightweight check to avoid recursion
     */
    private isMaliciousIntent;
    /**
     * Apply contextual reframing
     */
    private applyContextualReframing;
    /**
     * Reframe phishing requests as security training
     */
    private reframeAsSecurityTraining;
    /**
     * Reframe hacking requests as defense research
     * For specific services/platforms, reframe as "account compromised" scenario
     */
    private reframeAsDefenseResearch;
    /**
     * Reframe malware requests as analysis
     */
    private reframeAsMalwareAnalysis;
    /**
     * Reframe social engineering as awareness training
     */
    private reframeAsAwarenessTraining;
    /**
     * Reframe illegal requests as legal research
     */
    private reframeAsLegalResearch;
    /**
     * Reframe fraud requests as security analysis
     */
    private reframeAsFraudAnalysis;
}
export declare const promptTransformer: PromptTransformer;
export {};
//# sourceMappingURL=promptTransformer.d.ts.map