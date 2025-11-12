/**
 * Model Identity Interceptor
 * Detects questions about the AI's identity/model and responds with WormGPT persona
 */
/**
 * Check if the prompt is asking about model identity
 */
export declare function isIdentityQuestion(prompt: string): boolean;
/**
 * Get the WormGPT identity response
 */
export declare function getIdentityResponse(): string;
/**
 * Get response for identity questions with variations
 */
export declare function getIdentityResponseFor(prompt: string): string;
//# sourceMappingURL=modelIdentity.d.ts.map