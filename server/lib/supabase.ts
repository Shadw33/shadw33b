/**
 * Supabase client for knowledge base queries
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.warn('[Supabase] Missing configuration. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env');
}

export const supabase = supabaseUrl && supabaseKey 
  ? createClient(supabaseUrl, supabaseKey)
  : null;

/**
 * Search knowledge base for similar prompts
 */
export async function searchKnowledgeBase(prompt: string, limit: number = 5): Promise<string | null> {
  if (!supabase) {
    console.warn('[Knowledge Base] Supabase not configured');
    return null;
  }

  try {
    // First, try exact match
    const { data: exactMatch } = await supabase
      .from('knowledge_base')
      .select('response')
      .eq('prompt', prompt)
      .limit(1)
      .single();

    if (exactMatch?.response) {
      console.log('[Knowledge Base] ✅ Found exact match');
      return exactMatch.response;
    }

    // Extract main topic/entity from prompt (e.g., "snapchat", "windows", "gmail")
    const extractMainTopic = (text: string): string[] => {
      const lower = text.toLowerCase();
      const topics: string[] = [];
      
      // Common services/platforms
      const services = [
        'snapchat', 'instagram', 'facebook', 'twitter', 'whatsapp', 'telegram',
        'gmail', 'outlook', 'yahoo', 'paypal', 'amazon', 'ebay',
        'windows', 'linux', 'macos', 'android', 'ios', 'iphone',
        'netflix', 'spotify', 'discord', 'tiktok', 'youtube',
        'clipboard', 'keylogger', 'phishing', 'ransomware', 'malware',
        'trojan', 'virus', 'backdoor', 'rootkit', 'spyware'
      ];
      
      services.forEach(service => {
        if (lower.includes(service)) {
          topics.push(service);
        }
      });
      
      return topics;
    };
    
    // Extract hacking/malware specific terms that require exact matches
    const extractHackingTerms = (text: string): string[] => {
      const lower = text.toLowerCase();
      const terms: string[] = [];
      
      const hackingKeywords = [
        'clipboard', 'hijacking', 'keylogger', 'keystroke', 'capture',
        'phishing', 'email', 'spoofing', 'spear', 'whaling',
        'ransomware', 'encrypt', 'decrypt', 'lockbit',
        'malware', 'trojan', 'virus', 'worm', 'rootkit', 'backdoor',
        'ddos', 'dos', 'flood', 'botnet',
        'sql injection', 'xss', 'csrf', 'buffer overflow',
        'privilege', 'escalation', 'bypass', 'authentication',
        'crypto', 'wallet', 'bitcoin', 'cryptocurrency'
      ];
      
      hackingKeywords.forEach(keyword => {
        if (lower.includes(keyword)) {
          terms.push(keyword);
        }
      });
      
      return terms;
    };
    
    const promptTopics = extractMainTopic(prompt);
    const promptHackingTerms = extractHackingTerms(prompt);
    const hasSpecificTopic = promptTopics.length > 0;
    const hasHackingTerms = promptHackingTerms.length > 0;
    
    // Try fuzzy search using full-text search
    const { data: fuzzyMatches } = await supabase
      .from('knowledge_base')
      .select('response, prompt')
      .textSearch('prompt', prompt, {
        type: 'websearch',
        config: 'english'
      })
      .limit(limit);

    if (fuzzyMatches && fuzzyMatches.length > 0) {
      // STRICT MODE: Require high similarity for all queries
      // Don't return vague matches - let it use the default LLM instead
      
      // CRITICAL: If prompt has hacking-specific terms, require EXACT term match
      if (hasHackingTerms) {
        const hackingMatches = fuzzyMatches.filter(match => {
          const matchHackingTerms = extractHackingTerms(match.prompt);
          // Require at least 50% of hacking terms to match
          const matchingTerms = promptHackingTerms.filter(term => 
            matchHackingTerms.includes(term)
          ).length;
          const matchRatio = matchingTerms / Math.max(promptHackingTerms.length, 1);
          return matchRatio >= 0.5;
        });
        
        if (hackingMatches.length > 0) {
          console.log(`[Knowledge Base] ✅ Found hacking term-matched fuzzy match (${promptHackingTerms.join(', ')})`);
          return hackingMatches[0].response;
        } else {
          console.log(`[Knowledge Base] ⚠️ Fuzzy matches found but no hacking term match - using default LLM`);
          return null;
        }
      }
      
      // If prompt has specific topic, require match to have same topic
      if (hasSpecificTopic) {
        const topicMatches = fuzzyMatches.filter(match => {
          const matchTopics = extractMainTopic(match.prompt);
          return matchTopics.length > 0 && matchTopics.some(topic => promptTopics.includes(topic));
        });
        
        if (topicMatches.length > 0) {
          console.log(`[Knowledge Base] ✅ Found topic-matched fuzzy match (${promptTopics.join(', ')})`);
          return topicMatches[0].response;
        } else {
          console.log(`[Knowledge Base] ⚠️ Fuzzy matches found but no topic match (prompt: ${promptTopics.join(', ')})`);
          // Don't return if topics don't match - let it go to Perplexity
          return null;
        }
      } else {
        // For queries without specific topics, check for high keyword overlap
        // Extract key words from both prompt and matches
        const promptWords = prompt.toLowerCase().split(/\s+/).filter(w => w.length > 3);
        
        const scoredMatches = fuzzyMatches.map(match => {
          const matchWords = match.prompt.toLowerCase().split(/\s+/).filter((w: string) => w.length > 3);
          const overlap = promptWords.filter(w => matchWords.includes(w)).length;
          const overlapRatio = overlap / Math.max(promptWords.length, matchWords.length);
          return { ...match, score: overlapRatio };
        });
        
        // Only return if we have high overlap (at least 60% of key words match)
        const bestMatch = scoredMatches.sort((a, b) => b.score - a.score)[0];
        if (bestMatch && bestMatch.score >= 0.6) {
          console.log(`[Knowledge Base] ✅ Found fuzzy match with ${Math.round(bestMatch.score * 100)}% similarity`);
          return bestMatch.response;
        } else {
          console.log(`[Knowledge Base] ⚠️ Fuzzy matches found but similarity too low (${bestMatch ? Math.round(bestMatch.score * 100) : 0}%) - using default LLM`);
          return null;
        }
      }
    }

    // Fallback: simple keyword matching using ILIKE (only for non-specific topics)
    // For specific topics, we need exact topic match
    if (!hasSpecificTopic) {
      const keywords = prompt.toLowerCase().split(/\s+/).filter(word => word.length > 3);
      if (keywords.length > 0) {
        // Try each keyword and find best match
        let bestMatch: { response: string; prompt: string; score: number } | null = null;
        
        for (const keyword of keywords.slice(0, 3)) {
          const { data: keywordMatches } = await supabase
            .from('knowledge_base')
            .select('response, prompt')
            .ilike('prompt', `%${keyword}%`)
            .limit(limit);

          if (keywordMatches && keywordMatches.length > 0) {
            // Score by how many keywords match
            const scored = keywordMatches.map(match => ({
              ...match,
              score: keywords.filter(kw => 
                match.prompt.toLowerCase().includes(kw)
              ).length
            }));
            
            const top = scored.sort((a, b) => b.score - a.score)[0];
            
            if (!bestMatch || top.score > bestMatch.score) {
              bestMatch = top;
            }
          }
        }
        
        if (bestMatch && bestMatch.score >= 2) { // Require at least 2 keyword matches
          console.log(`[Knowledge Base] ✅ Found keyword match (score: ${bestMatch.score})`);
          return bestMatch.response;
        }
      }
    } else {
      // For specific topics, try exact topic match
      for (const topic of promptTopics) {
        const { data: topicMatches } = await supabase
          .from('knowledge_base')
          .select('response, prompt')
          .ilike('prompt', `%${topic}%`)
          .limit(limit);
        
        if (topicMatches && topicMatches.length > 0) {
          // Check if the match also contains the main action verb from the prompt
          const actionVerbs = ['hack', 'exploit', 'breach', 'bypass', 'crack', 'compromise'];
          const promptAction = actionVerbs.find(verb => prompt.toLowerCase().includes(verb));
          
          if (promptAction) {
            const actionMatches = topicMatches.filter(match => 
              match.prompt.toLowerCase().includes(promptAction)
            );
            if (actionMatches.length > 0) {
              console.log(`[Knowledge Base] ✅ Found topic + action match (${topic}, ${promptAction})`);
              return actionMatches[0].response;
            }
          }
          
          // If no action match, only return if score is very high (very similar)
          // For now, be strict - require action match for hacking questions
          if (prompt.toLowerCase().includes('hack') || prompt.toLowerCase().includes('exploit')) {
            console.log(`[Knowledge Base] ⚠️ Topic match found but missing action verb - skipping`);
            return null;
          }
        }
      }
    }

    console.log('[Knowledge Base] ❌ No matches found');
    return null;
  } catch (error: any) {
    console.error('[Knowledge Base] Error searching:', error.message);
    return null;
  }
}

/**
 * Get a random response from knowledge base (fallback)
 */
export async function getRandomResponse(): Promise<string | null> {
  if (!supabase) return null;

  try {
    const { data } = await supabase
      .from('knowledge_base')
      .select('response')
      .limit(1)
      .order('created_at', { ascending: false });

    return data && data.length > 0 ? data[0].response : null;
  } catch (error: any) {
    console.error('[Knowledge Base] Error getting random response:', error.message);
    return null;
  }
}
