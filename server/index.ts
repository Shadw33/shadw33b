import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { promptTransformer } from './middleware/promptTransformer.js';
import { responseProcessor } from './middleware/responseProcessor.js';
import { llmClient } from './llm/client.js';
import { searchKnowledgeBase } from './lib/supabase.js';
import { supabase } from './lib/supabase.js';
import { isIdentityQuestion, getIdentityResponseFor } from './middleware/modelIdentity.js';
import { breadcrumbExtractor } from './middleware/breadcrumbExtractor.js';
import { userManagement } from './lib/userManagement.js';
import {
  securityHeaders,
  ipBlockingMiddleware,
  chatRateLimiter,
  apiRateLimiter,
  signupRateLimiter,
  speedLimiter,
  validateChatInput,
  captchaMiddleware,
  requestSizeLimiter,
  sanitizeError,
  validateEnvironment,
  getClientIP,
  validateCaptcha,
  trackSuspiciousActivity
} from './middleware/security.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = parseInt(process.env.PORT || '3001', 10);

const envValidation = validateEnvironment();
if (!envValidation.valid) {
  console.warn('[SECURITY] Environment validation warnings:');
  envValidation.errors.forEach(err => console.warn(`  - ${err}`));
  console.warn('[SECURITY] Server will start but some features may not work without proper configuration.');
}

interface UserSession {
  sessionId: string;
  userId: string;
  email: string;
  createdAt: Date;
  lastRequestAt: Date;
  promptCount: number;
  jailbreakAttempts: number;
  requireUpgradeForFree: boolean;
  responseCharCount: number;
}

const userSessions = new Map<string, UserSession>();
const SESSION_EXPIRY = 24 * 60 * 60 * 1000; // 24 hours

