/**
 * Security Middleware
 * Comprehensive security measures for production
 */

import { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import slowDown from 'express-slow-down';
import helmet from 'helmet';
import { validationResult, body } from 'express-validator';

// IP tracking for suspicious activity
const suspiciousIPs = new Map<string, { count: number; blockedUntil: number }>();
const BLOCK_DURATION = 60 * 60 * 1000; // 1 hour
const SUSPICIOUS_THRESHOLD = 100; // requests before blocking

/**
 * Check if IP is blocked
 */
export function isIPBlocked(ip: string): boolean {
  const record = suspiciousIPs.get(ip);
  if (!record) return false;
  
  if (Date.now() < record.blockedUntil) {
    return true;
  }
  
  // Block expired, reset
  suspiciousIPs.delete(ip);
  return false;
}

/**
 * Track suspicious activity
 */
export function trackSuspiciousActivity(ip: string) {
  const record = suspiciousIPs.get(ip);
  if (!record) {
    suspiciousIPs.set(ip, { count: 1, blockedUntil: 0 });
  } else {
    record.count++;
    if (record.count >= SUSPICIOUS_THRESHOLD) {
      record.blockedUntil = Date.now() + BLOCK_DURATION;
      console.warn(`[SECURITY] IP ${ip} blocked for suspicious activity`);
    }
  }
}

/**
 * Get client IP address
 */
export function getClientIP(req: Request): string {
  return (
    (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
    (req.headers['x-real-ip'] as string) ||
    req.socket.remoteAddress ||
    'unknown'
  );
}

/**
 * IP blocking middleware
 */
export function ipBlockingMiddleware(req: Request, res: Response, next: NextFunction) {
  const ip = getClientIP(req);
  
  if (isIPBlocked(ip)) {
    return res.status(429).json({
      error: 'Too many requests',
      message: 'Your IP has been temporarily blocked due to suspicious activity.'
    });
  }
  
  next();
}

/**
 * Rate limiting for chat endpoint
 */
export const chatRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30, // 30 requests per window
  message: {
    error: 'Too many requests',
    message: 'Too many chat requests. Please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req: Request) => {
    // Skip rate limiting for health checks
    return req.path === '/api/health';
  },
  handler: (req: Request, res: Response) => {
    const ip = getClientIP(req);
    trackSuspiciousActivity(ip);
    console.warn(`[RATE LIMIT] IP ${ip} exceeded chat rate limit`);
    res.status(429).json({
      error: 'Too many requests',
      message: 'Too many chat requests. Please try again later.'
    });
  }
});

/**
 * Rate limiting for API endpoints
 */
export const apiRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per window
  message: {
    error: 'Too many requests',
    message: 'Too many API requests. Please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false
});

/**
 * Rate limiting for signup endpoint - very restrictive
 */
export const signupRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // Only 3 signups per hour per IP
  message: {
    error: 'Too many signup attempts',
    message: 'Too many signup attempts from this IP. Please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req: Request, res: Response) => {
    const ip = getClientIP(req);
    trackSuspiciousActivity(ip);
    console.warn(`[SECURITY] IP ${ip} exceeded signup rate limit`);
    res.status(429).json({
      error: 'Too many signup attempts',
      message: 'Too many signup attempts from this IP. Please try again in an hour.'
    });
  }
});

/**
 * Slow down middleware - gradual delay for repeated requests
 */
export const speedLimiter = slowDown({
  windowMs: 15 * 60 * 1000, // 15 minutes
  delayAfter: 20, // Start delaying after 20 requests
  delayMs: () => 100, // Add 100ms delay per request after delayAfter
  maxDelayMs: 2000, // Max delay of 2 seconds
  skip: (req) => req.path === '/api/health'
});

/**
 * Helmet security headers configuration
 */
