import React, { Suspense } from 'react';
import Scene3D from './Scene3D';

interface HeroSectionProps {
    onStartCreate: () => void;
}

const HeroSection: React.FC<HeroSectionProps> = ({ onStartCreate }) => {
    return (
        <div className="relative w-full min-h-screen flex items-center justify-center overflow-hidden bg-black">
            {/* 3D Scene Background */}
            <div className="absolute inset-0 z-0">
                <Suspense fallback={
                    <div className="absolute inset-0 z-0 bg-black">
                        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-indigo-900/20 via-black to-black"></div>
                        <div className="absolute top-0 left-0 w-full h-full opacity-30 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] brightness-100 contrast-150"></div>
                    </div>
                }>
                    <Scene3D />
                </Suspense>
                {/* Gradient Overlay for Text Readability */}
                <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-black/40 pointer-events-none" />
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,rgba(0,0,0,0.8)_100%)] pointer-events-none" />
            </div>

            <div className="relative z-10 container mx-auto px-4 text-center">
                {/* Badge */}
                <div className="inline-block mb-8 px-6 py-2 rounded-full border border-white/10 bg-white/5 backdrop-blur-xl shadow-[0_0_15px_rgba(0,243,255,0.1)]">
                    <span className="text-cyan-300 text-xs font-mono tracking-[0.3em] uppercase">
                        System V3.16 Online
                    </span>
                </div>

                {/* Main Heading - Refined & Elegant */}
                <h1 className="font-sans font-light text-5xl md:text-7xl tracking-[-0.02em] text-white mb-8 leading-tight">
                    Postgenius <span className="font-semibold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-purple-500">Pro</span>
                </h1>

                <p className="font-mono text-cyan-200/80 tracking-[0.2em] text-sm md:text-base uppercase mb-12">
                    The Intelligence Engine
                </p>

                {/* Subheading */}
                <p className="max-w-2xl mx-auto text-lg text-gray-400 mb-12 font-light leading-relaxed">
                    Experience the next evolution of autonomous publishing. <br />
                    Powered by <strong className="text-white hover:text-cyan-300 transition-colors">Gemini 2.0</strong>, <strong className="text-white hover:text-purple-300 transition-colors">DeepSeek V3</strong>, and <strong className="text-white hover:text-blue-300 transition-colors">Qwen 2.5</strong>.
                </p>

                {/* CTA Actions */}
                <div className="flex flex-col sm:flex-row items-center justify-center gap-8">
                    <button
                        onClick={onStartCreate}
                        className="group relative px-10 py-5 bg-white text-black font-medium text-lg rounded-full overflow-hidden transition-all hover:scale-105 hover:shadow-[0_0_50px_rgba(255,255,255,0.3)]"
                    >
                        <div className="absolute inset-0 w-full h-full bg-gradient-to-r from-transparent via-cyan-200 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700"></div>
                        <span className="relative flex items-center gap-3 tracking-wide">
                            INITIATE
                            <svg className="w-5 h-5 transition-transform group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
                        </span>
                    </button>

                    <a href="/features" className="text-gray-400 hover:text-white transition-all text-sm font-mono tracking-widest uppercase border-b border-transparent hover:border-cyan-400/50 pb-1">
                        System Specs
                    </a>
                </div>

                {/* Glassmorphism Stats Cards */}
                <div className="mt-24 grid grid-cols-2 md:grid-cols-4 gap-4 max-w-5xl mx-auto">
                    {[
                        { label: "Generations", value: "∞" },
                        { label: "Latency", value: "0.5s" },
                        { label: "Uptime", value: "100%" },
                        { label: "Resolution", value: "4K" }
                    ].map((stat, i) => (
                        <div key={i} className="p-4 rounded-xl bg-white/5 border border-white/5 backdrop-blur-sm hover:bg-white/10 transition-colors group">
                            <div className="text-2xl md:text-3xl font-light text-white mb-1 group-hover:text-cyan-300 transition-colors">{stat.value}</div>
                            <div className="text-[10px] text-gray-500 uppercase tracking-widest">{stat.label}</div>
                        </div>
                    ))}
                </div>
            </div>
        </div >
    );
};

export default HeroSection;
