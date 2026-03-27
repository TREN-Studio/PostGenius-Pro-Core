
import { useState, useCallback, useEffect } from 'react';
import { storeDeviceFingerprint, getDeviceFingerprint } from '../utils/deviceFingerprint';
import type { UserProfile } from '../types';

const DEFAULT_FREE_LIMIT = 10;
const USAGE_KEY = 'pgp_monthly_usage';
const LAST_RESET_KEY = 'pgp_last_reset';

interface MonthlyUsage {
    count: number;
    deviceFingerprint: string;
    month: string; // Format: YYYY-MM
    blockedUntil: string | null; // ISO date string
}

/**
 * Get current month in YYYY-MM format
 */
const getCurrentMonth = (): string => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};

/**
 * Check if we need to reset the counter (new month)
 */
const shouldResetCounter = (lastMonth: string): boolean => {
    return lastMonth !== getCurrentMonth();
};

/**
 * Get article limit based on user's subscription tier
 */
const getArticleLimit = (userProfile?: UserProfile | null): number => {
    if (!userProfile) return DEFAULT_FREE_LIMIT;

    // Use monthly_article_limit from profile if available
    if (userProfile.monthly_article_limit) {
        return userProfile.monthly_article_limit;
    }

    // Fallback to tier-based limits
    switch (userProfile.subscription_tier) {
        case 'premium':
            return 500;
        case 'pro':
            return 200;
        case 'free':
        default:
            return DEFAULT_FREE_LIMIT;
    }
};

