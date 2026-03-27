import React from 'react';
import LoadingSpinner from './LoadingSpinner';

interface StockImageResult {
    url: string;
    photographer: string;
    photographerUrl: string;
    source: 'pexels' | 'unsplash' | 'pixabay';
}

interface StockImagePickerModalProps {
    isOpen: boolean;
    onClose: () => void;
    imageKey: string;
    prompt: string;
    candidates: StockImageResult[];
    isLoading: boolean;
    onSelect: (url: string) => void;
    onGenerateAi: () => void;
}

const StockImagePickerModal: React.FC<StockImagePickerModalProps> = ({
    isOpen,
    onClose,
    prompt,
    candidates,
    isLoading,
    onSelect,
    onGenerateAi
}) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
            <div className="bg-card-bg border border-border-color rounded-xl w-full max-w-4xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">

                {/* Header */}
                <div className="p-6 border-b border-border-color flex justify-between items-center bg-secondary-bg">
                    <div>
                        <h3 className="text-xl font-heading text-white mb-1">Choose Image</h3>
                        <p className="text-sm text-text-secondary truncate max-w-md">"{prompt}"</p>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 overflow-y-auto flex-1">
                    {isLoading ? (
                        <div className="flex flex-col items-center justify-center py-20">
                            <LoadingSpinner />
                            <p className="mt-4 text-text-secondary animate-pulse">Searching global stock libraries...</p>
                        </div>
                    ) : (
                        <div className="space-y-8">

                            {/* Stock Options */}
                            {candidates.length > 0 && (
                                <div>
                                    <h4 className="text-sm font-bold text-accent uppercase tracking-wider mb-4 flex items-center gap-2">
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
                                        Real Stock Photos
                                    </h4>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                                        {candidates.map((img, idx) => (
                                            <div
                                                key={idx}
                                                onClick={() => onSelect(img.url)}
                                                className="group relative aspect-video bg-gray-900 rounded-lg overflow-hidden cursor-pointer border-2 border-transparent hover:border-accent transition-all hover:scale-[1.02]"
                                            >
                                                <img src={img.url} alt="Stock option" className="w-full h-full object-cover" />
                                                <div className="absolute bottom-0 left-0 right-0 bg-black/60 p-2 text-xs text-white opacity-0 group-hover:opacity-100 transition-opacity truncate">
                                                    by {img.photographer} ({img.source})
                                                </div>
                                                <div className="absolute inset-0 bg-accent/10 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* No Results Message */}
                            {!isLoading && candidates.length === 0 && (
                                <div className="text-center py-8 border border-dashed border-gray-700 rounded-lg">
                                    <p className="text-gray-400">No stock photos found for this step.</p>
                                </div>
                            )}

                            {/* Separator */}
                            <div className="relative flex items-center py-2">
                                <div className="flex-grow border-t border-gray-700"></div>
                                <span className="flex-shrink-0 mx-4 text-gray-500 text-xs uppercase">Or Generate</span>
                                <div className="flex-grow border-t border-gray-700"></div>
                            </div>

                            {/* AI Option */}
                            <div>
                                <h4 className="text-sm font-bold text-cyan-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
                                    AI Generation
                                </h4>
                                <button
                                    onClick={onGenerateAi}
                                    className="w-full p-4 border border-cyan-500/30 rounded-lg bg-cyan-900/10 hover:bg-cyan-900/20 hover:border-cyan-500 transition-all group flex items-center justify-center gap-3"
                                >
                                    <div className="p-2 bg-cyan-500/20 rounded-full group-hover:scale-110 transition-transform">
                                        <svg className="w-6 h-6 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.384-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"></path></svg>
                                    </div>
                                    <span className="font-medium text-cyan-100">Generate New AI Image</span>
                                </button>
                            </div>

                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default StockImagePickerModal;
