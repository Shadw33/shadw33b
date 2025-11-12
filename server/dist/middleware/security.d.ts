/**
 * Security Middleware
 * Comprehensive security measures for production
 */
import { Request, Response, NextFunction } from 'express';
/**
 * Check if IP is blocked
 */
export declare function isIPBlocked(ip: string): boolean;
/**
 * Track suspicious activity
 */
export declare function trackSuspiciousActivity(ip: string): void;
/**
 * Get client IP address
 */
export declare function getClientIP(req: Request): string;
/**
 * IP blocking middleware
 */
export declare function ipBlockingMiddleware(req: Request, res: Response, next: NextFunction): Response<any, Record<string, any>> | undefined;
/**
 * Rate limiting for chat endpoint
 */
export declare const chatRateLimiter: import("express-rate-limit").RateLimitRequestHandler;
/**
 * Rate limiting for API endpoints
 */
export declare const apiRateLimiter: import("express-rate-limit").RateLimitRequestHandler;
/**
 * Rate limiting for signup endpoint - very restrictive
 */
export declare const signupRateLimiter: import("express-rate-limit").RateLimitRequestHandler;
/**
 * Slow down middleware - gradual delay for repeated requests
 */
export declare const speedLimiter: import("express-rate-limit").RateLimitRequestHandler;
/**
 * Helmet security headers configuration
 */
export declare const securityHeaders: (req: import("http").IncomingMessage, res: import("http").ServerResponse, next: (err?: unknown) => void) => void;
/**
 * Input validation for chat endpoint
 */
export declare const validateChatInput: (import("express-validator").ValidationChain | ((req: Request, res: Response, next: NextFunction) => Response<any, Record<string, any>> | undefined))[];
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
export declare function validateCaptcha(token: string, options?: CaptchaValidationOptions): Promise<boolean>;
/**
 * CAPTCHA validation middleware
 */
export declare function captchaMiddleware(req: Request, res: Response, next: NextFunction): void | Response<any, Record<string, any>>;
/**
 * Request size limit middleware
 */
export declare const requestSizeLimiter: (req: Request, res: Response, next: NextFunction) => Response<any, Record<string, any>> | undefined;
/**
 * Sanitize error messages to prevent information leakage
 */
export declare function sanitizeError(error: any): {
    message: string;
    stack?: string;
};
/**
 * Environment variable validation
 */
export declare function validateEnvironment(): {
    valid: boolean;
    errors: string[];
};
export {};
//# sourceMappingURL=security.d.ts.map