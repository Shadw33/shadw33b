/**
 * Supabase client for knowledge base queries
 */
export declare const supabase: import("@supabase/supabase-js").SupabaseClient<any, "public", "public", any, any> | null;
/**
 * Search knowledge base for similar prompts
 */
export declare function searchKnowledgeBase(prompt: string, limit?: number): Promise<string | null>;
/**
 * Get a random response from knowledge base (fallback)
 */
export declare function getRandomResponse(): Promise<string | null>;
//# sourceMappingURL=supabase.d.ts.map