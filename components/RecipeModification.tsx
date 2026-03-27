
import React from 'react';
import LoadingSpinner from './LoadingSpinner';

interface RecipeModificationProps {
    prompt: string;
    onPromptChange: (value: string) => void;
    onModify: () => void;
    onRevert: () => void;
    isModifying: boolean;
    hasOriginalData: boolean;
}

const RecipeModification: React.FC<RecipeModificationProps> = ({
    prompt,
    onPromptChange,
    onModify,
    onRevert,
    isModifying,
    hasOriginalData
}) => {
    
    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            onModify();
        }
    };

    return (
        <div className="p-6 bg-card-bg rounded-xl shadow-2xl border border-border-color">
            <h2 className="text-xl font-bold font-heading text-text-headings mb-3 border-b border-border-color pb-3">
                AI Recipe Editor
            </h2>
             <p className="text-sm text-text-secondary mb-4">
                Need to make a change? Just tell the AI what you want. It will intelligently update the ingredients, instructions, and post content for you.
            </p>

            {isModifying ? (
                <div className="flex flex-col items-center justify-center space-y-3 p-6 bg-blue-900/30 rounded-lg">
                    <LoadingSpinner />
                    <p className="text-sm font-medium text-blue-300 animate-pulse">
                        Applying modification...
                    </p>
                </div>
            ) : (
                <div className="space-y-4">
                    <label htmlFor="modification-prompt" className="sr-only">Enter a recipe modification request</label>
                    <textarea
                        id="modification-prompt"
                        name="modification-prompt"
                        value={prompt}
                        onChange={(e) => onPromptChange(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="e.g., Make this recipe gluten-free and double the servings."
                        className="w-full px-3 py-2 text-sm app-input h-24 resize-none"
                        aria-label="Recipe modification request"
                    />
                    <div className="flex flex-col sm:flex-row gap-3">
                         <button
                            onClick={onModify}
                            disabled={!prompt.trim()}
                            className="flex-1 cta-button"
                        >
                            Apply Modification
                        </button>
                        {hasOriginalData && (
                            <button
                                onClick={onRevert}
                                className="flex-1 secondary-button"
                            >
                                Revert to Original
                            </button>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default RecipeModification;