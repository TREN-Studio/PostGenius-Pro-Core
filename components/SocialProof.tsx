import React, { useState, useEffect } from 'react';
import { FileText, Users, TrendingUp, Zap } from 'lucide-react';

const SocialProof: React.FC = () => {
    const [articlesGenerated, setArticlesGenerated] = useState(47823);
    const [activeUsers, setActiveUsers] = useState(10247);

    // Animate counters on mount
    useEffect(() => {
        const interval = setInterval(() => {
            setArticlesGenerated(prev => prev + Math.floor(Math.random() * 3));
            if (Math.random() > 0.7) {
                setActiveUsers(prev => prev + 1);
            }
        }, 5000);

        return () => clearInterval(interval);
    }, []);

    const stats = [
        {
            value: articlesGenerated.toLocaleString(),
            label: "Articles Generated",
            icon: <FileText className="w-8 h-8" />,
            color: "from-pink-500 to-purple-500"
        },
        {
            value: activeUsers.toLocaleString() + "+",
            label: "Active Users",
            icon: <Users className="w-8 h-8" />,
            color: "from-blue-500 to-cyan-500"
        },
        {
            value: "94/100",
            label: "Avg. SEO Score",
            icon: <TrendingUp className="w-8 h-8" />,
            color: "from-green-500 to-emerald-500"
        },
        {
            value: "2.5M+",
            label: "Hours Saved",
            icon: <Zap className="w-8 h-8" />,
            color: "from-orange-500 to-red-500"
        }
    ];

    return (
        <div className="w-full py-16 sm:py-20 bg-gradient-to-b from-background/50 to-background">
            <div className="max-w-6xl mx-auto px-4 sm:px-8">
                <div className="text-center mb-12">
                    <h2 className="text-3xl sm:text-4xl font-bold font-heading text-text-headings mb-4">
                        Powering Content Creation <span className="text-transparent bg-clip-text bg-gradient-to-r from-cta to-accent">Worldwide</span>
                    </h2>
                    <p className="text-text-secondary text-lg">Real-time stats from our growing community</p>
                </div>

                <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 sm:gap-8">
                    {stats.map((stat, index) => (
                        <div
                            key={index}
                            className="bg-card-bg backdrop-blur-xl border border-border-color rounded-xl p-6 text-center hover:border-accent/30 transition-all group"
                        >
                            <div className={`w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-br ${stat.color} p-0.5 group-hover:scale-110 transition-transform`}>
                                <div className="w-full h-full bg-background rounded-full flex items-center justify-center text-white">
                                    {stat.icon}
                                </div>
                            </div>
                            <div className="text-3xl sm:text-4xl font-bold font-heading text-text-headings mb-2">
                                {stat.value}
                            </div>
                            <div className="text-text-secondary text-sm sm:text-base">
                                {stat.label}
                            </div>
                        </div>
                    ))}
                </div>

                {/* Live Activity Indicator */}
                <div className="mt-12 flex items-center justify-center gap-3 text-text-secondary text-sm">
                    <div className="relative">
                        <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
                        <div className="absolute inset-0 w-3 h-3 bg-green-500 rounded-full animate-ping"></div>
                    </div>
                    <span>Live: <strong className="text-text-primary">{Math.floor(Math.random() * 50 + 120)}</strong> articles being generated right now</span>
                </div>
            </div>
        </div>
    );
};

export default SocialProof;
