import React from 'react';
import type { ScoreFeedback } from '../types';
import LoadingSpinner from './LoadingSpinner';

interface ContentScorePanelProps {
    score: number | null;
    feedback: ScoreFeedback[];
    isScoring: boolean;
    onAnalyze: () => void;
}

const ScoreCircle: React.FC<{ score: number | null }> = ({ score }) => {
    const getScoreColor = (s: number | null) => {
        if (s === null) return 'var(--color-border)';
        if (s < 40) return '#EF4444'; // Red
        if (s < 75) return '#FBBF24'; // Yellow
        return '#22C55E'; // Green
    };

    const color = getScoreColor(score);
    const circumference = 2 * Math.PI * 45; // r = 45
    const offset = score !== null ? circumference - (score / 100) * circumference : circumference;

    return (
        <div className="relative w-32 h-32">
            <svg className="w-full h-full" viewBox="0 0 100 100">
                {/* Background circle */}
                <circle
                    className="text-background"
                    strokeWidth="10"
                    stroke="currentColor"
                    fill="transparent"
                    r="45"
                    cx="50"
                    cy="50"
                />
                {/* Progress circle */}
                <circle
                    className="transition-all duration-1000 ease-out"
                    strokeWidth="10"
                    strokeDasharray={circumference}
                    strokeDashoffset={offset}
                    strokeLinecap="round"
                    stroke={color}
                    fill="transparent"
                    r="45"
                    cx="50"
                    cy="50"
                    transform="rotate(-90 50 50)"
                />
            </svg>
            <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-3xl font-bold" style={{ color }}>
                {score ?? '?'}
            </span>
        </div>
    );
};

const FeedbackItem: React.FC<{ item: ScoreFeedback }> = ({ item }) => {
    const priorityStyles = {
        Critical: { icon: '🔴', textColor: 'text-red-400' },
        Major: { icon: '🟡', textColor: 'text-yellow-400' },
        Minor: { icon: '🟢', textColor: 'text-green-400' },
    };
    
    const { icon, textColor } = priorityStyles[item.priority];

    return (
        <div className="flex items-start gap-3 py-2">
            <span className="text-lg mt-px">{icon}</span>
            <div>
                <p className={`font-semibold text-sm ${textColor}`}>{item.priority} Issue</p>
                <p className={`text-xs ${item.priority === 'Critical' ? 'text-red-400' : 'text-text-secondary'}`}>{item.suggestion}</p>
            </div>
        </div>
    );
};


const ContentScorePanel: React.FC<ContentScorePanelProps> = ({ score, feedback, isScoring, onAnalyze }) => {
    const groupedFeedback = feedback.reduce((acc, item) => {
        if (!acc[item.category]) {
            acc[item.category] = [];
        }
        acc[item.category].push(item);
        return acc;
    }, {} as Record<string, ScoreFeedback[]>);
    
    const categoryOrder: Array<'Structure' | 'Content' | 'Style'> = ['Structure', 'Content', 'Style'];
    
    const sortedFeedback = [...feedback].sort((a, b) => {
        const priorityOrder = { Critical: 0, Major: 1, Minor: 2 };
        return priorityOrder[a.priority] - priorityOrder[b.priority];
    });

    return (
        <div className="p-6 bg-card-bg rounded-xl shadow-2xl border border-border-color">
            <h2 className="text-xl font-bold font-heading text-text-headings mb-4 border-b border-border-color pb-3">
                Content Analysis
            </h2>
            
            <div className="flex flex-col items-center gap-4">
                {isScoring ? (
                    <div className="h-32 flex flex-col items-center justify-center">
                        <LoadingSpinner />
                        <p className="text-sm text-text-secondary mt-2 animate-pulse">Analyzing...</p>
                    </div>
                ) : (
                    <ScoreCircle score={score} />
                )}
                
                <button
                    onClick={onAnalyze}
                    disabled={isScoring}
                    className="w-full secondary-button text-sm"
                >
                    Re-Analyze Content
                </button>
            </div>

            <div className="mt-4 max-h-80 overflow-y-auto space-y-3 pr-2">
                 {feedback.length > 0 ? (
                    categoryOrder.map(category => (
                        groupedFeedback[category] && (
                            <details key={category} className="mt-2" open>
                                <summary className="font-semibold text-text-primary cursor-pointer list-none flex justify-between items-center text-base">
                                    {category}
                                    <span className="text-xs transition-transform duration-300 transform group-open:rotate-180">▼</span>
                                </summary>
                                <div className="mt-1 space-y-1 bg-background/50 rounded-lg p-2 border border-border-color divide-y divide-border-color">
                                    {groupedFeedback[category]
                                        .sort((a, b) => {
                                            const priorityOrder = { Critical: 0, Major: 1, Minor: 2 };
                                            return priorityOrder[a.priority] - priorityOrder[b.priority];
                                        })
                                        .map((item, index) => <FeedbackItem key={`${category}-${index}`} item={item} />)
                                    }
                                </div>
                            </details>
                        )
                    ))
                ) : (
                    <p className="text-sm text-text-secondary text-center p-4 mt-2">
                        {score !== null ? 'No suggestions. Looks great!' : 'Click "Re-Analyze" to get feedback.'}
                    </p>
                )}
            </div>
        </div>
    );
};

export default ContentScorePanel;