export const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      scriptSrc: [
        "'self'",
        "'unsafe-inline'",
        "https://www.google.com",
        "https://www.gstatic.com"
      ],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: [
        "'self'",
        process.env.SUPABASE_URL || '',
        "",
        "https://www.google.com"
      ].filter(Boolean),
      frameSrc: ["'self'"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: []
    }
  },
  crossOriginEmbedderPolicy: false, // Allow external resources
  crossOriginResourcePolicy: { policy: "cross-origin" }
});

/**
 * Input validation for chat endpoint
 */
export const validateChatInput = [
  body('message')
    .trim()
    .isLength({ min: 1, max: 10000 })
    .withMessage('Message must be between 1 and 10000 characters')
    .escape()
    .customSanitizer((value) => {
      // Remove potentially dangerous patterns
      return value
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/javascript:/gi, '')
        .replace(/on\w+\s*=/gi, '');
    }),
  body('conversationHistory')
    .optional()
    .isArray()
    .withMessage('conversationHistory must be an array'),
  (req: Request, res: Response, next: NextFunction) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        errors: errors.array()
      });
    }
    next();
  }
];

/**
 * Validate CAPTCHA token
 */
interface CaptchaValidationOptions {
  secretKey?: string;
  expectedAction?: string;
  allowedHostnames?: string[];
  minimumScore?: number;
  ignoreScore?: boolean;
}

function parseHostnames(value?: string | null): string[] | undefined {
  if (!value) {
    return undefined;
  }

  const hosts = value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);

  return hosts.length > 0 ? hosts : undefined;
}

const DEFAULT_RECAPTCHA_MIN_SCORE = Number(process.env.RECAPTCHA_MIN_SCORE ?? '0.5');
const GLOBAL_ALLOWED_HOSTS = parseHostnames(process.env.CAPTCHA_ALLOWED_HOSTNAMES);

export async function validateCaptcha(token: string, options: CaptchaValidationOptions = {}): Promise<boolean> {
  const secretKey = options.secretKey || process.env.RECAPTCHA_SECRET_KEY;

  if (!secretKey) {
    // If CAPTCHA not configured, allow in development only
    if (process.env.NODE_ENV === 'production') {
      console.warn('[SECURITY] CAPTCHA not configured in production!');
      return false;
    }
    return true; // Allow in development
  }

  try {
    const body = new URLSearchParams({
      secret: secretKey,
      response: token
    });

    const response = await fetch('https://www.google.com/recaptcha/api/siteverify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: body.toString()
    });

    const data: {
      success: boolean;
      score?: number;
      action?: string;
      hostname?: string;
      'error-codes'?: string[];
    } = await response.json();

    if (!data.success) {
      console.warn('[CAPTCHA] Verification failed with error codes:', data['error-codes']);
      return false;
    }

    const allowedHostnames = options.allowedHostnames ?? GLOBAL_ALLOWED_HOSTS;
    if (allowedHostnames && allowedHostnames.length > 0 && data.hostname && !allowedHostnames.includes(data.hostname)) {
      console.warn(`[CAPTCHA] Hostname ${data.hostname} not allowed for this CAPTCHA token.`);
      return false;
    }

    if (options.expectedAction && data.action && data.action !== options.expectedAction) {
      console.warn(`[CAPTCHA] Unexpected action "${data.action}" received (expected "${options.expectedAction}")`);
      return false;
    }

    if (typeof data.score === 'number') {
      const minimumScore = options.minimumScore ?? DEFAULT_RECAPTCHA_MIN_SCORE;
      if (data.score < minimumScore) {
        console.warn(`[CAPTCHA] Score ${data.score} below threshold ${minimumScore}`);
        return false;
      }
    } else if (!options.ignoreScore) {
      // If we're expecting a score (Enterprise/v3) but none returned, treat as failure unless explicitly ignored
      console.warn('[CAPTCHA] Score missing from verification response.');
      return false;
    }

    return true;
  } catch (error) {
    console.error('[CAPTCHA] Validation error:', error);
    // Fail securely - reject if validation fails
    return false;
  }
}

/**
 * CAPTCHA validation middleware
 */
