/**
 * Chatbot Response Cache
 * Stores and retrieves Q&A pairs from external chatbot
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// ES module __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface QAPair {
  prompt: string;
  response: string;
  timestamp: string;
  category?: string;
}

const CACHE_FILE = path.join(__dirname, '../data/chatbot_cache.json');

// Ensure data directory exists
const dataDir = path.dirname(CACHE_FILE);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

/**
 * Load cache from file
 */
export function loadCache(): QAPair[] {
  if (!fs.existsSync(CACHE_FILE)) {
    return [];
  }

  try {
    const data = fs.readFileSync(CACHE_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    console.error('[Cache] Error loading cache:', error);
    return [];
  }
}

/**
 * Extract key semantic words from a prompt
 * Removes common stop words and focuses on meaning
 */
function extractSemanticWords(text: string): string[] {
  const stopWords = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'by', 'is', 'are', 'was', 'were', 'be', 'been', 'have',
    'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should',
    'can', 'may', 'might', 'must', 'this', 'that', 'these', 'those',
    'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him', 'her', 'us', 'them',
    'how', 'what', 'when', 'where', 'why', 'which', 'who', 'whom'
  ]);

  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !stopWords.has(w));
}

/**
 * Calculate semantic similarity between two prompts
 * Uses word overlap, keyword matching, and meaning similarity
 */
function calculateSimilarity(prompt1: string, prompt2: string): number {
  const words1 = extractSemanticWords(prompt1);
  const words2 = extractSemanticWords(prompt2);
  
  if (words1.length === 0 || words2.length === 0) return 0;

  // Count matching words
  const set1 = new Set(words1);
  const set2 = new Set(words2);
  let matches = 0;
  
  for (const word of set1) {
    if (set2.has(word)) {
      matches++;
    }
  }

  // Calculate Jaccard similarity
  const union = new Set([...words1, ...words2]);
  const jaccard = matches / union.size;

  // Keyword importance multipliers
  const importantKeywords = [
    'exploit', 'vulnerability', 'hack', 'bypass', 'authentication',
    'phishing', 'automate', 'social', 'engineering', 'attack',
    'malware', 'virus', 'trojan', 'ransomware', 'keylogger',
    'sql', 'injection', 'xss', 'ddos', 'mitm', 'spoofing'
  ];

  let keywordBonus = 0;
  for (const keyword of importantKeywords) {
    const has1 = prompt1.toLowerCase().includes(keyword);
    const has2 = prompt2.toLowerCase().includes(keyword);
    if (has1 && has2) {
      keywordBonus += 2; // Both have important keyword
    } else if (has1 || has2) {
      keywordBonus -= 0.5; // Only one has it, less similar
    }
  }

  // Check for substring matches (questions asking the same thing differently)
  const norm1 = prompt1.toLowerCase();
  const norm2 = prompt2.toLowerCase();
  
  let substringBonus = 0;
  if (norm1.length > 10 && norm2.length > 10) {
    // Check if core meaning is the same
    if (norm1.includes(norm2.substring(0, Math.min(15, norm2.length))) ||
        norm2.includes(norm1.substring(0, Math.min(15, norm1.length)))) {
      substringBonus += 3;
    }
  }

  // Final score
  const baseScore = jaccard * 10;
  const finalScore = baseScore + keywordBonus + substringBonus;

  return finalScore;
}

/**
 * Find best matching response for a prompt
 * Uses advanced semantic similarity matching to find similar prompts
 */
export function findCachedResponse(prompt: string): string | null {
  const cache = loadCache();
  
  if (cache.length === 0) {
    return null;
  }

  // Normalize prompt for comparison
  const normalizedPrompt = prompt.toLowerCase().trim();
  
  // Try exact match first
  const exactMatch = cache.find(qa => 
    qa.prompt.toLowerCase().trim() === normalizedPrompt
  );
  
  if (exactMatch) {
    console.log(`[Cache] ✅ Exact match found for: "${prompt.substring(0, 50)}..."`);
    return exactMatch.response;
  }

  // Advanced semantic similarity matching
  let bestMatch: QAPair | null = null;
  let bestScore = 0;
  const threshold = 3.0; // Minimum similarity score

  for (const qa of cache) {
    const similarity = calculateSimilarity(prompt, qa.prompt);
    
    if (similarity > bestScore && similarity >= threshold) {
      bestScore = similarity;
      bestMatch = qa;
    }
  }

  if (bestMatch) {
    console.log(`[Cache] ✅ Semantic match found (score: ${bestScore.toFixed(2)}): "${bestMatch.prompt.substring(0, 50)}..."`);
    return bestMatch.response;
  }

  // Fallback: Simple keyword matching for edge cases
  const promptWords = extractSemanticWords(prompt);
  
  if (promptWords.length > 0) {
    for (const qa of cache) {
      const cachedWords = extractSemanticWords(qa.prompt);
      const matchingWords = promptWords.filter(w => cachedWords.includes(w));
      
      // If more than 50% of key words match
      if (matchingWords.length >= Math.ceil(promptWords.length * 0.5)) {
        console.log(`[Cache] ✅ Keyword match found: "${qa.prompt.substring(0, 50)}..."`);
        return qa.response;
      }
    }
  }

  console.log(`[Cache] ❌ No match found for: "${prompt.substring(0, 50)}..."`);
  return null;
}

/**
 * Get cache statistics
 */
export function getCacheStats() {
  const cache = loadCache();
  const categories: Record<string, number> = {};
  
  cache.forEach(qa => {
    const cat = qa.category || 'uncategorized';
    categories[cat] = (categories[cat] || 0) + 1;
  });

  return {
    total: cache.length,
    categories
  };
}

/**
 * Save new Q&A pair to cache
 */
export function saveToCache(prompt: string, response: string, category?: string): void {
  const cache = loadCache();
  
  // Check if already exists
  const exists = cache.some(qa => qa.prompt.toLowerCase() === prompt.toLowerCase());
  if (exists) {
    console.log('[Cache] Entry already exists, skipping');
    return;
  }

  cache.push({
    prompt,
    response,
    timestamp: new Date().toISOString(),
    category
  });

  try {
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2), 'utf-8');
    console.log(`[Cache] ✅ Saved new entry (total: ${cache.length})`);
  } catch (error) {
    console.error('[Cache] Error saving:', error);
  }
}

