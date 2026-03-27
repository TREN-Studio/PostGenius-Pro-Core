import React, { useEffect, useRef, useState } from 'react';

interface ActivityMarker {
    id: string;
    lat: number;
    lng: number;
    city: string;
    country: string;
    topic: string;
    timestamp: Date;
}

const GlobalActivityMap: React.FC = () => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [activities, setActivities] = useState<ActivityMarker[]>([]);
    const [rotation, setRotation] = useState(0);

    const locations = [
        { lat: 40.7128, lng: -74.0060, city: "New York", country: "USA" },
        { lat: 51.5074, lng: -0.1278, city: "London", country: "UK" },
        { lat: 35.6762, lng: 139.6503, city: "Tokyo", country: "Japan" },
        { lat: 48.8566, lng: 2.3522, city: "Paris", country: "France" },
        { lat: -33.8688, lng: 151.2093, city: "Sydney", country: "Australia" },
        { lat: 52.5200, lng: 13.4050, city: "Berlin", country: "Germany" },
        { lat: 43.6532, lng: -79.3832, city: "Toronto", country: "Canada" },
        { lat: 19.0760, lng: 72.8777, city: "Mumbai", country: "India" },
        { lat: -23.5505, lng: -46.6333, city: "São Paulo", country: "Brazil" },
        { lat: 25.2048, lng: 55.2708, city: "Dubai", country: "UAE" }
    ];

    const topics = [
        "AI Writing Tools",
        "SEO Optimization",
        "Content Marketing",
        "Productivity Hacks",
        "Digital Nomad Life"
    ];

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const resizeCanvas = () => {
            canvas.width = canvas.offsetWidth;
            canvas.height = canvas.offsetHeight;
        };
        resizeCanvas();
        window.addEventListener('resize', resizeCanvas);

        // Auto-rotate
        const rotateInterval = setInterval(() => {
            setRotation(prev => (prev + 0.2) % 360);
        }, 50);

        // Add new activities
        const activityInterval = setInterval(() => {
            const loc = locations[Math.floor(Math.random() * locations.length)];
            const newActivity: ActivityMarker = {
                id: Math.random().toString(36).substr(2, 9),
                lat: loc.lat,
                lng: loc.lng,
                city: loc.city,
                country: loc.country,
                topic: topics[Math.floor(Math.random() * topics.length)],
                timestamp: new Date()
            };
            setActivities(prev => [newActivity, ...prev].slice(0, 20));
        }, 3000);

        return () => {
            window.removeEventListener('resize', resizeCanvas);
            clearInterval(rotateInterval);
            clearInterval(activityInterval);
        };
    }, []);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;
        const radius = Math.min(canvas.width, canvas.height) * 0.35;

        // Clear canvas
        ctx.fillStyle = 'rgba(10, 14, 39, 0.1)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Draw globe outline
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(0, 212, 255, 0.3)';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Draw latitude lines
        for (let i = -60; i <= 60; i += 30) {
            const y = centerY + (i / 90) * radius;
            const width = Math.sqrt(radius * radius - ((i / 90) * radius) ** 2) * 2;

            ctx.beginPath();
            ctx.ellipse(centerX, y, width / 2, width * 0.1, 0, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(0, 212, 255, 0.1)';
            ctx.lineWidth = 1;
            ctx.stroke();
        }

        // Draw longitude lines
        for (let i = 0; i < 12; i++) {
            const angle = (i * 30 + rotation) * (Math.PI / 180);

            ctx.beginPath();
            ctx.ellipse(centerX, centerY, radius * Math.abs(Math.cos(angle)), radius, 0, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(0, 212, 255, 0.1)';
            ctx.lineWidth = 1;
            ctx.stroke();
        }

        // Draw activity markers
        activities.forEach((activity, index) => {
            const age = (Date.now() - activity.timestamp.getTime()) / 1000;
            if (age > 10) return; // Fade out after 10 seconds

            const adjustedLng = activity.lng + rotation;
            const x = centerX + radius * Math.cos(activity.lat * Math.PI / 180) * Math.sin(adjustedLng * Math.PI / 180);
            const y = centerY - radius * Math.sin(activity.lat * Math.PI / 180);
            const z = radius * Math.cos(activity.lat * Math.PI / 180) * Math.cos(adjustedLng * Math.PI / 180);

            // Only draw if on visible side
            if (z > 0) {
                const opacity = Math.max(0, 1 - age / 10);
                const size = 8 - (age / 10) * 3;

                // Pulsing glow
                const pulseSize = size + Math.sin(Date.now() / 200 + index) * 2;
                const gradient = ctx.createRadialGradient(x, y, 0, x, y, pulseSize * 3);
                gradient.addColorStop(0, `rgba(0, 212, 255, ${opacity * 0.8})`);
                gradient.addColorStop(0.5, `rgba(0, 212, 255, ${opacity * 0.3})`);
                gradient.addColorStop(1, 'rgba(0, 212, 255, 0)');

                ctx.fillStyle = gradient;
                ctx.beginPath();
                ctx.arc(x, y, pulseSize * 3, 0, Math.PI * 2);
                ctx.fill();

                // Marker dot
                ctx.fillStyle = `rgba(0, 255, 240, ${opacity})`;
                ctx.beginPath();
                ctx.arc(x, y, size, 0, Math.PI * 2);
                ctx.fill();

                // Ring
                ctx.strokeStyle = `rgba(255, 0, 110, ${opacity * 0.5})`;
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(x, y, size + 4, 0, Math.PI * 2);
                ctx.stroke();
            }
        });

        // Draw connection lines between recent markers
        for (let i = 0; i < Math.min(activities.length - 1, 3); i++) {
            const a1 = activities[i];
            const a2 = activities[i + 1];

            const x1 = centerX + radius * Math.cos(a1.lat * Math.PI / 180) * Math.sin((a1.lng + rotation) * Math.PI / 180);
            const y1 = centerY - radius * Math.sin(a1.lat * Math.PI / 180);
            const x2 = centerX + radius * Math.cos(a2.lat * Math.PI / 180) * Math.sin((a2.lng + rotation) * Math.PI / 180);
            const y2 = centerY - radius * Math.sin(a2.lat * Math.PI / 180);

            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.strokeStyle = 'rgba(139, 92, 246, 0.2)';
            ctx.lineWidth = 1;
            ctx.stroke();
        }

    }, [activities, rotation]);

    return (
        <div className="w-full py-16 bg-gradient-to-b from-background to-background/50 relative overflow-hidden">
            {/* Title */}
            <div className="text-center mb-8 relative z-10">
                <h2 className="text-3xl sm:text-4xl font-bold font-heading text-white mb-4">
                    <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-purple-400 to-pink-400">
                        Global AI Network
                    </span>
                </h2>
                <p className="text-gray-400 text-lg">Real-time article generation worldwide</p>
            </div>

            <div className="max-w-7xl mx-auto px-4 sm:px-8 relative">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-center">
                    {/* Globe Canvas */}
                    <div className="lg:col-span-2 relative">
                        <canvas
                            ref={canvasRef}
                            className="w-full h-[400px] sm:h-[500px] rounded-2xl"
                            style={{ background: 'transparent' }}
                        />

                        {/* Live indicator */}
                        <div className="absolute top-4 left-4 flex items-center gap-2 bg-gray-900/80 backdrop-blur-xl border border-cyan-500/30 rounded-full px-4 py-2">
                            <div className="relative">
                                <div className="w-2 h-2 bg-cyan-400 rounded-full animate-pulse"></div>
                                <div className="absolute inset-0 w-2 h-2 bg-cyan-400 rounded-full animate-ping"></div>
                            </div>
                            <span className="text-cyan-400 text-sm font-mono font-bold">LIVE</span>
                        </div>
                    </div>

                    {/* Recent Activity List */}
                    <div className="lg:col-span-1">
                        <div className="bg-gray-900/50 backdrop-blur-xl border border-cyan-500/20 rounded-2xl p-6">
                            <h3 className="text-white font-bold text-lg mb-4 font-heading">Recent Activity</h3>
                            <div className="space-y-3 max-h-[400px] overflow-y-auto custom-scrollbar">
                                {activities.slice(0, 5).map((activity, index) => (
                                    <div
                                        key={activity.id}
                                        className="bg-gray-800/50 border border-gray-700/50 rounded-lg p-3"
                                        style={{
                                            animation: `fade-in 0.5s ease-out ${index * 0.1}s both`
                                        }}
                                    >
                                        <div className="flex items-center gap-2 mb-2">
                                            <div className="w-2 h-2 bg-cyan-400 rounded-full animate-pulse"></div>
                                            <span className="text-gray-400 text-xs">{activity.city}, {activity.country}</span>
                                        </div>
                                        <p className="text-white text-sm line-clamp-1">{activity.topic}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <style>{`
        @keyframes fade-in {
          from { opacity: 0; transform: translateY(-10px); }
          to { opacity: 1; transform: translateY(0); }
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

export default GlobalActivityMap;