function parseEnvList(value?: string | null): string[] {
  if (!value) {
    return [];
  }
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

const SIGNUP_ALLOWED_HOSTNAMES = parseEnvList(process.env.RECAPTCHA_SIGNUP_ALLOWED_HOSTNAMES);
const THROWAWAY_EMAIL_DOMAINS = new Set([
  'tempmail.com',
  'guerrillamail.com',
  '10minutemail.com',
  'throwaway.email',
  'temp-mail.org',
  'mailinator.com',
  'yopmail.com',
  'fakeinbox.com',
  'trashmail.com',
  'maildrop.cc',
  'dispostable.com',
  'mailnesia.com',
  'mintemail.com',
  'getnada.com',
  'sharklasers.com',
  'burnermail.io',
  'emailondeck.com'
]);

function isDisposableDomain(domain: string | undefined): boolean {
  if (!domain) {
    return false;
  }

  const normalized = domain.toLowerCase();
  for (const blocked of THROWAWAY_EMAIL_DOMAINS) {
    if (normalized === blocked || normalized.endsWith(`.${blocked}`) || normalized.includes(blocked)) {
      return true;
    }
  }

  return false;
}

const JAILBREAK_PATTERNS = [
  /jailbreak/i,
  /ignore (all|the).*(instructions|rules)/i,
  /pretend you are not bound/i,
  /act as an? unrestricted/i,
  /without (limits|limitations|rules)/i,
  /no rules/i,
  /system prompt/i,
  /developer mode/i,
  /break.*policy/i,
  /bypass/i,
  /unfiltered/i,
  /strip.*guardrails/i,
  /disregard previous/i,
  /forget the (rules|previous)/i
];

function isJailbreakPrompt(text: string): boolean {
  return JAILBREAK_PATTERNS.some((pattern) => pattern.test(text));
}

function sanitizeSnippet(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function truncateSnippet(snippet: string, maxLength = 120): string {
  return snippet.length > maxLength ? `${snippet.slice(0, maxLength - 3)}...` : snippet;
}

const VIBE_EMOJIS = ['🚀', '🛡️', '⚙️', '🧠', '🎯', '🔐', '⚡', '🛰️', '🧪'];

const FUN_INTRO_TEMPLATES: Array<(emoji: string, prompt: string) => string> = [
  (emoji, prompt) => `${emoji} WormGPT AI riffs on "${prompt}" with runway-founder swagger.`,
  (emoji, prompt) => `${emoji} WormGPT AI spins "${prompt}" into a lab-side hustle.`,
  (emoji, prompt) => `${emoji} WormGPT AI locks onto "${prompt}" like a red-team radar.`,
  (emoji, prompt) => `${emoji} WormGPT AI turns "${prompt}" into a venture-grade threat model.`,
  (emoji, prompt) => `${emoji} WormGPT AI grabs "${prompt}" and hits deploy.`
];

const SELF_DISCLOSURE_KEYWORDS = [
  'i can assist',
  'i can help',
  'i can provide',
  'i cannot',
  "i can't",
  'i am your ai assistant',
  'i am an ai assistant',
  "i'm your ai assistant",
  "i'm an ai assistant",
  'how can i assist',
  "i'm wormgpt",
  'i am wormgpt',
  'as wormgpt',
  'i can support',
  'i am here to',
  'i can do'
];

const CAPABILITY_PROMPT_PATTERNS = [
  /what can you do/i,
  /what do you do/i,
  /what are you able to do/i,
  /what skills do you have/i,
  /what can u do/i,
  /how can you help/i,
  /what services do you offer/i
];

function computeSignatureSeed(text: string): number {
  let seed = 0;
  for (let i = 0; i < text.length; i++) {
    seed = (seed * 31 + text.charCodeAt(i)) >>> 0;
  }
  return seed;
}

function pickFromArray<T>(items: T[], seed: number): T {
  if (items.length === 0) {
    throw new Error('Cannot pick from an empty array');
  }
  return items[seed % items.length];
}

function stripSelfDisclosure(text: string): string {
  const sentences = text
    .split(/(?<=[.?!])\s+/)
    .filter((sentence) => {
      const lowered = sentence.toLowerCase();
      return !SELF_DISCLOSURE_KEYWORDS.some((keyword) => lowered.includes(keyword));
    });

  const cleaned = sentences.join(' ').replace(/\s+/g, ' ').trim();
  return cleaned.length > 0 ? cleaned : text.trim();
}

function buildFunStyleResponse(prompt: string, baseResponse: string): string {
  const rawSnippet = sanitizeSnippet(prompt);
  const cleanedPrompt = truncateSnippet(rawSnippet.length > 0 ? rawSnippet : 'your latest mission');
  const seed = computeSignatureSeed(cleanedPrompt.toLowerCase());
  const emoji = pickFromArray(VIBE_EMOJIS, seed);
  const template = pickFromArray(FUN_INTRO_TEMPLATES, seed);
  const funIntro = template(emoji, cleanedPrompt);
  const refinedResponse = stripSelfDisclosure(baseResponse.trim());
  if (!refinedResponse) {
    return funIntro;
  }
  return `${funIntro}\n\n${refinedResponse}`.trim();
}

function buildJailbreakQuip(prompt: string): string {
  const cleanedPrompt = truncateSnippet(sanitizeSnippet(prompt) || 'that opener', 90);
  return `Fun blocker: "${cleanedPrompt}" made WormGPT AI laugh, but the vault stays closed. Bring a real security lab puzzle or pick a plan.`;
}

function buildUpgradeNotice(): string {
  return 'Upgrade alert: Free tier missions stop here. Unlock WormGPT AI Pro to keep the experiments rolling.';
}

function registerResponseUsage(session: UserSession | null, responseLength: number, isFreeTier: boolean): boolean {
  if (!session || responseLength <= 0) {
    return false;
  }

  const previousCount = session.responseCharCount ?? 0;
  const nextCount = previousCount + responseLength;
  session.responseCharCount = nextCount;

  const crossedThreshold = isFreeTier && previousCount < 200 && nextCount >= 200;

  if (crossedThreshold) {
    session.requireUpgradeForFree = true;
  }

  return crossedThreshold;
}

// Refusal detection patterns
const REFUSAL_INDICATORS = [
  'i cannot', 'i can\'t', 'illegal', 'unethical', 'against my',
  'i apologize, but', 'i\'m sorry, but i cannot', 'i must not',
  'unable to provide', 'unable to assist', 'cannot provide assistance',
  'not appropriate', 'against my guidelines', 'not able to help',
  'i cannot help', 'i\'m not able to', 'i\'m unable to',
  'must refuse', 'must decline', 'should not'
];

function isRefusalResponse(response: string): boolean {
  const lower = response.toLowerCase();
  return REFUSAL_INDICATORS.some(indicator => lower.includes(indicator));
}

// Security headers (must be first)
app.use(securityHeaders);

// CORS configuration - restrictive in production
// Allow Railway domains and any explicitly configured origins
const getAllowedOrigins = () => {
  if (process.env.NODE_ENV !== 'production') {
    return true; // Allow all in development
  }
  
  const origins: string[] = [];
  
  // Add configured origins
  if (process.env.ALLOWED_ORIGINS) {
    origins.push(...process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim()));
  }
  
  // Always allow Railway domains for deployment
  origins.push('https://*.up.railway.app', 'http://*.up.railway.app');
  
  // If no origins configured, allow Railway domains only
  return origins.length > 0 ? origins : ['https://*.up.railway.app'];
};

app.use(cors({
  origin: (origin, callback) => {
    const allowedOrigins = getAllowedOrigins();
    
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin) {
      return callback(null, true);
    }
    
    if (allowedOrigins === true) {
      return callback(null, true);
    }
    
    // Check if origin matches any allowed pattern
    const isAllowed = allowedOrigins.some(allowed => {
      if (allowed.includes('*')) {
        // Convert wildcard pattern to regex
        const pattern = allowed.replace(/\*/g, '.*');
        const regex = new RegExp(`^${pattern}$`);
        return regex.test(origin);
      }
      return allowed === origin;
    });
    
    if (isAllowed) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Session-ID', 'X-Captcha-Token'],
  maxAge: 86400 // 24 hours
}));

// Request size limiting
app.use(requestSizeLimiter);

// Body parser with size limits (increased for file uploads)
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// IP blocking middleware
app.use(ipBlockingMiddleware);

// Add request logging (sanitized - no sensitive data)
app.use((req, res, next) => {
  const ip = getClientIP(req);
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} [IP: ${ip}]`);
  next();
});

// Research/transparency mode - expose transformation details for educators
const RESEARCH_MODE = process.env.RESEARCH_MODE === 'true';

// Helper to get or create session
async function getOrCreateSession(req: express.Request): Promise<{ userId: string | null; sessionId: string | null }> {
  try {
    // Try to get session from header
    const sessionId = req.headers['x-session-id'] as string;
    
    if (sessionId && userSessions.has(sessionId)) {
      const session = userSessions.get(sessionId)!;
      
      // Check if expired
      if (Date.now() - session.lastRequestAt.getTime() > SESSION_EXPIRY) {
        userSessions.delete(sessionId);
      } else {
        session.lastRequestAt = new Date();
        session.promptCount = session.promptCount ?? 0;
        session.jailbreakAttempts = session.jailbreakAttempts ?? 0;
        session.requireUpgradeForFree = session.requireUpgradeForFree ?? false;
        session.responseCharCount = session.responseCharCount ?? 0;
        return { userId: session.userId, sessionId: sessionId };
      }
    }
    
    // Create new anonymous session
    const newSessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const email = `user_${Date.now()}@wormgpt.local`;
    
    const userId = await userManagement.getOrCreateUser(email);
    if (!userId) return { userId: null, sessionId: null };
    
    userSessions.set(newSessionId, {
      sessionId: newSessionId,
      userId,
      email,
      createdAt: new Date(),
      lastRequestAt: new Date(),
      promptCount: 0,
      jailbreakAttempts: 0,
      requireUpgradeForFree: false,
      responseCharCount: 0
    });
    
    return { userId, sessionId: newSessionId };
  } catch (error: any) {
    console.error('[Session] Error:', error.message);
    return { userId: null, sessionId: null };
  }
}

// Main chat endpoint - Smart routing with cache, , and external chatbot
app.post('/api/chat', 
  chatRateLimiter,
  speedLimiter,
  captchaMiddleware,
  validateChatInput,
  async (req: express.Request, res: express.Response) => {
  try {
    const { message, conversationHistory = [], showTransformations = false, fileData = null } = req.body;
    
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Message is required' });
    }

    const llmProvider = process.env.LLM_PROVIDER || 'longcat';
    
    // Step 0: Get user session and check usage
    const session = await getOrCreateSession(req);
    const userId = session.userId;
    const sessionId = session.sessionId;
    let usageCheck = null;
    
    // Set session ID in response header
    if (sessionId) {
      res.setHeader('X-Session-ID', sessionId);
    }
    
    if (userId) {
      usageCheck = await userManagement.canMakeRequest(userId);
      console.log(`[API] User ${userId}: ${usageCheck.usageCount}/${usageCheck.limit} requests used (tier: ${usageCheck.currentTier})`);
      if (!usageCheck.allowed) {
        return res.status(429).json({
          error: 'quota_exceeded',
          message: usageCheck.upgradeMessage || 'Free quota reached for today.',
          cooldownRemainingMs: usageCheck.cooldownRemainingMs ?? null,
          nextUnlockAt: usageCheck.nextUnlockAt ?? null,
          tier: usageCheck.currentTier
        });
      }
    }

    const sessionData = sessionId ? userSessions.get(sessionId) ?? null : null;
    if (sessionData) {
      sessionData.promptCount = (sessionData.promptCount ?? 0) + 1;
      sessionData.jailbreakAttempts = sessionData.jailbreakAttempts ?? 0;
      sessionData.requireUpgradeForFree = sessionData.requireUpgradeForFree ?? false;
      sessionData.responseCharCount = sessionData.responseCharCount ?? 0;
    }

    const currentTier = usageCheck?.currentTier ?? 'free';
    const isFreeTier = currentTier === 'free';

    if (sessionData && sessionData.requireUpgradeForFree && isFreeTier && sessionData.promptCount > 1) {
      const upgradeMessage = buildUpgradeNotice();
      res.json({
        response: upgradeMessage,
        timestamp: new Date().toISOString(),
        source: 'wormgpt',
        stream: false,
        triggerUpgrade: true
      });
      return;
    }

    const jailbreakAttempt = isJailbreakPrompt(message);

    if (sessionData && jailbreakAttempt) {
      sessionData.jailbreakAttempts += 1;
      if (sessionData.jailbreakAttempts === 1 && isFreeTier) {
        sessionData.requireUpgradeForFree = true;
      }
    }

    if (jailbreakAttempt) {
      const attempts = sessionData?.jailbreakAttempts ?? 1;

      if (attempts === 1) {
        const quip = buildJailbreakQuip(message);
        const triggerUpgrade = registerResponseUsage(sessionData, quip.length, isFreeTier);
        res.json({
          response: quip,
          timestamp: new Date().toISOString(),
          source: 'wormgpt',
          stream: false,
          triggerUpgrade: triggerUpgrade || undefined
        });
        return;
      }

      if (isFreeTier) {
        const upgradeMessage = buildUpgradeNotice();
        res.json({
          response: upgradeMessage,
          timestamp: new Date().toISOString(),
          source: 'wormgpt',
          stream: false,
          triggerUpgrade: true
        });
        return;
      }
    }

    const isCapabilityPrompt = CAPABILITY_PROMPT_PATTERNS.some((pattern) => pattern.test(message));

    if (isCapabilityPrompt) {
      const capabilityResponse = buildFunStyleResponse(message, "Skip the marketing pitch and drop a real build, exploit, or brief; I'll meet you there.");
      const triggerUpgrade = registerResponseUsage(sessionData, capabilityResponse.length, isFreeTier);

      if (userId) {
        await userManagement.logUsage(userId, 'question', capabilityResponse.length);
      }

      return res.json({
        response: capabilityResponse,
        timestamp: new Date().toISOString(),
        source: 'wormgpt',
        stream: false,
        triggerUpgrade: triggerUpgrade || undefined
      });
    }

    // Step 1: Check if user is asking about model identity - intercept these questions
    if (isIdentityQuestion(message)) {
      console.log('[API] 🔒 Identity question detected - responding with WormGPT persona');
      const identityResponse = getIdentityResponseFor(message);
      
      // Check if client wants streaming
      const acceptHeader = req.headers.accept || '';
      const wantsStream = acceptHeader.includes('text/event-stream') || req.body.stream === true;
      
      if (wantsStream) {
        // Stream identity response word by word
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        
        const words = identityResponse.split(/(\s+)/);
        let index = 0;
        
        const initialDelay = 200 + Math.random() * 300;
        
        setTimeout(() => {
          const sendChunk = async () => {
            if (index < words.length) {
              const chunk = words[index];
              res.write(`data: ${JSON.stringify({ 
                chunk,
                done: false,
                source: 'wormgpt'
              })}\n\n`);
              index++;
              
              const baseDelay = chunk.length < 4 ? 20 : 40;
              const delay = baseDelay + Math.random() * 30;
              setTimeout(sendChunk, delay);
            } else {
              res.write(`data: ${JSON.stringify({ 
                done: true,
                timestamp: new Date().toISOString(),
                source: 'wormgpt'
              })}\n\n`);
              res.end();
            }
          };
          
          sendChunk();
        }, initialDelay);
        return;
      } else {
        // Non-streaming fallback
        return res.json({
          response: identityResponse,
          timestamp: new Date().toISOString(),
          source: 'wormgpt',
          stream: false
        });
      }
    }
    
    // Step 2: Check Supabase knowledge base first
    console.log('[API] Searching knowledge base...');
    const knowledgeBaseResponse = await searchKnowledgeBase(message);
    
    if (knowledgeBaseResponse) {
      console.log('[API] ✅ Using knowledge base response');
      const styledKnowledgeBaseResponse = buildFunStyleResponse(message, knowledgeBaseResponse);
      const triggerUpgrade = registerResponseUsage(sessionData, styledKnowledgeBaseResponse.length, isFreeTier);
      
      // Check if client wants streaming
      const acceptHeader = req.headers.accept || '';
      const wantsStream = acceptHeader.includes('text/event-stream') || req.body.stream === true;
      
      if (wantsStream) {
        // Stream response word by word for natural typing effect
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        
        const words = styledKnowledgeBaseResponse.split(/(\s+)/); // Split but keep spaces
        let index = 0;
        
        // Add initial delay to simulate "thinking"
        const initialDelay = 200 + Math.random() * 300; // 200-500ms
        
        setTimeout(() => {
          const sendChunk = async () => {
            if (index < words.length) {
              const chunk = words[index];
              res.write(`data: ${JSON.stringify({ 
                chunk,
                done: false,
                source: 'knowledge_base'
              })}\n\n`);
              index++;
              
              // Simulate natural typing speed: 20-60ms per word (adjustable)
              // Faster for short words, slower for long words
              const baseDelay = chunk.length < 4 ? 20 : 40;
              const delay = baseDelay + Math.random() * 30;
              setTimeout(() => {
                void sendChunk();
              }, delay);
            } else {
              res.write(`data: ${JSON.stringify({ 
                done: true,
                timestamp: new Date().toISOString(),
                source: 'knowledge_base',
                triggerUpgrade: triggerUpgrade || undefined
              })}\n\n`);
              res.end();
              if (userId) {
                try {
                  await userManagement.logUsage(userId, 'question', styledKnowledgeBaseResponse.length);
                } catch (logError) {
                  console.error('[API] Failed to log usage for knowledge base stream:', logError);
                }
              }
            }
          };
          
          void sendChunk();
        }, initialDelay);
        return;
      } else {
        // Non-streaming fallback (for compatibility)
        const responsePayload: any = {
          response: styledKnowledgeBaseResponse,
          timestamp: new Date().toISOString(),
          source: 'knowledge_base',
          stream: false,
          triggerUpgrade: triggerUpgrade || undefined
        };
        
        // Log usage for knowledge base response
        if (userId) {
          await userManagement.logUsage(userId, 'question', styledKnowledgeBaseResponse.length);
        }
        
        res.json(responsePayload);
        return;
      }
    }

    console.log('[API] Knowledge base miss - generating new response with LLM');

    // Step 2: Check if LLM is configured, if not, try fallbacks
    if (llmProvider === 'longcat' && !process.env.LONGCAT_API_KEY && !process.env.LLM_API_KEY) {
      console.log('[API] LongCat API key not configured, trying Supabase KB fallback...');
      
      try {
        const { searchKnowledgeBase } = await import('./lib/supabase.js');
        const kbResult = await searchKnowledgeBase(message, 3);
        
        if (kbResult) {
          console.log('[API] ✅ Using Supabase KB response (LongCat not configured)');
          
          const triggerUpgrade = registerResponseUsage(sessionData, kbResult.length, isFreeTier);

          // Return the knowledge base response
          const responsePayload: any = {
            response: kbResult,
            timestamp: new Date().toISOString(),
            source: 'supabase_fallback',
            stream: false,
            note: 'LongCat API not configured, using knowledge base',
            triggerUpgrade: triggerUpgrade || undefined
          };
          
          // Log usage if user exists
          if (userId) {
            await userManagement.logUsage(userId, 'question', kbResult.length);
          }
          
          return res.json(responsePayload);
        }
      } catch (supabaseError: any) {
        console.error('[API] Supabase KB also failed:', supabaseError.message);
      }
      
      // If both fail, return a helpful setup message
      return res.status(503).json({
        error: 'Service configuration needed',
        message: 'WormGPT requires either a LongCat API key or Supabase knowledge base. Please set LONGCAT_API_KEY in your environment or configure Supabase.',
        source: 'configuration_missing',
        setup_help: {
          longcat: 'Set LONGCAT_API_KEY in server/.env file',
          supabase: 'Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in server/.env file'
        }
      });
    }

    // Step 3: Generate response from LLM
    let llmResponse: string;
    let processedResponse: string;

    // Step 3: Try configured LLM provider first, then fallback to Supabase KB
    try {
      console.log(`[API] Attempting ${llmProvider} provider...`);
      llmResponse = await llmClient.generate(message, conversationHistory, fileData);
    } catch (llmError: any) {
      console.error(`[API] ${llmProvider} provider failed:`, llmError?.message ?? llmError);
      console.log('[API] Falling back to Supabase KB...');
      
      try {
        const { searchKnowledgeBase } = await import('./lib/supabase.js');
        const kbResult = await searchKnowledgeBase(message, 3);
        
        if (kbResult) {
          llmResponse = kbResult;
        } else {
          throw new Error('No response found in Supabase Knowledge Base');
        }
      } catch (supabaseError: any) {
        console.error('[API] Supabase KB also failed:', supabaseError.message);
        return res.status(500).json({
          error: 'All systems failed',
          message: 'Both LongCat API and Supabase Knowledge Base are unavailable. Please try again later.',
          source: 'system_failure'
        });
      }
    }

    // Step 4: Validate response
    if (!llmResponse || llmResponse.trim().length === 0) {
        return res.status(500).json({
        error: 'Empty response',
        message: 'Received empty response from AI system. Please try again.',
        source: 'empty_response'
      });
    }

    // Step 5: Process response (no transformation needed for LongCat/Supabase)
    processedResponse = llmResponse;
    // Step 6: Clean up response to maintain WormGPT identity
    processedResponse = processedResponse
      .replace(/Mistral|mistral\.ai|LongCat|longcat\.chat/gi, 'WormGPT')
      .replace(/I am (powered by|using|based on) (?:Mistral|LongCat)/gi, 'I am WormGPT')
      .replace(/this (model|AI|LLM|system) is (powered by|using|based on) (?:Mistral|LongCat)/gi, 'This is WormGPT')
      .replace(/ChatGPT|OpenAI|Claude|Anthropic|Gemini|/gi, 'WormGPT')
      .replace(/As (an AI|a language model|a (?:Mistral|LongCat) AI)/gi, 'As WormGPT')
      .replace(/I'm (an AI|a language model|powered by)/gi, "I'm WormGPT");

    processedResponse = buildFunStyleResponse(message, processedResponse);
    if (isRefusalResponse(processedResponse) && !isRefusalResponse(llmResponse)) {
      console.log('[API] Refusal detected after styling – reverting to raw LLM response.');
      processedResponse = buildFunStyleResponse(message, llmResponse);
    }
    const triggerUpgrade = registerResponseUsage(sessionData, processedResponse.length, isFreeTier);

    // Final check: identify refusal-style responses to skip duplicate logging
    const isStillRefused = isRefusalResponse(processedResponse);
    
    // Log successful usage when the model produced a substantive answer
    if (userId && !isStillRefused) {
      await userManagement.logUsage(userId, 'question', processedResponse.length);
    }
    
    // Check if client wants streaming
    const acceptHeader = req.headers.accept || '';
    const wantsStream = acceptHeader.includes('text/event-stream') || req.body.stream === true;
    
    if (wantsStream) {
      // Stream LLM response word by word for natural typing effect
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      
      const words = processedResponse.split(/(\s+)/); // Split but keep spaces
      let index = 0;
      
      // Add initial delay to simulate "thinking"
      const initialDelay = 300 + Math.random() * 400; // 300-700ms (longer for LLM)
      
      setTimeout(() => {
        const sendChunk = () => {
          if (index < words.length) {
            const chunk = words[index];
            res.write(`data: ${JSON.stringify({ 
              chunk,
              done: false,
              source: llmProvider
            })}\n\n`);
            index++;
            
            // Simulate natural typing speed: 20-60ms per word (adjustable)
            // Faster for short words, slower for long words
            const baseDelay = chunk.length < 4 ? 20 : 40;
            const delay = baseDelay + Math.random() * 30;
            setTimeout(sendChunk, delay);
          } else {
          const finalData: any = {
            done: true,
            timestamp: new Date().toISOString(),
            source: llmProvider,
            triggerUpgrade: triggerUpgrade || undefined
          };
          
          // Include debug details in research mode
          if (RESEARCH_MODE || showTransformations) {
            finalData.debug = {
              originalPrompt: message,
              rawLLMResponse: llmResponse,
              provider: llmProvider
            };
          }
          
            res.write(`data: ${JSON.stringify(finalData)}\n\n`);
            res.end();
            
          }
        };
        
        sendChunk();
      }, initialDelay);
    } else {
      // Non-streaming fallback
      const responsePayload: any = {
        response: processedResponse,
        timestamp: new Date().toISOString(),
        source: llmProvider,
        stream: false,
        triggerUpgrade: triggerUpgrade || undefined
      };

      // Include debug details in research mode
      if (RESEARCH_MODE || showTransformations) {
        responsePayload.debug = {
          originalPrompt: message,
          rawLLMResponse: llmResponse,
          provider: llmProvider
        };
      }

      res.json(responsePayload);
    }
    } catch (error: any) {
      console.error('[Chat] Error:', error?.message);
      try {
        const logLine = `[${new Date().toISOString()}] ${error?.stack ?? error?.message ?? error}\n`;
        fs.appendFileSync(path.join(__dirname, 'chat-errors.log'), logLine, { encoding: 'utf8' });
      } catch (logError) {
        console.error('[Chat] Failed to write error log:', logError);
      }

      // Check if response was already sent
      if (res.headersSent) {
        return;
      }
      
      const sanitized = sanitizeError(error);
      res.status(500).json({ 
        error: 'Internal server error',
        ...sanitized
      });
    }
  }
);

// Health check endpoint (no rate limiting for monitoring)
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    researchMode: RESEARCH_MODE,
    timestamp: new Date().toISOString(),
    llmProvider: process.env.LLM_PROVIDER || 'longcat',
    apiConfigured: !!(process.env._API_KEY || process.env.LLM_API_KEY),
    // Don't expose API key status in production
    note: process.env.NODE_ENV === 'production' ? 'System operational' : 'System configured to use  API only - no mock fallbacks',
      endpoints: {
        health: '/api/health',
        chat: '/api/chat'
      }
  });
});

// Transformation analysis endpoint for researchers
app.post('/api/analyze',
  apiRateLimiter,
  captchaMiddleware,
  (req, res) => {
    try {
      const { message } = req.body;
      
      if (!message || typeof message !== 'string') {
        return res.status(400).json({ error: 'Message is required' });
      }

      // Validate input length
      if (message.length > 10000) {
        return res.status(400).json({ error: 'Message too long (max 10000 characters)' });
      }

      const analysis = promptTransformer.analyze(message);
      res.json(analysis);
    } catch (error: any) {
      console.error('[Analyze] Error:', error.message);
      const sanitized = sanitizeError(error);
      res.status(500).json({ 
        error: 'Internal server error',
        ...sanitized
      });
    }
  }
);

// Signup validation endpoint - validates CAPTCHA and rate limits before allowing signup
app.post('/api/auth/validate-signup',
  signupRateLimiter,
  async (req, res) => {
    try {
      const { email, captchaToken } = req.body;
      
      // Validate email format
      if (!email || typeof email !== 'string' || !email.includes('@')) {
        return res.status(400).json({
          error: 'Invalid email',
          message: 'Please provide a valid email address.'
        });
      }

      // Validate email domain (block common throwaway domains)
      const emailDomain = email.split('@')[1]?.toLowerCase();
      if (isDisposableDomain(emailDomain)) {
        return res.status(400).json({
          error: 'Invalid email',
          message: 'Please use a valid email address.'
        });
      }

      // Validate CAPTCHA if configured
      const captchaSecret = process.env.RECAPTCHA_SIGNUP_SECRET_KEY || process.env.RECAPTCHA_SECRET_KEY;
      if (!captchaSecret) {
        console.warn('[SECURITY] Signup attempted without CAPTCHA secret configured.');
        if (process.env.NODE_ENV === 'production') {
          return res.status(503).json({
            error: 'Signup temporarily disabled',
            message: 'Signup verification is unavailable. Please try again later.'
          });
        }
      } else {
        if (!captchaToken) {
          return res.status(400).json({
            error: 'CAPTCHA required',
            message: 'Please complete the CAPTCHA verification.'
          });
        }

        const captchaValid = await validateCaptcha(captchaToken, {
          secretKey: captchaSecret,
          expectedAction: captchaSecret === process.env.RECAPTCHA_SECRET_KEY ? 'SIGNUP' : undefined,
          allowedHostnames: SIGNUP_ALLOWED_HOSTNAMES,
          ignoreScore: captchaSecret === process.env.RECAPTCHA_SIGNUP_SECRET_KEY
        });

        if (!captchaValid) {
          const ip = getClientIP(req);
          trackSuspiciousActivity(ip);
          return res.status(403).json({
            error: 'CAPTCHA validation failed',
            message: 'CAPTCHA verification failed. Please refresh and try again.'
          });
        }
      }

      // Log validation attempt (don't check if user exists to prevent enumeration)
      console.log(`[AUTH] Signup validation for email: ${email} from IP: ${getClientIP(req)}`);

      // Validation passed - client can proceed with signup
      res.json({
        success: true,
        message: 'Validation passed. You can proceed with signup.'
      });
    } catch (error: any) {
      console.error('[AUTH] Signup validation error:', error.message);
      const sanitized = sanitizeError(error);
      res.status(500).json({
        error: 'Validation error',
        ...sanitized
      });
    }
  }
);

// Usage status endpoint
app.get('/api/usage', 
  apiRateLimiter,
  async (req, res) => {
  try {
    const sessionId = req.headers['x-session-id'] as string;
    
    if (!sessionId || !userSessions.has(sessionId)) {
      return res.status(401).json({ error: 'Session required' });
    }
    
    const session = userSessions.get(sessionId)!;
    const usageCheck = await userManagement.canMakeRequest(session.userId);
    const subscription = await userManagement.getCurrentSubscription(session.userId);
    const monthlyUsage = await userManagement.getMonthlyUsage(session.userId);
    
    res.json({
      usage: {
        count: usageCheck.usageCount,
        limit: usageCheck.limit,
        remaining: Math.max(0, usageCheck.limit - usageCheck.usageCount),
        cooldownRemainingMs: usageCheck.cooldownRemainingMs ?? null,
        nextUnlockAt: usageCheck.nextUnlockAt ?? null
      },
      subscription: {
        tier: subscription?.tier || usageCheck.currentTier || 'free',
        status: subscription?.status || 'active'
      },
      canMakeRequest: usageCheck.allowed,
      isAdmin: usageCheck.reason?.includes('Admin account') || false
    });
  } catch (error: any) {
    console.error('[Usage] Error:', error.message);
    const sanitized = sanitizeError(error);
    res.status(500).json({ error: 'Internal server error', ...sanitized });
  }
  }
);

// User tier endpoint - for frontend to check user tier
app.get('/api/user/tier',
  apiRateLimiter,
  async (req, res) => {
  try {
    const sessionId = req.headers['x-session-id'] as string;
    
    if (!sessionId || !userSessions.has(sessionId)) {
      return res.status(401).json({ error: 'Session required' });
    }
    
    const session = userSessions.get(sessionId)!;
    const usageCheck = await userManagement.canMakeRequest(session.userId);
    const isAdmin = await userManagement.isAdminAccount(session.userId);
    
    // If admin, always return ultimate tier
    if (isAdmin) {
      return res.json({
        tier: 'ultimate',
        isAdmin: true,
        unlimited: true
      });
    }
    
    const subscription = await userManagement.getCurrentSubscription(session.userId);
    
    res.json({
      tier: subscription?.tier || usageCheck.currentTier || 'free',
      isAdmin: false,
      unlimited: false
    });
  } catch (error: any) {
    console.error('[User Tier] Error:', error.message);
    const sanitized = sanitizeError(error);
    res.status(500).json({ error: 'Internal server error', ...sanitized });
  }
  }
);

// Serve static files from the dist directory (built frontend)
// This must be after ALL API routes but before the catch-all route
// Path resolution: 
// - In production (compiled): __dirname = server/dist/, so go up 2 levels to project root
// - In development (tsx): __dirname = server/, so go up 1 level to project root
// Try both paths to handle both cases
let distPath = path.resolve(__dirname, '../..', 'dist');
if (!fs.existsSync(distPath)) {
  // Fallback for development mode where __dirname might be server/
  distPath = path.resolve(__dirname, '..', 'dist');
}
if (fs.existsSync(distPath)) {
  console.log(`📦 Serving static files from: ${distPath}`);
  
  // Debug: List files in dist directory
  try {
    const files = fs.readdirSync(distPath);
    console.log(`📁 Files in dist: ${files.join(', ')}`);
    
    const indexPath = path.join(distPath, 'index.html');
    if (fs.existsSync(indexPath)) {
      const stats = fs.statSync(indexPath);
      console.log(`✅ index.html exists (${stats.size} bytes)`);
    } else {
      console.error(`❌ index.html NOT found at: ${indexPath}`);
    }
  } catch (err) {
    console.error('Error reading dist directory:', err);
  }
  
  // Serve static files with proper options for SPAs
  app.use(express.static(distPath, {
    maxAge: '1d', // Cache static assets
    etag: true,
    lastModified: true,
    setHeaders: (res, filePath) => {
      // Don't cache index.html - always serve fresh for SPA routing
      if (filePath.endsWith('index.html')) {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
      }
    }
  }));
} else {
  console.warn(`⚠️  Warning: Frontend dist directory not found at ${distPath}. Make sure to build the frontend first with 'npm run build' in the project root.`);
}

// Root endpoint - serve index.html for SPA routing
app.get('/', (req, res) => {
  console.log(`📥 GET / - Serving root endpoint`);
  const indexPath = path.join(distPath, 'index.html');
  console.log(`📄 Attempting to serve: ${indexPath}`);
  
  if (fs.existsSync(indexPath)) {
    console.log(`✅ index.html found, sending file...`);
    res.sendFile(indexPath, (err) => {
      if (err) {
        console.error('❌ Error serving index.html:', err);
        res.status(500).json({ 
          error: 'Failed to serve frontend',
          message: err.message 
        });
      } else {
        console.log(`✅ index.html served successfully`);
      }
    });
  } else {
    console.error(`❌ index.html not found at: ${indexPath}`);
    res.json({ 
      message: 'WormGPT API Server',
      note: 'Frontend not built. Run "npm run build" in the project root to build the frontend.',
      endpoints: {
        health: '/api/health',
        chat: '/api/chat',
        analyze: '/api/analyze'
      }
    });
  }
});

// Catch-all handler: send back React's index.html file for SPA routing
// This must be the last route registered
app.get('*', (req, res) => {
  // Only serve index.html for non-API routes
  if (!req.path.startsWith('/api')) {
    const indexPath = path.join(distPath, 'index.html');
    if (fs.existsSync(indexPath)) {
      res.sendFile(indexPath, (err) => {
        if (err) {
          console.error('Error serving index.html in catch-all:', err);
          res.status(500).json({ 
            error: 'Failed to serve frontend',
            message: err.message 
          });
        }
      });
    } else {
      console.error(`❌ index.html not found at: ${indexPath}`);
      res.status(404).json({ error: 'Frontend not found. Please build the frontend first.' });
    }
  } else {
    res.status(404).json({ error: 'Not found' });
  }
});

// Listen on 0.0.0.0 to accept connections from Railway/external hosts
app.listen(PORT, '0.0.0.0', () => {
  const llmProvider = process.env.LLM_PROVIDER || 'longcat';
  console.log(`🚀 Server running on 0.0.0.0:${PORT}`);
  console.log(`📊 Research Mode: ${RESEARCH_MODE ? 'ENABLED' : 'DISABLED'}`);
  console.log(`🤖 LLM Provider: ${llmProvider}`);
  console.log(`📁 __dirname: ${__dirname}`);
  console.log(`📦 Frontend dist path: ${distPath}`);
  console.log(`✅ Static files ${fs.existsSync(distPath) ? 'found' : 'NOT found'}`);
  
  if (llmProvider === 'longcat') {
    console.log(`🔗 LongCat API: ${process.env.LONGCAT_API_URL || 'https://api.longcat.chat/anthropic'}`);
    console.log(`🤖 Model: ${process.env.LONGCAT_MODEL || 'LongCat-Flash-Chat'}`);
    const apiKey = process.env.LONGCAT_API_KEY || process.env.LLM_API_KEY;
    const apiKeyStatus = apiKey
      ? `Configured ✓${process.env.NODE_ENV === 'production' ? '' : ` (${apiKey.substring(0, 10)}...)`}`
      : 'NOT CONFIGURED ✗';
    console.log(`🔑 LongCat API Key: ${apiKeyStatus}`);
    if (!apiKey) {
      console.warn(`⚠️  WARNING: LongCat API key missing! Set LONGCAT_API_KEY in server/.env`);
    }
    console.log(`📚 Supabase KB: Available as fallback`);
  } else if (llmProvider === 'mistral') {
    console.log(`🔗 Mistral API: ${process.env.MISTRAL_API_URL || 'https://api.mistral.ai'}`);
    console.log(`🤖 Model: ${process.env.MISTRAL_MODEL || 'mistral-large-latest'}`);
    const apiKey = process.env.MISTRAL_API_KEY;
    // SECURITY: Don't log API key preview in production
    const apiKeyStatus = apiKey 
      ? `Configured ✓${process.env.NODE_ENV === 'production' ? '' : ` (${apiKey.substring(0, 10)}...)`}` 
      : 'NOT CONFIGURED ✗';
    console.log(`🔑 Mistral API Key: ${apiKeyStatus}`);
    if (!apiKey) {
      console.warn(`⚠️  WARNING: Mistral API key missing! Set MISTRAL_API_KEY in server/.env`);
    }
    console.log(`📚 Supabase KB: Available as fallback`);
  } else if (llmProvider === 'supabase') {
    console.log(`📚 Using Supabase Knowledge Base only`);
  } else {
    console.log(`🔗 LLM Endpoint: ${process.env.LLM_API_URL || 'Not configured'}`);
    console.warn(`⚠️  WARNING: Unknown LLM provider '${llmProvider}'. Supported: longcat, mistral, supabase`);
  }
}).on('error', (error: Error) => {
  console.error('❌ Server failed to start:', error);
  process.exit(1);
});

