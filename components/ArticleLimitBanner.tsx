import React, { useEffect, useState } from 'react';
import { FileText, TrendingUp, AlertCircle } from 'lucide-react';
import { checkArticleLimit, getLimitMessage, type ArticleLimitInfo } from '../services/limitService';
import { Link } from 'react-router-dom';

const ArticleLimitBanner: React.FC = () => {
    const [limitInfo, setLimitInfo] = useState<ArticleLimitInfo | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const fetchLimit = async () => {
            try {
                const info = await checkArticleLimit();
                setLimitInfo(info);
            } catch (error) {
                console.error('Failed to fetch article limit:', error);
            } finally {
                setIsLoading(false);
            }
        };

        fetchLimit();
    }, []);

    if (isLoading || !limitInfo) return null;

    // Don't show for unlimited users
    if (limitInfo.limit === -1) return null;

    const percentage = (limitInfo.used / limitInfo.limit) * 100;
    const isNearLimit = percentage >= 80;
    const isAtLimit = !limitInfo.allowed;

    return (
        <div className={`mb-6 p-4 rounded-lg border ${isAtLimit
                ? 'bg-red-900/20 border-red-500/50'
                : isNearLimit
                    ? 'bg-yellow-900/20 border-yellow-500/50'
                    : 'bg-blue-900/20 border-blue-500/50'
            }`}>
            <div className="flex items-start gap-3">
                <div className={`mt-0.5 ${isAtLimit ? 'text-red-400' : isNearLimit ? 'text-yellow-400' : 'text-blue-400'
                    }`}>
                    {isAtLimit ? <AlertCircle className="w-5 h-5" /> : <FileText className="w-5 h-5" />}
                </div>

                <div className="flex-1">
                    <div className="flex items-center justify-between mb-2">
                        <h3 className={`font-semibold ${isAtLimit ? 'text-red-300' : isNearLimit ? 'text-yellow-300' : 'text-blue-300'
                            }`}>
                            {isAtLimit ? 'Monthly Limit Reached' : 'Article Usage'}
                        </h3>
                        <span className={`text-sm font-medium ${isAtLimit ? 'text-red-400' : isNearLimit ? 'text-yellow-400' : 'text-blue-400'
                            }`}>
                            {limitInfo.used} / {limitInfo.limit} articles
                        </span>
                    </div>

                    {/* Progress Bar */}
                    <div className="w-full bg-gray-700 rounded-full h-2 mb-3">
                        <div
                            className={`h-2 rounded-full transition-all duration-500 ${isAtLimit
                                    ? 'bg-red-500'
                                    : isNearLimit
                                        ? 'bg-yellow-500'
                                        : 'bg-blue-500'
                                }`}
                            style={{ width: `${Math.min(percentage, 100)}%` }}
                        />
                    </div>

                    <p className="text-sm text-text-secondary mb-3">
                        {getLimitMessage(limitInfo)}
                    </p>

                    {(isAtLimit || isNearLimit) && (
                        <Link
                            to="/pricing"
                            className="inline-flex items-center gap-2 text-sm font-medium text-accent hover:text-accent/80 transition-colors"
                        >
                            <TrendingUp className="w-4 h-4" />
                            Upgrade for more articles
                        </Link>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ArticleLimitBanner;
