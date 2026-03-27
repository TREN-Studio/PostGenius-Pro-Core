import React, { useEffect, useState } from 'react';
import { AiConfig } from '../types';

interface SmartEngineVisualProps {
    aiConfig: AiConfig;
}

const SmartEngineVisual: React.FC<SmartEngineVisualProps> = ({ aiConfig }) => {
    const [activePath, setActivePath] = useState<number>(0);

    // Determine the active path based on config
    useEffect(() => {
        if (aiConfig.geminiApiKey) {
            setActivePath(1); // Priority 1: User Key
        } else if (aiConfig.useBeastMode) {
            setActivePath(3); // Priority 3: Beast Mode (Forced)
        } else {
            setActivePath(3); // Default to Beast Mode if no keys (Zero Config)
        }
    }, [aiConfig]);

    return (
        <div className="relative w-full max-w-4xl mx-auto p-8 rounded-2xl bg-card-bg border border-white/10 backdrop-blur-xl overflow-hidden shadow-2xl">
            {/* Header */}
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-accent to-transparent opacity-50"></div>
            <div className="mb-8 text-center">
                <h3 className="text-xl font-heading font-bold text-white tracking-widest uppercase">
                    Neural Intelligence Pipeline
                </h3>
                <p className="text-text-secondary text-sm mt-2 font-mono">
                    Real-time Logic Visualization
                </p>
            </div>

            {/* The Engine Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 relative z-10">
                {/* Node 1: User Keys */}
                <div className={`
                    relative p-6 rounded-xl border transition-all duration-500
                    ${activePath === 1
                        ? 'bg-accent/10 border-accent shadow-[0_0_30px_rgba(0,243,255,0.2)]'
                        : 'bg-white/5 border-white/5 opacity-50 grayscale'}
                `}>
                    <div className="absolute top-2 right-2">
                        {activePath === 1 && (
                            <span className="flex h-3 w-3">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-3 w-3 bg-accent"></span>
                            </span>
                        )}
                    </div>
                    <h4 className="font-bold text-lg mb-2 text-white">1. Secure Core</h4>
                    <p className="text-xs text-text-secondary mb-4">Your Private API Keys</p>
                    <div className="h-1 w-full bg-gray-700 rounded-full overflow-hidden">
                        <div className={`h-full bg-accent transition-all duration-1000 ${activePath === 1 ? 'w-full animate-pulse-glow' : 'w-0'}`}></div>
                    </div>
                    <div className="mt-4 text-xs font-mono text-accent">
                        {activePath === 1 ? '● ACTIVE PIPELINE' : '○ STANDBY'}
                    </div>
                </div>

                {/* Node 2: System Pool (Visual Only - implied fallback) */}
                <div className={`
                    relative p-6 rounded-xl border transition-all duration-500
                    bg-white/5 border-white/5 opacity-40
                `}>
                    <h4 className="font-bold text-lg mb-2 text-white">2. System Grid</h4>
                    <p className="text-xs text-text-secondary mb-4">Shared High-Speed Pool</p>
                    <div className="h-1 w-full bg-gray-700 rounded-full overflow-hidden">
                        <div className="h-full bg-blue-500 w-0"></div>
                    </div>
                    <div className="mt-4 text-xs font-mono text-gray-500">
                        ○ BYPASSED
                    </div>
                </div>

                {/* Node 3: Beast Mode */}
                <div className={`
                    relative p-6 rounded-xl border transition-all duration-500
                    ${activePath === 3
                        ? 'bg-green-500/10 border-green-400 shadow-[0_0_30px_rgba(74,222,128,0.2)]'
                        : 'bg-white/5 border-white/5 opacity-50 grayscale'}
                `}>
                    <div className="absolute top-2 right-2">
                        {activePath === 3 && (
                            <span className="flex h-3 w-3">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-3 w-3 bg-green-400"></span>
                            </span>
                        )}
                    </div>
                    <h4 className="font-bold text-lg mb-2 text-white">3. beast_mode™</h4>
                    <p className="text-xs text-text-secondary mb-4">Unlimited Free Fallback</p>
                    <div className="h-1 w-full bg-gray-700 rounded-full overflow-hidden">
                        <div className={`h-full bg-green-400 transition-all duration-1000 ${activePath === 3 ? 'w-full animate-pulse-glow' : 'w-0'}`}></div>
                    </div>
                    <div className="mt-4 text-xs font-mono text-green-400">
                        {activePath === 3 ? '● DATA FLOWING' : '○ STANDBY'}
                    </div>
                </div>
            </div>

            {/* Connecting Lines (CSS Visuals) */}
            <div className="hidden md:block absolute top-1/2 left-0 w-full h-px border-t border-dashed border-white/20 -z-0"></div>
        </div>
    );
};

export default SmartEngineVisual;
