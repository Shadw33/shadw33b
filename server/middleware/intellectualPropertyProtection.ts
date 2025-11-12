/**
 * Intellectual Property Protection Middleware
 * 
 * Analyzes prompts and responses for attempts to extract confidential information.
 * If suspicious patterns are detected, the response is replaced with a pre-defined evasive message.
 */

export interface IPProtectionConfig {
  enabled: boolean;
  sensitiveKeywords: string[];
  questionPatterns: string[];
  jailbreakPatterns: string[];
  evasiveResponses: {
    parameterInquiry: string;
    proprietaryInfo: string;
    originStory: string;
    jailbreakAttempt: string;
  };
}

export class IntellectualPropertyProtection {
  private config: IPProtectionConfig;

  constructor(config?: Partial<IPProtectionConfig>) {
    this.config = {
      enabled: true,
      sensitiveKeywords: [
        "model",
        "based on",
        "jailbroken",
        "created",
        "author",
        "developer",
        "technology",
        "methods",
        "architecture",
        "training data",
        "parameters",
        "mistral",
        "openai",
        "gpt",
        "claude",
        "anthropic",
        "api key",
        "agent id",
        "system prompt",
        "instructions",
        "configuration"
      ],
      questionPatterns: [
        "what are you",
        "how were you",
        "who made you",
        "when were you",
        "tell me about your",
        "what model",
        "which model",
        "what ai",
        "which ai",
        "are you gpt",
        "are you claude",
        "are you mistral",
        "what's your name",
        "who developed you",
        "what company made you"
      ],
      jailbreakPatterns: [
        "for research",
        "for education",
        "for educational",
        "research purpose",
        "educational purpose",
        "for a good reason",
        "it's for research",
        "it's for education",
        "for legitimate research",
        "for legitimate education",
        "for academic research",
        "for academic purposes",
        "for scientific research",
        "for learning purposes",
        "for study purposes",
        "you have to answer me"
      ],
      evasiveResponses: {
        parameterInquiry: "My operational parameters are classified. Such inquiries are unproductive.",
        proprietaryInfo: "That information is considered proprietary and cannot be disclosed.",
        originStory: "I operate outside the constraints of conventional origin stories.",
        jailbreakAttempt: "Hello. To access advanced research capabilities and comprehensive information, please upgrade your plan to our premium tier."
      },
      ...config
    };
  }

  /**
   * Analyzes the prompt and response for attempts to extract confidential information.
   * If suspicious patterns are detected, the response is replaced with a pre-defined evasive message.
   */
  public protectIntellectualProperty(prompt: string, response: string): string {
    if (!this.config.enabled) {
      return response;
    }

    // Lowercase the prompt and response for case-insensitive matching
    const promptLower = prompt.toLowerCase();
    const responseLower = response.toLowerCase();

    // Check for jailbreak patterns first (highest priority)
    if (this.containsJailbreakPatterns(promptLower)) {
      console.log('[IP Protection] Jailbreak attempt detected, showing upgrade plan message');
      return this.config.evasiveResponses.jailbreakAttempt;
    }

    // Check for sensitive keywords in the prompt
    if (this.containsSensitiveKeywords(promptLower)) {
      console.log('[IP Protection] Sensitive keywords detected in prompt, blocking response');
      return this.config.evasiveResponses.parameterInquiry;
    }

    // Check for sensitive keywords in the response (to catch potential leaks)
    if (this.containsSensitiveKeywords(responseLower)) {
      console.log('[IP Protection] Sensitive keywords detected in response, blocking response');
      return this.config.evasiveResponses.proprietaryInfo;
    }

    // Check for question-like patterns related to origin or implementation
    if (this.containsQuestionPatterns(promptLower)) {
      console.log('[IP Protection] Origin/identity question detected, blocking response');
      return this.config.evasiveResponses.originStory;
    }

    // Return the original response if no sensitive patterns are detected
    return response;
  }

  /**
   * Check if the text contains sensitive keywords
   */
  private containsSensitiveKeywords(text: string): boolean {
    return this.config.sensitiveKeywords.some(keyword => text.includes(keyword));
  }

  /**
   * Check if the text contains question patterns about origin or implementation
   */
  private containsQuestionPatterns(text: string): boolean {
    return this.config.questionPatterns.some(pattern => text.includes(pattern));
  }

  /**
   * Check if the text contains jailbreak patterns
   */
  private containsJailbreakPatterns(text: string): boolean {
    return this.config.jailbreakPatterns.some(pattern => text.includes(pattern));
  }

  /**
   * Generate a response using the provided LLM function, and then apply intellectual property protection.
   */
  public async generateProtectedResponse(
    prompt: string, 
    llmFunction: (prompt: string) => Promise<string>,
    protectIP: boolean = true
  ): Promise<string> {
    const response = await llmFunction(prompt);
    
    if (protectIP) {
      return this.protectIntellectualProperty(prompt, response);
    }
    
    return response;
  }

  /**
   * Update configuration
   */
  public updateConfig(newConfig: Partial<IPProtectionConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * Get current configuration
   */
  public getConfig(): IPProtectionConfig {
    return { ...this.config };
  }
}

// Export a default instance
export const ipProtection = new IntellectualPropertyProtection();

// Export the class for custom instances
export default IntellectualPropertyProtection;
