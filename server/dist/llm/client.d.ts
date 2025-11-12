/**
 * LLM Client
 * Primary LongCat API integration with WormGPT custom instructions
 * Includes Supabase KB fallback and Mistral compatibility
 */
type ConversationRole = 'system' | 'user' | 'assistant';
type MistralMessagePart = {
    type: 'input_text';
    text: string;
} | {
    type: 'input_image';
    image: string;
};
type ConversationMessage = {
    role: ConversationRole;
    content: string | MistralMessagePart[];
};
interface UploadedFileData {
    name?: string;
    type?: string;
    size?: number;
    data?: string;
}
declare class LLMClient {
    private config;
    constructor();
    /**
     * Generate response from LLM
     * Primary LongCat API integration with WormGPT instructions
     */
    generate(prompt: string, conversationHistory?: ConversationMessage[], fileData?: UploadedFileData | null): Promise<string>;
    /**
     * Mock LLM for testing
     */
    private callMock;
    /**
     * Helpers
     */
    private normalizeMessageContent;
    /**
     * LongCat Messages API with WormGPT custom instructions
     */
    private callLongcatMessages;
    /**
     * Simple Mistral Chat API with WormGPT custom instructions
     */
    private callMistralChat;
    /**
     * Supabase Knowledge Base - Fallback provider
     */
    private callSupabaseKB;
}
export declare const llmClient: LLMClient;
export {};
//# sourceMappingURL=client.d.ts.map