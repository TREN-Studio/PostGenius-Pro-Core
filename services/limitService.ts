import { api } from './apiClient';

export interface ArticleLimitInfo {
    allowed: boolean;
    limit: number;  // -1 means unlimited
    used: number;
    remaining: number;
    tier: 'free' | 'pro' | 'premium' | 'admin';
}

/**
 * Check if user can create more articles this month
 */
export async function checkArticleLimit(): Promise<ArticleLimitInfo> {
    try {
        const response = await api.get('/check_limit.php');
        if (response.error) {
            throw new Error(response.error);
        }
        return response as ArticleLimitInfo;
    } catch (error) {
        console.error('Error checking article limit:', error);
        throw error;
    }
}

/**
 * Get user-friendly message about article limits
 */
export function getLimitMessage(limitInfo: ArticleLimitInfo): string {
    if (limitInfo.tier === 'admin' || limitInfo.limit === -1) {
        return 'Unlimited articles';
    }

    if (!limitInfo.allowed) {
        return `You've reached your monthly limit of ${limitInfo.limit} articles. Upgrade to create more!`;
    }

    return `${limitInfo.remaining} of ${limitInfo.limit} articles remaining this month`;
}
