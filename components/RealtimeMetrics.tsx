import React, { useState, useEffect } from 'react';
import { FileText, Users, Type, Zap } from 'lucide-react';

interface Metric {
    label: string;
    value: number;
    suffix: string;
    icon: React.ReactNode;
    color: string;
    glowColor: string;
}

const RealtimeMetrics: React.FC = () => {
    const [metrics, setMetrics] = useState({
        articlesGenerated: 47823,
        activeUsers: 342,
        wordsGenerated: 12847293,
        processingSpeed: 847
    });

    // Simulate real-time updates
    useEffect(() => {
        const interval = setInterval(() => {
            setMetrics(prev => ({
                articlesGenerated: prev.articlesGenerated + Math.floor(Math.random() * 3),
                activeUsers: prev.activeUsers + (Math.random() > 0.5 ? 1 : -1),
                wordsGenerated: prev.wordsGenerated + Math.floor(Math.random() * 500),
                processingSpeed: 800 + Math.floor(Math.random() * 100)
            }));
        }, 3000);

        return () => clearInterval(interval);
    }, []);

    const metricsData: Metric[] = [
        {
            label: "Articles Generated",
            value: metrics.articlesGenerated,
            suffix: "",
            color: "from-cyan-400 to-blue-500",
            glowColor: "rgba(0, 212, 255, 0.5)",
            icon: <FileText className="w-8 h-8" />
        },
        {
            label: "Active Users",
            value: metrics.activeUsers,
            suffix: "",
            color: "from-pink-400 to-rose-500",
            glowColor: "rgba(255, 0, 110, 0.5)",
            icon: <Users className="w-8 h-8" />
        },
        {
            label: "Words Generated",
            value: Math.floor(metrics.wordsGenerated / 1000),
            suffix: "K",
            color: "from-purple-400 to-indigo-500",
            glowColor: "rgba(139, 92, 246, 0.5)",
            icon: <Type className="w-8 h-8" />
        },
        {
            label: "Processing Speed",
            value: metrics.processingSpeed,
            suffix: " ms",
            color: "from-green-400 to-emerald-500",
            glowColor: "rgba(16, 185, 129, 0.5)",
            icon: <Zap className="w-8 h-8" />
        }
    ];

    return (
        <div className="w-full py-12 relative overflow-hidden">
            {/* Animated background grid */}
            <div className="absolute inset-0 opacity-10">
                <div className="absolute inset-0" style={{
                    backgroundImage: 'linear-gradient(#00D4FF 1px, transparent 1px), linear-gradient(90deg, #00D4FF 1px, transparent 1px)',
                    backgroundSize: '50px 50px',
                    animation: 'grid-move 20s linear infinite'
                }}></div>
            </div>

            <div className="max-w-7xl mx-auto px-4 sm:px-8 relative z-10">
                <div className="text-center mb-12">
                    <h2 className="text-3xl sm:text-4xl font-bold font-heading text-white mb-4">
                        <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-purple-400 to-pink-400 animate-gradient-x">
                            Real-Time AI Analytics
                        </span>
                    </h2>
                    <p className="text-gray-400 text-lg">Live metrics from our global AI network</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    {metricsData.map((metric, index) => (
                        <div
                            key={index}
                            className="relative group"
                            style={{
                                animation: `float ${3 + index * 0.5}s ease-in-out infinite`
                            }}
                        >
                            {/* Glow effect */}
                            <div
                                className="absolute -inset-0.5 rounded-2xl opacity-75 group-hover:opacity-100 blur transition duration-1000 group-hover:duration-200"
                                style={{
                                    background: `linear-gradient(45deg, ${metric.glowColor}, transparent)`,
                                    animation: 'pulse-glow 2s ease-in-out infinite'
                                }}
                            ></div>

                            {/* Card */}
                            <div className="relative bg-gray-900/90 backdrop-blur-xl border border-gray-800 rounded-2xl p-6 hover:border-cyan-500/50 transition-all duration-300">
                                {/* Icon */}
                                <div className={`w-16 h-16 rounded-xl bg-gradient-to-br ${metric.color} p-0.5 mb-4 group-hover:scale-110 transition-transform`}>
                                    <div className="w-full h-full bg-gray-900 rounded-xl flex items-center justify-center text-white">
                                        {metric.icon}
                                    </div>
                                </div>

                                {/* Value */}
                                <div className="mb-2">
                                    <span className={`text-4xl font-bold font-mono bg-gradient-to-r ${metric.color} bg-clip-text text-transparent`}>
                                        {metric.value.toLocaleString()}
                                    </span>
                                    <span className="text-2xl font-bold text-gray-500">{metric.suffix}</span>
                                </div>

                                {/* Label */}
                                <div className="text-gray-400 text-sm font-medium uppercase tracking-wider">
                                    {metric.label}
                                </div>

                                {/* Animated line */}
                                <div className="mt-4 h-1 bg-gray-800 rounded-full overflow-hidden">
                                    <div
                                        className={`h-full bg-gradient-to-r ${metric.color} rounded-full`}
                                        style={{
                                            width: '100%',
                                            animation: 'progress-bar 2s ease-in-out infinite'
                                        }}
                                    ></div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Live indicator */}
                <div className="flex items-center justify-center gap-3 mt-12">
                    <div className="relative">
                        <div className="w-3 h-3 bg-cyan-400 rounded-full animate-pulse"></div>
                        <div className="absolute inset-0 w-3 h-3 bg-cyan-400 rounded-full animate-ping"></div>
                    </div>
                    <span className="text-gray-400 text-sm font-mono">
                        LIVE • Updating every 3 seconds
                    </span>
                </div>
            </div>

            <style>{`
        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-10px); }
        }
        @keyframes pulse-glow {
          0%, 100% { opacity: 0.5; }
          50% { opacity: 1; }
        }
        @keyframes progress-bar {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
        @keyframes grid-move {
          0% { transform: translate(0, 0); }
          100% { transform: translate(50px, 50px); }
        }
      `}</style>
        </div>
    );
};

export default RealtimeMetrics;
