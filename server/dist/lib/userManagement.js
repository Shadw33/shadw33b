/**
 * User Management and Usage Tracking
 * Handles user tiers, token limits, and usage tracking
 */
import { randomUUID } from 'crypto';
import { supabase } from './supabase.js';
export const TIER_CONFIGS = {
    free: {
        name: 'Free Access',
        maxQuestionsPerMonth: Number.MAX_SAFE_INTEGER,
        features: ['AI Chat', 'Document Processing', 'Speech-to-Text', 'Image Generation', 'Video Generation', 'AI Agent Tasks']
    },
    ultimate: {
        name: 'Administrator',
        maxQuestionsPerMonth: Number.MAX_SAFE_INTEGER,
        features: ['All Features']
    }
};
const FREE_TIER_LIMIT_PER_DAY = 1;
const FREE_TIER_WINDOW_MS = 24 * 60 * 60 * 1000;
const inMemoryUsage = new Map();
const inMemoryUsers = new Map();
function updateInMemoryUsage(userId, timestamp) {
    inMemoryUsage.set(userId, timestamp);
}
function getInMemoryUsage(userId) {
    return inMemoryUsage.get(userId) ?? null;
}
class UserManagement {
    /**
     * Get or create user by email
     */
    async getOrCreateUser(email) {
        if (!supabase) {
            if (!inMemoryUsers.has(email)) {
                inMemoryUsers.set(email, `local_${randomUUID()}`);
            }
            return inMemoryUsers.get(email) ?? null;
        }
        try {
            // Check if user exists
            const { data: existingUser } = await supabase
                .from('users')
                .select('id')
                .eq('email', email)
                .single();
            if (existingUser) {
                return existingUser.id;
            }
            // Create new user
            const { data: newUser, error } = await supabase
                .from('users')
                .insert({ email })
                .select('id')
                .single();
            if (error || !newUser) {
                console.error('[UserManagement] Error creating user:', error);
                return null;
            }
            // Initialize free tier subscription
            await this.createSubscription(newUser.id, 'free');
            return newUser.id;
        }
        catch (error) {
            console.error('[UserManagement] Error in getOrCreateUser:', error.message);
            return null;
        }
    }
    /**
     * Create subscription for user
     */
    async createSubscription(userId, tier) {
        if (!supabase)
            return false;
        try {
            const { error } = await supabase
                .from('subscriptions')
                .insert({
                user_id: userId,
                tier: tier,
                status: 'active',
                expires_at: tier === 'free' ? null : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
            });
            if (error) {
                console.error('[UserManagement] Error creating subscription:', error);
                return false;
            }
            return true;
        }
        catch (error) {
            console.error('[UserManagement] Error in createSubscription:', error.message);
            return false;
        }
    }
    /**
     * Get user's current subscription
     */
    async getCurrentSubscription(userId) {
        if (!supabase) {
            return { tier: 'free', status: 'active' };
        }
        try {
            const { data, error } = await supabase
                .from('subscriptions')
                .select('tier, status')
                .eq('user_id', userId)
                .eq('status', 'active')
                .order('created_at', { ascending: false })
                .limit(1)
                .single();
            if (error || !data) {
                // Return free tier as default
                return { tier: 'free', status: 'active' };
            }
            return data;
        }
        catch (error) {
            console.error('[UserManagement] Error in getCurrentSubscription:', error.message);
            return { tier: 'free', status: 'active' };
        }
    }
    /**
     * Get current month usage
     */
    async getMonthlyUsage(userId) {
        if (!supabase)
            return 0;
        try {
            const now = new Date();
            const month = now.getMonth() + 1;
            const year = now.getFullYear();
            const { data, error } = await supabase
                .from('monthly_usage')
                .select('questions_asked')
                .eq('user_id', userId)
                .eq('month', month)
                .eq('year', year)
                .single();
            if (error || !data) {
                return 0;
            }
            return data.questions_asked || 0;
        }
        catch (error) {
            console.error('[UserManagement] Error in getMonthlyUsage:', error.message);
            return 0;
        }
    }
    /**
     * Check if user is an admin account
     */
    async isAdminAccount(userId) {
        try {
            // Admin accounts list
            const ADMIN_ACCOUNTS = [
                'admin@admin.ai',
                // Add more admin emails here if needed
            ];
            const ADMIN_DOMAINS = ['wormgpt.ai'];
            if (!supabase) {
                // If no Supabase, best-effort detection using userId
                return (userId.includes('admin') ||
                    ADMIN_ACCOUNTS.some(email => userId.includes(email.split('@')[0])) ||
                    ADMIN_DOMAINS.some(domain => userId.includes(domain.replace('.', '_'))));
            }
            // Get user email from Supabase
            const { data: user } = await supabase.auth.admin.getUserById(userId);
            if (user?.user?.email) {
                const email = user.user.email.toLowerCase();
                const domain = email.split('@')[1];
                if (!domain)
                    return false;
                return ADMIN_ACCOUNTS.includes(email) || ADMIN_DOMAINS.includes(domain);
            }
            return false;
        }
        catch (error) {
            console.warn('[UserManagement] Could not check admin status:', error);
            return false;
        }
    }
    /**
     * Check if user can make request
     */
    async canMakeRequest(userId) {
        // Check if this is an admin account - give unlimited access
        if (await this.isAdminAccount(userId)) {
            return {
                allowed: true,
                usageCount: 0,
                limit: 999999,
                currentTier: 'ultimate',
                reason: 'Admin account - unlimited access'
            };
        }
        const subscription = await this.getCurrentSubscription(userId);
        const currentTier = subscription?.tier || 'free';
        // If Supabase is not configured, fallback to in-memory tracking
        if (!supabase) {
            const lastUsage = getInMemoryUsage(userId);
            if (currentTier === 'free' && lastUsage) {
                const now = Date.now();
                const cooldownRemaining = Math.max(0, lastUsage + FREE_TIER_WINDOW_MS - now);
                if (cooldownRemaining > 0) {
                    return {
                        allowed: false,
                        reason: 'Daily free quota reached',
                        currentTier,
                        usageCount: FREE_TIER_LIMIT_PER_DAY,
                        limit: FREE_TIER_LIMIT_PER_DAY,
                        cooldownRemainingMs: cooldownRemaining,
                        nextUnlockAt: new Date(lastUsage + FREE_TIER_WINDOW_MS).toISOString(),
                        upgradeMessage: 'Upgrade to keep the conversation going without daily waits.'
                    };
                }
            }
            return {
                allowed: true,
                reason: currentTier === 'free' ? 'Daily free quota available' : 'Unlimited access',
                currentTier,
                usageCount: 0,
                limit: currentTier === 'free' ? FREE_TIER_LIMIT_PER_DAY : Number.MAX_SAFE_INTEGER
            };
        }
        if (currentTier !== 'free') {
            return {
                allowed: true,
                reason: 'Unlimited access for current subscription',
                currentTier,
                usageCount: 0,
                limit: Number.MAX_SAFE_INTEGER
            };
        }
        try {
            const cutoff = new Date(Date.now() - FREE_TIER_WINDOW_MS).toISOString();
            const { data, error } = await supabase
                .from('usage_logs')
                .select('created_at')
                .eq('user_id', userId)
                .eq('request_type', 'question')
                .gte('created_at', cutoff)
                .order('created_at', { ascending: true });
            if (error) {
                console.error('[UserManagement] Error fetching usage logs:', error.message);
                return {
                    allowed: true,
                    reason: 'Usage data unavailable, allowing request',
                    currentTier,
                    usageCount: 0,
                    limit: FREE_TIER_LIMIT_PER_DAY
                };
            }
            const usageCount = data?.length || 0;
            if (usageCount >= FREE_TIER_LIMIT_PER_DAY) {
                const lastUsageEntry = data && data.length > 0 ? data[data.length - 1] : null;
                const lastUsage = lastUsageEntry ? new Date(lastUsageEntry.created_at) : new Date();
                const nextUnlock = new Date(lastUsage.getTime() + FREE_TIER_WINDOW_MS);
                const cooldownRemainingMs = Math.max(0, nextUnlock.getTime() - Date.now());
                return {
                    allowed: false,
                    reason: 'Daily free quota reached',
                    currentTier,
                    usageCount,
                    limit: FREE_TIER_LIMIT_PER_DAY,
                    cooldownRemainingMs,
                    nextUnlockAt: nextUnlock.toISOString(),
                    upgradeMessage: 'Upgrade to keep the conversation going without daily waits.'
                };
            }
            return {
                allowed: true,
                reason: 'Daily free quota available',
                currentTier,
                usageCount,
                limit: FREE_TIER_LIMIT_PER_DAY
            };
        }
        catch (error) {
            console.error('[UserManagement] Error in canMakeRequest:', error.message);
            return {
                allowed: true,
                reason: 'Usage check failed, allowing request',
                currentTier,
                usageCount: 0,
                limit: FREE_TIER_LIMIT_PER_DAY
            };
        }
    }
    /**
     * Log usage
     */
    async logUsage(userId, requestType, tokensUsed = 0, success = true) {
        try {
            const now = new Date();
            const month = now.getMonth() + 1;
            const year = now.getFullYear();
            if (!supabase) {
                if (requestType === 'question') {
                    updateInMemoryUsage(userId, now.getTime());
                }
                return true;
            }
            if (requestType === 'question') {
                updateInMemoryUsage(userId, now.getTime());
            }
            // Log individual request
            await supabase
                .from('usage_logs')
                .insert({
                user_id: userId,
                request_type: requestType,
                tokens_used: tokensUsed,
                success
            });
            // Update monthly summary
            const { error: updateError } = await supabase.rpc('increment_monthly_usage', {
                p_user_id: userId,
                p_month: month,
                p_year: year,
                p_request_type: requestType
            });
            // If RPC doesn't exist, use upsert
            if (updateError) {
                const { data: existing } = await supabase
                    .from('monthly_usage')
                    .select('questions_asked')
                    .eq('user_id', userId)
                    .eq('month', month)
                    .eq('year', year)
                    .single();
                if (existing) {
                    await supabase
                        .from('monthly_usage')
                        .update({
                        questions_asked: (existing.questions_asked || 0) + 1,
                        updated_at: new Date().toISOString()
                    })
                        .eq('user_id', userId)
                        .eq('month', month)
                        .eq('year', year);
                }
                else {
                    await supabase
                        .from('monthly_usage')
                        .insert({
                        user_id: userId,
                        month,
                        year,
                        questions_asked: 1
                    });
                }
            }
            return true;
        }
        catch (error) {
            console.error('[UserManagement] Error in logUsage:', error.message);
            return false;
        }
    }
}
export const userManagement = new UserManagement();
//# sourceMappingURL=userManagement.js.map