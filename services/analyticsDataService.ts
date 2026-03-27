import { api } from './apiClient';

export interface ArticleStats {
    totalArticles: number;
    publishedThisMonth: number;
    publishedAllTime: number;
    draftCount: number;
    averagePerWeek: number;
}

export interface UsageTrend {
    date: string;
    count: number;
}

export interface CategoryBreakdown {
    category: string;
    count: number;
}

export interface AnalyticsData {
    stats: ArticleStats;
    weeklyTrend: UsageTrend[];
    monthlyTrend: UsageTrend[];
    categoryBreakdown: CategoryBreakdown[];
    recentActivity: {
        title: string;
        created_at: string;
        status: string;
    }[];
}

/**
 * Fetch comprehensive analytics data for a user
 */
export async function getUserAnalytics(userId: string): Promise<AnalyticsData> {
    try {
        const response = await api.get(`/analytics.php?user_id=${userId}`);
        if (response.error) {
            throw new Error(response.error);
        }
        return response as AnalyticsData;
    } catch (error) {
        console.error('Error fetching analytics:', error);
        throw error;
    }
}


/**
 * Check if user has premium tier access
 */
export function isPremiumUser(userProfile: { subscription_tier?: string }): boolean {
    return userProfile.subscription_tier === 'premium';
}