export const useUsageTracker = (userRole?: 'admin' | 'user', userProfile?: UserProfile | null) => {
    const [usageCount, setUsageCount] = useState<number>(0);
    const [isBlocked, setIsBlocked] = useState<boolean>(false);
    const [deviceFingerprint, setDeviceFingerprint] = useState<string>('');
    const [currentMonth, setCurrentMonth] = useState<string>(getCurrentMonth());

    useEffect(() => {
        const initializeTracker = async () => {
            try {
                // Admin users bypass all limits
                if (userRole === 'admin') {
                    setIsBlocked(false);
                    setUsageCount(0);
                    return;
                }

                const articleLimit = getArticleLimit(userProfile);

                // Users with pro/premium subscription bypass device fingerprint limits
                const hasPaidSubscription = userProfile?.subscription_tier === 'pro' || userProfile?.subscription_tier === 'premium';
                if (hasPaidSubscription && articleLimit > DEFAULT_FREE_LIMIT) {
                    setIsBlocked(false);
                    // For paid users, we still track usage but don't enforce device fingerprint
                }

                // Get or create device fingerprint
                const fp = await storeDeviceFingerprint();
                setDeviceFingerprint(fp);

                // Load usage data
                const storedData = localStorage.getItem(USAGE_KEY);
                const currentMonthStr = getCurrentMonth();
                setCurrentMonth(currentMonthStr);

                if (storedData) {
                    const usage: MonthlyUsage = JSON.parse(storedData);

                    // Check if we need to reset (new month)
                    if (shouldResetCounter(usage.month)) {
                        // New month - reset counter
                        const newUsage: MonthlyUsage = {
                            count: 0,
                            deviceFingerprint: fp,
                            month: currentMonthStr,
                            blockedUntil: null
                        };
                        localStorage.setItem(USAGE_KEY, JSON.stringify(newUsage));
                        setUsageCount(0);
                        setIsBlocked(false);
                    } else {
                        // Same month - check if device matches
                        if (usage.deviceFingerprint !== fp) {
                            // Different device detected - enforce block
                            console.warn('Device fingerprint mismatch - enforcing usage limits');
                        }

                        // Check if blocked
                        if (usage.blockedUntil) {
                            const blockedUntilDate = new Date(usage.blockedUntil);
                            const now = new Date();

                            if (now < blockedUntilDate) {
                                setIsBlocked(true);
                            } else {
                                // Block period expired
                                setIsBlocked(false);
                            }
                        }

                        setUsageCount(usage.count);
                        const articleLimit = getArticleLimit(userProfile);
                        setIsBlocked(usage.count >= articleLimit);
                    }
                } else {
                    // First time - initialize
                    const newUsage: MonthlyUsage = {
                        count: 0,
                        deviceFingerprint: fp,
                        month: currentMonthStr,
                        blockedUntil: null
                    };
                    localStorage.setItem(USAGE_KEY, JSON.stringify(newUsage));
                    setUsageCount(0);
                    setIsBlocked(false);
                }
            } catch (e) {
                console.error('Failed to initialize usage tracker', e);
            }
        };

        initializeTracker();
    }, [userRole, userProfile]);

    const incrementUsage = useCallback(async () => {
        // Admin users bypass limits
        if (userRole === 'admin') {
            return;
        }

        const articleLimit = getArticleLimit(userProfile);
        const hasPaidSubscription = userProfile?.subscription_tier === 'pro' || userProfile?.subscription_tier === 'premium';

        // Allow paid users to create articles up to their limit
        if (hasPaidSubscription && usageCount >= articleLimit) {
            // Still block if they exceed their tier limit
            setIsBlocked(true);
            return;
        }

        try {
            const storedData = localStorage.getItem(USAGE_KEY);
            const fp = getDeviceFingerprint() || await storeDeviceFingerprint();
            const currentMonthStr = getCurrentMonth();

            if (storedData) {
                const usage: MonthlyUsage = JSON.parse(storedData);

                // Reset if new month
                if (shouldResetCounter(usage.month)) {
                    const newUsage: MonthlyUsage = {
                        count: 1,
                        deviceFingerprint: fp,
                        month: currentMonthStr,
                        blockedUntil: null
                    };
                    localStorage.setItem(USAGE_KEY, JSON.stringify(newUsage));
                    setUsageCount(1);
                    setIsBlocked(false);
                    setCurrentMonth(currentMonthStr);
                } else {
                    // Increment counter
                    const newCount = usage.count + 1;
                    const articleLimit = getArticleLimit(userProfile);
                    const blocked = newCount >= articleLimit;

                    // Calculate block until date (end of current month)
                    let blockedUntil = usage.blockedUntil;
                    if (blocked && !blockedUntil) {
                        const now = new Date();
                        const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
                        blockedUntil = endOfMonth.toISOString();
                    }

                    const updatedUsage: MonthlyUsage = {
                        count: newCount,
                        deviceFingerprint: fp,
                        month: currentMonthStr,
                        blockedUntil
                    };

                    localStorage.setItem(USAGE_KEY, JSON.stringify(updatedUsage));
                    setUsageCount(newCount);
                    setIsBlocked(blocked);
                }
            } else {
                // Initialize with first article
                const newUsage: MonthlyUsage = {
                    count: 1,
                    deviceFingerprint: fp,
                    month: currentMonthStr,
                    blockedUntil: null
                };
                localStorage.setItem(USAGE_KEY, JSON.stringify(newUsage));
                setUsageCount(1);
                setIsBlocked(false);
            }
        } catch (e) {
            console.error('Failed to increment usage count', e);
        }
    }, [userRole, userProfile, usageCount]);

    const getRemainingArticles = useCallback((): number => {
        if (userRole === 'admin') {
            return Infinity;
        }
        const articleLimit = getArticleLimit(userProfile);
        return Math.max(0, articleLimit - usageCount);
    }, [usageCount, userRole, userProfile]);

    const getResetDate = useCallback((): Date => {
        const now = new Date();
        return new Date(now.getFullYear(), now.getMonth() + 1, 1);
    }, []);

    return {
        usageCount,
        isBlocked,
        incrementUsage,
        USAGE_LIMIT: getArticleLimit(userProfile),
        remainingArticles: getRemainingArticles(),
        resetDate: getResetDate(),
        currentMonth,
        deviceFingerprint,
        isAdmin: userRole === 'admin',
        hasSubscription: (userProfile?.subscription_tier === 'pro' || userProfile?.subscription_tier === 'premium') || false
    };
};
