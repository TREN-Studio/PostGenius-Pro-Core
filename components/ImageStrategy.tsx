
import React, { useMemo } from 'react';
import type { BlogPostData } from '../types';

interface ImageStrategyProps {
  blogPostData: BlogPostData;
  imageSelection: Record<string, boolean>;
  onSelectionChange: (key: string, isSelected: boolean) => void;
  onGenerate: () => void;
}

const Checkbox: React.FC<{ id: string; label: string; checked: boolean; onChange: (checked: boolean) => void; }> = ({ id, label, checked, onChange }) => (
    <div className="relative flex items-start">
        <div className="flex h-6 items-center">
            <input
                id={id}
                name={id}
                type="checkbox"
                checked={checked}
                onChange={(e) => onChange(e.target.checked)}
                className="h-4 w-4 rounded border-gray-600 text-accent-start bg-transparent focus:ring-accent-start focus:ring-offset-background"
            />
        </div>
        <div className="ml-3 text-sm leading-6">
            <label htmlFor={id} className="font-medium text-gray-200">{label}</label>
        </div>
    </div>
);


const ImageStrategy: React.FC<ImageStrategyProps> = ({ blogPostData, imageSelection, onSelectionChange, onGenerate }) => {
    
    const totalSelected = useMemo(() => {
        return Object.values(imageSelection).filter(Boolean).length;
    }, [imageSelection]);

    const handleSelectAll = (select: boolean) => {
        Object.keys(imageSelection).forEach(key => {
            onSelectionChange(key, select);
        });
    };

    return (
        <div className="max-w-4xl mx-auto p-8 bg-card-bg rounded-xl shadow-2xl border border-border-color backdrop-blur-sm">
            <h2 className="text-2xl font-heading text-white mb-2">Image Generation Strategy</h2>
            <p className="text-gray-400 mb-6">
                Select which artistic recipe images you want to generate. Product images are generated automatically and can be reviewed in the next step.
            </p>

            <div className="space-y-8">
                <div>
                    <h3 className="text-lg font-bold font-heading text-accent border-b border-border-color pb-2 mb-4">Images</h3>
                    <div className="space-y-3">
                       <Checkbox
                          id="hero"
                          label="Hero Image"
                          checked={!!imageSelection['hero']}
                          onChange={(checked) => onSelectionChange('hero', checked)}
                       />
                       {blogPostData.steps?.map((step, i) => (
                           <Checkbox
                                key={`step_${i}`}
                                id={`step_${i}`}
                                label={`Step ${i+1} Image`}
                                checked={!!imageSelection[`step_${i}`]}
                                onChange={(checked) => onSelectionChange(`step_${i}`, checked)}
                             />
                       ))}
                    </div>
                </div>
            </div>

            <div className="mt-8 pt-6 border-t border-border-color">
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div className="flex gap-4">
                        <button onClick={() => handleSelectAll(true)} className="text-sm font-medium text-accent hover:text-white transition-colors">Select All</button>
                        <button onClick={() => handleSelectAll(false)} className="text-sm font-medium text-accent hover:text-white transition-colors">Deselect All</button>
                    </div>
                    <button
                        onClick={onGenerate}
                        disabled={totalSelected === 0}
                        className="w-full sm:w-auto cta-button transform hover:scale-105 disabled:bg-gray-600 disabled:cursor-not-allowed"
                    >
                        Generate {totalSelected} Selected Image{totalSelected !== 1 ? 's' : ''}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ImageStrategy;
