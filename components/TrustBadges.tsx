import React from 'react';
import { ShieldCheck, Lock, Activity, BadgeCheck } from 'lucide-react';

const TrustBadges: React.FC = () => {
    const badges = [
        {
            icon: <ShieldCheck className="w-8 h-8" />,
            title: "SSL Secure",
            description: "256-bit Encryption",
            color: "from-green-400 to-emerald-500",
            glowColor: "rgba(16, 185, 129, 0.5)"
        },
        {
            icon: <Lock className="w-8 h-8" />,
            title: "Privacy First",
            description: "Your Data Protected",
            color: "from-blue-400 to-cyan-500",
            glowColor: "rgba(0, 212, 255, 0.5)"
        },
        {
            icon: <Activity className="w-8 h-8" />,
            title: "99.9% Uptime",
            description: "Always Available",
            color: "from-purple-400 to-pink-500",
            glowColor: "rgba(139, 92, 246, 0.5)"
        },
        {
            icon: <BadgeCheck className="w-8 h-8" />,
            title: "30-Day Guarantee",
            description: "Risk-Free Trial",
            color: "from-yellow-400 to-orange-500",
            glowColor: "rgba(251, 191, 36, 0.5)"
        }
    ];

    return (
        <div className="w-full py-16 bg-gradient-to-b from-background/50 to-background relative overflow-hidden">
            {/* Animated grid background */}
            <div className="absolute inset-0 opacity-5">
                <div className="absolute inset-0" style={{
                    backgroundImage: 'linear-gradient(#00D4FF 1px, transparent 1px), linear-gradient(90deg, #00D4FF 1px, transparent 1px)',
                    backgroundSize: '40px 40px'
                }}></div>
            </div>

            <div className="max-w-7xl mx-auto px-4 sm:px-8 relative z-10">
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
                    {badges.map((badge, index) => (
                        <div
                            key={index}
                            className="relative group"
                            style={{
                                animation: `float ${3 + index * 0.3}s ease-in-out infinite`
                            }}
                        >
                            {/* Glow effect */}
                            <div
                                className="absolute -inset-0.5 rounded-2xl opacity-0 group-hover:opacity-100 blur transition duration-500"
                                style={{
                                    background: `linear-gradient(45deg, ${badge.glowColor}, transparent)`
                                }}
                            ></div>

                            {/* Card */}
                            <div className="relative bg-gray-900/80 backdrop-blur-xl border border-gray-800 rounded-2xl p-6 hover:border-cyan-500/30 transition-all duration-300 text-center">
                                {/* Icon */}
                                <div className={`w-16 h-16 mx-auto mb-4 rounded-xl bg-gradient-to-br ${badge.color} p-0.5 group-hover:scale-110 transition-transform`}>
                                    <div className="w-full h-full bg-gray-900 rounded-xl flex items-center justify-center text-white">
                                        {badge.icon}
                                    </div>
                                </div>

                                {/* Title */}
                                <h3 className="text-white font-bold text-lg mb-2 font-heading">
                                    {badge.title}
                                </h3>

                                {/* Description */}
                                <p className="text-gray-400 text-sm">
                                    {badge.description}
                                </p>

                                {/* Animated line */}
                                <div className="mt-4 h-0.5 bg-gray-800 rounded-full overflow-hidden">
                                    <div
                                        className={`h-full bg-gradient-to-r ${badge.color} rounded-full`}
                                        style={{
                                            width: '100%',
                                            animation: 'progress-slide 2s ease-in-out infinite'
                                        }}
                                    ></div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            <style>{`
        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-8px); }
        }
        @keyframes progress-slide {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
      `}</style>
        </div>
    );
};

export default TrustBadges;