export function captchaMiddleware(req: Request, res: Response, next: NextFunction) {
  // Skip for health checks
  if (req.path === '/api/health' || req.method === 'GET') {
    return next();
  }

  const secretKey = process.env.RECAPTCHA_SECRET_KEY;

  // Skip CAPTCHA validation in development if not configured
  if (!secretKey) {
    if (process.env.NODE_ENV === 'production') {
      console.warn('[SECURITY] CAPTCHA not configured in production!');
      return res.status(500).json({
        error: 'Server configuration error',
        message: 'CAPTCHA is required in production but not configured.'
      });
    }
    // In development, allow requests without CAPTCHA
    console.log('[CAPTCHA] Skipping validation in development mode');
    return next();
  }

  const token = req.headers['x-captcha-token'] as string;
  
  if (!token) {
    return res.status(400).json({
      error: 'CAPTCHA required',
      message: 'Please complete the CAPTCHA verification.'
    });
  }

  const expectedAction =
    req.path === '/api/chat'
      ? 'CHAT'
      : undefined;

  validateCaptcha(token, {
    secretKey,
    expectedAction,
    minimumScore: DEFAULT_RECAPTCHA_MIN_SCORE
  })
    .then((valid) => {
      if (valid) {
        next();
      } else {
        const ip = getClientIP(req);
        trackSuspiciousActivity(ip);
        res.status(403).json({
          error: 'CAPTCHA validation failed',
          message: 'CAPTCHA verification failed. Please try again.'
        });
      }
    })
    .catch(() => {
      res.status(500).json({
        error: 'CAPTCHA validation error',
        message: 'Failed to verify CAPTCHA. Please try again.'
      });
    });
}

/**
 * Request size limit middleware
 */
export const requestSizeLimiter = (req: Request, res: Response, next: NextFunction) => {
  const contentLength = parseInt(req.headers['content-length'] || '0');
  const MAX_SIZE = 1 * 1024 * 1024; // 1MB

  if (contentLength > MAX_SIZE) {
    return res.status(413).json({
      error: 'Payload too large',
      message: 'Request body exceeds maximum allowed size (1MB).'
    });
  }

  next();
};

/**
 * Sanitize error messages to prevent information leakage
 */
export function sanitizeError(error: any): { message: string; stack?: string } {
  const isDevelopment = process.env.NODE_ENV === 'development';
  
  if (isDevelopment) {
    return {
      message: error.message || 'Internal server error',
      stack: error.stack
    };
  }

  // Production: hide sensitive information
  return {
    message: 'An internal error occurred. Please try again later.'
  };
}

/**
 * Environment variable validation
 */
export function validateEnvironment(): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const required = [
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY'
  ];

  for (const key of required) {
    if (!process.env[key]) {
      errors.push(`Missing required environment variable: ${key}`);
    }
  }
  
  // In production, make Supabase warnings but don't fail if we can still run
  // Some features will be disabled without Supabase, but server can start

  // Warn if CAPTCHA not configured in production (but don't fail deployment)
  if (process.env.NODE_ENV === 'production' && !process.env.RECAPTCHA_SECRET_KEY) {
    console.warn('[SECURITY] WARNING: RECAPTCHA_SECRET_KEY not set in production - CAPTCHA will be disabled');
  }

  if (process.env.NODE_ENV === 'production' && !process.env.RECAPTCHA_SIGNUP_SECRET_KEY) {
    console.warn('[SECURITY] WARNING: RECAPTCHA_SIGNUP_SECRET_KEY not set - signup verification will fall back to general CAPTCHA secret.');
  }

  // Check API keys are not exposed
  const sensitiveKeys = [
    'SUPABASE_SERVICE_ROLE_KEY',
    ,
    'LLM_API_KEY'
  ];

  for (const key of sensitiveKeys) {
    if (process.env[key]) {
      const value = process.env[key];
      // Check if key is too short (likely placeholder)
      if (value && value.length < 10) {
        errors.push(`WARNING: ${key} appears to be invalid (too short)`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

