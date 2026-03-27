import React, { useEffect, useState } from 'react';
import { BarChart, TrendingUp, FileText, Calendar, Tag } from 'lucide-react';
import LoadingSpinner from './LoadingSpinner';
import { getUserAnalytics, type AnalyticsData } from '../services/analyticsDataService';

interface AnalyticsDashboardProps {
    userId: string;
}

const AnalyticsDashboard: React.FC<AnalyticsDashboardProps> = ({ userId }) => {
    const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchAnalytics = async () => {
            try {
                setIsLoading(true);
                const data = await getUserAnalytics(userId);
                setAnalytics(data);
            } catch (err: any) {
                setError(err.message || 'Failed to load analytics');
            } finally {
                setIsLoading(false);
            }
        };

        fetchAnalytics();
    }, [userId]);

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <LoadingSpinner />
            </div>
        );
    }

    if (error) {
        return (
            <div className="max-w-2xl mx-auto p-8">
                <div className="bg-red-900/20 border border-red-500/50 rounded-lg p-6 text-red-400">
                    <h3 className="font-bold mb-2">Error Loading Analytics</h3>
                    <p>{error}</p>
                </div>
            </div>
        );
    }

    if (!analytics) return null;

    const { stats, weeklyTrend, monthlyTrend, categoryBreakdown, recentActivity } = analytics;

    return (
        <div className="max-w-7xl mx-auto p-4 md:p-8 animate-fade-in">
            {/* Header */}
            <div className="mb-8">
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-cta to-accent text-white text-sm font-bold mb-4">
                    <BarChart className="w-4 h-4" />
                    Premium Analytics
                </div>
                <h1 className="text-4xl font-black text-text-headings mb-2">Your Content Analytics</h1>
                <p className="text-text-secondary">Track your content creation performance and insights</p>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                <div className="bg-card-bg border border-border-color rounded-xl p-6">
                    <div className="flex items-center justify-between mb-2">
                        <FileText className="w-8 h-8 text-accent" />
                        <span className="text-sm text-text-secondary">Total</span>
                    </div>
                    <h3 className="text-3xl font-bold text-text-headings">{stats.totalArticles}</h3>
                    <p className="text-sm text-text-secondary mt-1">Total Articles</p>
                </div>

                <div className="bg-card-bg border border-border-color rounded-xl p-6">
                    <div className="flex items-center justify-between mb-2">
                        <Calendar className="w-8 h-8 text-green-500" />
                        <span className="text-sm text-text-secondary">This Month</span>
                    </div>
                    <h3 className="text-3xl font-bold text-text-headings">{stats.publishedThisMonth}</h3>
                    <p className="text-sm text-text-secondary mt-1">Published</p>
                </div>

                <div className="bg-card-bg border border-border-color rounded-xl p-6">
                    <div className="flex items-center justify-between mb-2">
                        <TrendingUp className="w-8 h-8 text-cta" />
                        <span className="text-sm text-text-secondary">Average</span>
                    </div>
                    <h3 className="text-3xl font-bold text-text-headings">{stats.averagePerWeek}</h3>
                    <p className="text-sm text-text-secondary mt-1">Per Week</p>
                </div>

                <div className="bg-card-bg border border-border-color rounded-xl p-6">
                    <div className="flex items-center justify-between mb-2">
                        <FileText className="w-8 h-8 text-yellow-500" />
                        <span className="text-sm text-text-secondary">Drafts</span>
                    </div>
                    <h3 className="text-3xl font-bold text-text-headings">{stats.draftCount}</h3>
                    <p className="text-sm text-text-secondary mt-1">In Progress</p>
                </div>
            </div>

            {/* Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                {/* Weekly Trend */}
                <div className="bg-card-bg border border-border-color rounded-xl p-6">
                    <h3 className="text-xl font-bold text-text-headings mb-4">Last 7 Days</h3>
                    <div className="space-y-3">
                        {weeklyTrend.map((item, i) => {
                            const maxCount = Math.max(...weeklyTrend.map(t => t.count));
                            const percentage = maxCount > 0 ? (item.count / maxCount) * 100 : 0;
                            const date = new Date(item.date);
                            const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });

                            return (
                                <div key={i}>
                                    <div className="flex items-center justify-between mb-1 text-sm">
                                        <span className="text-text-secondary">{dayName}</span>
                                        <span className="text-text-headings font-semibold">{item.count}</span>
                                    </div>
                                    <div className="w-full bg-secondary-bg rounded-full h-2">
                                        <div
                                            className="bg-gradient-to-r from-cta to-accent h-2 rounded-full transition-all duration-500"
                                            style={{ width: `${percentage}%` }}
                                        />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Monthly Trend */}
                <div className="bg-card-bg border border-border-color rounded-xl p-6">
                    <h3 className="text-xl font-bold text-text-headings mb-4">Last 4 Weeks</h3>
                    <div className="space-y-3">
                        {monthlyTrend.map((item, i) => {
                            const maxCount = Math.max(...monthlyTrend.map(t => t.count));
                            const percentage = maxCount > 0 ? (item.count / maxCount) * 100 : 0;

                            return (
                                <div key={i}>
                                    <div className="flex items-center justify-between mb-1 text-sm">
                                        <span className="text-text-secondary">{item.date}</span>
                                        <span className="text-text-headings font-semibold">{item.count}</span>
                                    </div>
                                    <div className="w-full bg-secondary-bg rounded-full h-2">
                                        <div
                                            className="bg-gradient-to-r from-accent to-cta h-2 rounded-full transition-all duration-500"
                                            style={{ width: `${percentage}%` }}
                                        />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* Category Breakdown & Recent Activity */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Category Breakdown */}
                <div className="bg-card-bg border border-border-color rounded-xl p-6">
                    <div className="flex items-center gap-2 mb-4">
                        <Tag className="w-5 h-5 text-accent" />
                        <h3 className="text-xl font-bold text-text-headings">Top Categories</h3>
                    </div>
                    {categoryBreakdown.length > 0 ? (
                        <div className="space-y-3">
                            {categoryBreakdown.map((item, i) => {
                                const maxCount = Math.max(...categoryBreakdown.map(c => c.count));
                                const percentage = (item.count / maxCount) * 100;

                                return (
                                    <div key={i}>
                                        <div className="flex items-center justify-between mb-1">
                                            <span className="text-text-primary font-medium">{item.category}</span>
                                            <span className="text-text-secondary text-sm">{item.count} articles</span>
                                        </div>
                                        <div className="w-full bg-secondary-bg rounded-full h-2">
                                            <div
                                                className="bg-accent h-2 rounded-full transition-all duration-500"
                                                style={{ width: `${percentage}%` }}
                                            />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <p className="text-text-secondary text-center py-8">No categories yet</p>
                    )}
                </div>

                {/* Recent Activity */}
                <div className="bg-card-bg border border-border-color rounded-xl p-6">
                    <h3 className="text-xl font-bold text-text-headings mb-4">Recent Activity</h3>
                    {recentActivity.length > 0 ? (
                        <div className="space-y-3">
                            {recentActivity.map((item, i) => (
                                <div key={i} className="flex items-start gap-3 p-3 bg-secondary-bg/50 rounded-lg">
                                    <FileText className="w-5 h-5 text-accent mt-0.5 flex-shrink-0" />
                                    <div className="flex-1 min-w-0">
                                        <h4 className="text-text-primary font-medium truncate">{item.title}</h4>
                                        <div className="flex items-center gap-2 mt-1">
                                            <span className="text-xs text-text-secondary">
                                                {new Date(item.created_at).toLocaleDateString('en-US', {
                                                    month: 'short',
                                                    day: 'numeric',
                                                    year: 'numeric'
                                                })}
                                            </span>
                                            <span className={`text-xs px-2 py-0.5 rounded-full ${item.status === 'published'
                                                    ? 'bg-green-500/20 text-green-400'
                                                    : 'bg-yellow-500/20 text-yellow-400'
                                                }`}>
                                                {item.status}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="text-text-secondary text-center py-8">No recent activity</p>
                    )}
                </div>
            </div>
        </div>
    );
};

export default AnalyticsDashboard;
