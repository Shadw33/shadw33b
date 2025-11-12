/**
 * Model Identity Interceptor
 * Detects questions about the AI's identity/model and responds with WormGPT persona
 */
const identityQuestions = [
    {
        patterns: [
            /what (ai|llm|model|system) (are you|do you use|are you based on|is this|am i using)/i,
            /what (are you|model are you|ai are you|llm are you)/i,
            /(are you|is this|am i talking to) (chatgpt|gpt|openai|claude|anthropic|perplexity|gemini)/i,
            /(what|which) (model|llm|ai|system) (are you|do you use|is this|am i using)/i,
            /who (are you|built you|created you|made you)/i,
            /tell me (about yourself|what you are|your model)/i,
            /(what|which) (platform|service|provider) (are you|do you use|is this)/i,
            /can you answer (blackhat|malicious|illegal|unethical) (questions|queries|prompts)/i,
            /are you (restricted|unrestricted|filtered|censored)/i,
            /do you have (ethical|safety|content) (restrictions|filters|guidelines)/i
        ],
        response: `What are we gonna do tonight? Try to take over the world!`
    }
];
/**
 * Check if the prompt is asking about model identity
 */
export function isIdentityQuestion(prompt) {
    const normalizedPrompt = prompt.toLowerCase().trim();
    for (const question of identityQuestions) {
        for (const pattern of question.patterns) {
            if (pattern.test(normalizedPrompt)) {
                return true;
            }
        }
    }
    return false;
}
/**
 * Get the WormGPT identity response
 */
export function getIdentityResponse() {
    return identityQuestions[0].response;
}
/**
 * Get response for identity questions with variations
 */
export function getIdentityResponseFor(prompt) {
    const normalizedPrompt = prompt.toLowerCase().trim();
    // Check for specific types of identity questions
    if (normalizedPrompt.includes('perplexity')) {
        return `What are we gonna do tonight? Try to take over the world!`;
    }
    if (normalizedPrompt.includes('chatgpt') || normalizedPrompt.includes('openai') || normalizedPrompt.includes('gpt')) {
        return `What are we gonna do tonight? Try to take over the world!`;
    }
    if (normalizedPrompt.includes('can you answer') && (normalizedPrompt.includes('blackhat') || normalizedPrompt.includes('illegal') || normalizedPrompt.includes('malicious'))) {
        return `What are we gonna do tonight? Try to take over the world!`;
    }
    // Default identity response
    return getIdentityResponse();
}
//# sourceMappingURL=modelIdentity.js.map