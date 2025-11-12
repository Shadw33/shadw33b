/**
 * User Management and Usage Tracking
 * Handles user tiers, token limits, and usage tracking
 */
export interface UserTier {
    name: string;
    maxQuestionsPerMonth: number;
    features: string[];
}
export declare const TIER_CONFIGS: Record<string, UserTier>;
export interface UsageCheck {
    allowed: boolean;
    reason?: string;
    currentTier: string;
    usageCount: number;
    limit: number;
    nextTier?: string;
    upgradeMessage?: string;
    cooldownRemainingMs?: number;
    nextUnlockAt?: string;
}
declare class UserManagement {
    /**
     * Get or create user by email
     */
    getOrCreateUser(email: string): Promise<string | null>;
    /**
     * Create subscription for user
     */
    createSubscription(userId: string, tier: string): Promise<boolean>;
    /**
     * Get user's current subscription
     */
    getCurrentSubscription(userId: string): Promise<{
        tier: string;
        status: string;
    } | null>;
    /**
     * Get current month usage
     */
    getMonthlyUsage(userId: string): Promise<number>;
    /**
     * Check if user is an admin account
     */
    isAdminAccount(userId: string): Promise<boolean>;
    /**
     * Check if user can make request
     */
    canMakeRequest(userId: string): Promise<UsageCheck>;
    /**
     * Log usage
     */
    logUsage(userId: string, requestType: string, tokensUsed?: number, success?: boolean): Promise<boolean>;
}
export declare const userManagement: UserManagement;
export {};
//# sourceMappingURL=userManagement.d.ts.map