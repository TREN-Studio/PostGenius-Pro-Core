import React, { useState } from 'react';
import type { Blueprint } from '../types';

interface BlueprintCardProps {
    badge: string;
    title: string;
    description: string;
    isSelected: boolean;
    onSelect: () => void;
}

const BlueprintCard: React.FC<BlueprintCardProps> = ({ badge, title, description, isSelected, onSelect }) => {
    return (
        <button
            type="button"
            onClick={onSelect}
            aria-pressed={isSelected}
            className={`
                relative text-left p-6 md:p-7 w-full min-h-[260px] rounded-2xl transition-all duration-300
                ${isSelected
                    ? 'bg-card-bg border border-accent shadow-[0_0_32px_rgba(0,243,255,0.22)] -translate-y-1'
                    : 'bg-card-bg/90 border border-border-color hover:border-accent/50 hover:-translate-y-1'
                }
            `}
        >
            <div className="flex flex-col h-full">
                <span className="inline-flex items-center justify-center w-14 h-14 rounded-xl bg-accent/10 border border-accent/10 text-accent text-lg font-black tracking-wider mb-6">
                    {badge}
                </span>
                <h3 className="text-2xl font-black text-text-headings leading-tight">
                    {title}
                </h3>
                <p className="text-base text-text-secondary mt-3 leading-relaxed flex-grow max-w-[18rem]">
                    {description}
                </p>
            </div>
        </button>
    );
};

interface BlueprintSelectionProps {
    onSelectBlueprint: (blueprint: Blueprint) => void;
}

const blueprints: Array<{ badge: string; title: string; description: string; type: Blueprint }> = [
    {
        badge: 'RG',
        title: 'Recipe / Guide',
        description: 'From a URL or keyword.',
        type: 'recipe',
    },
    {
        badge: 'URL',
        title: 'URL Link Replicator',
        description: 'Rebuild any article URL with our SEO style.',
        type: 'roundup',
    },
    {
        badge: 'ASIN',
        title: 'Amazon Multi-ASIN Master',
        description: 'Compare multiple ASINs with pro CTA blocks.',
        type: 'review',
    },
];

const BlueprintSelection: React.FC<BlueprintSelectionProps> = ({ onSelectBlueprint }) => {
    const [selected, setSelected] = useState<Blueprint>('recipe');

    const handleSelect = (blueprint: Blueprint) => {
        setSelected(blueprint);
        setTimeout(() => onSelectBlueprint(blueprint), 180);
    };

    return (
        <div className="text-center p-6 sm:p-8 md:p-10 bg-card-bg rounded-2xl shadow-2xl border border-border-color animate-fade-in max-w-5xl mx-auto">
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-black text-text-headings mb-4 tracking-tight">
                Choose Your Blueprint
            </h2>
            <p className="text-text-secondary mb-8 md:mb-10 text-base sm:text-lg max-w-3xl mx-auto px-2 leading-relaxed">
                Select a content type to begin. Each blueprint provides a specialized workflow and AI prompt to generate the perfect post.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-5 max-w-4xl mx-auto">
                {blueprints.map((bp) => (
                    <BlueprintCard
                        key={bp.type}
                        badge={bp.badge}
                        title={bp.title}
                        description={bp.description}
                        isSelected={selected === bp.type}
                        onSelect={() => handleSelect(bp.type)}
                    />
                ))}
            </div>
        </div>
    );
};

export default BlueprintSelection;
