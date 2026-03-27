import React, { useState, useEffect } from 'react';

interface Activity {
    id: string;
    user: string;
    location: string;
    country: string;
    topic: string;
    type: string;
    timestamp: Date;
}

const LiveActivityFeed: React.FC = () => {
    const [activities, setActivities] = useState<Activity[]>([]);

    const locations = [
        { city: "New York", country: "USA", flag: "🇺🇸" },
        { city: "London", country: "UK", flag: "🇬🇧" },
        { city: "Tokyo", country: "Japan", flag: "🇯🇵" },
        { city: "Paris", country: "France", flag: "🇫🇷" },
        { city: "Sydney", country: "Australia", flag: "🇦🇺" },
        { city: "Berlin", country: "Germany", flag: "🇩🇪" },
        { city: "Toronto", country: "Canada", flag: "🇨🇦" },
        { city: "Mumbai", country: "India", flag: "🇮🇳" },
        { city: "São Paulo", country: "Brazil", flag: "🇧🇷" },
        { city: "Dubai", country: "UAE", flag: "🇦🇪" }
    ];

    const topics = [
        "Best Coffee Makers 2024",
        "How to Start a Blog",
        "Top 10 Productivity Apps",
        "Healthy Meal Prep Ideas",
        "Digital Marketing Guide",
        "AI Tools for Writers",
        "Travel Tips for Europe",
        "Home Office Setup",
        "Fitness Workout Plans",
        "Photography Techniques"
    ];

    const types = ["Recipe", "Review", "Guide", "Tutorial", "Roundup"];

    const generateActivity = (): Activity => {
        const loc = locations[Math.floor(Math.random() * locations.length)];
        return {
            id: Math.random().toString(36).substr(2, 9),
            user: `User${Math.floor(Math.random() * 9999)}`,
            location: `${loc.city}, ${loc.country} ${loc.flag}`,
            country: loc.country,
            topic: topics[Math.floor(Math.random() * topics.length)],
            type: types[Math.floor(Math.random() * types.length)],
            timestamp: new Date()
        };
    };

    useEffect(() => {
        // Initialize with some activities
        setActivities(Array.from({ length: 5 }, generateActivity));

        // Add new activity every 4-8 seconds
        const interval = setInterval(() => {
            const newActivity = generateActivity();
            setActivities(prev => [newActivity, ...prev].slice(0, 10));
        }, Math.random() * 4000 + 4000);

        return () => clearInterval(interval);
    }, []);

    const getTimeAgo = (date: Date) => {
        const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);
        if (seconds < 10) return 'Just now';
        if (seconds < 60) return `${seconds}s ago`;
        const minutes = Math.floor(seconds / 60);
        return `${minutes}m ago`;
    };

    return (
        <div className="w-full max-w-md mx-auto lg:mx-0">
            <div className="bg-gray-900/50 backdrop-blur-xl border border-cyan-500/20 rounded-2xl p-6 shadow-2xl">
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <h3 className="text-xl font-bold text-white font-heading flex items-center gap-2">
                            <span className="relative flex h-3 w-3">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-3 w-3 bg-cyan-500"></span>
                            </span>
                            Live Activity
                        </h3>
                        <p className="text-gray-400 text-sm mt-1">Articles being generated now</p>
                    </div>
                </div>

                {/* Activity Feed */}
                <div className="space-y-3 max-h-[500px] overflow-y-auto custom-scrollbar">
                    {activities.map((activity, index) => (
                        <div
                            key={activity.id}
                            className="relative group"
                            style={{
                                animation: `slide-in 0.5s ease-out ${index * 0.1}s both`
                            }}
                        >
                            {/* Glow line */}
                            <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-gradient-to-b from-cyan-400 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>

                            <div className="bg-gray-800/50 hover:bg-gray-800/80 border border-gray-700/50 hover:border-cyan-500/30 rounded-xl p-4 transition-all duration-300 pl-5">
                                {/* User & Location */}
                                <div className="flex items-start justify-between mb-2">
                                    <div className="flex items-center gap-2">
                                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center text-white text-xs font-bold">
                                            {activity.user.slice(-2)}
                                        </div>
                                        <div>
                                            <p className="text-gray-300 text-sm font-medium">{activity.user}</p>
                                            <p className="text-gray-500 text-xs">{activity.location}</p>
                                        </div>
                                    </div>
                                    <span className="text-xs text-gray-500 font-mono">{getTimeAgo(activity.timestamp)}</span>
                                </div>

                                {/* Topic */}
                                <p className="text-white text-sm mb-2 line-clamp-1">
                                    "{activity.topic}"
                                </p>

                                {/* Type Badge */}
                                <div className="flex items-center gap-2">
                                    <span className="inline-flex items-center px-2 py-1 rounded-md bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-xs font-medium">
                                        {activity.type}
                                    </span>
                                    <div className="flex-1 h-px bg-gradient-to-r from-cyan-500/20 to-transparent"></div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Footer Stats */}
                <div className="mt-6 pt-4 border-t border-gray-800">
                    <div className="grid grid-cols-2 gap-4 text-center">
                        <div>
                            <p className="text-2xl font-bold text-cyan-400 font-mono">{activities.length}</p>
                            <p className="text-gray-500 text-xs uppercase tracking-wider">Recent</p>
                        </div>
                        <div>
                            <p className="text-2xl font-bold text-pink-400 font-mono">
                                {new Set(activities.map(a => a.country)).size}
                            </p>
                            <p className="text-gray-500 text-xs uppercase tracking-wider">Countries</p>
                        </div>
                    </div>
                </div>
            </div>

            <style>{`
        @keyframes slide-in {
          from {
            opacity: 0;
            transform: translateX(-20px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: rgba(31, 41, 55, 0.5);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: linear-gradient(to bottom, #06b6d4, #8b5cf6);
          border-radius: 10px;
        }
      `}</style>
        </div>
    );
};

export default LiveActivityFeed;
