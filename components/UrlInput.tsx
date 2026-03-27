
import React from 'react';
import type { AppSessionData, Session } from '../types';
import { ArticleLimitInfo } from '../services/limitService';

interface UrlInputProps {
    session: Session | null;
    appData: AppSessionData;
    onAppDataChange: React.Dispatch<React.SetStateAction<AppSessionData>>;
    onInputChange: (val: string) => void;
    onWpConfigChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void;
    onAmazonConfigChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void;
    onAiConfigChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    onGenerate: () => void;
    onSaveConfig: () => void;
    onClearConfig: () => void;
    saveStatus: string;
    error: string | null;
    onBack: () => void;
    onBack: () => void;
    isGenerationDisabled: boolean;
    limitInfo?: ArticleLimitInfo | null;
}


const Tooltip: React.FC<{ text: string }> = ({ text }) => (
    <span className="group relative ml-2 inline-block align-middle">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-text-secondary cursor-pointer hover:text-accent" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
        </svg>
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 p-3 bg-card-bg border border-border-color text-text-secondary text-xs rounded-lg shadow-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 backdrop-blur-md">
            {text}
        </div>
    </span>
);

const PlanBadge: React.FC<{ limitInfo: ArticleLimitInfo | null }> = ({ limitInfo }) => {
    if (!limitInfo) return null;

    let label = 'Plan: Free';
    let color = 'bg-gray-100 text-gray-800 border-gray-200';
    let detail = '';

    if (limitInfo.tier === 'pro' || limitInfo.tier === 'premium' || limitInfo.limit === -1) {
        label = 'Plan: PRO Unlimited';
        color = 'bg-purple-900/40 text-purple-200 border-purple-500/50';
    } else {
        // Free
        if (limitInfo.remaining > 0) {
            label = 'Plan: Free Trial';
            detail = `${limitInfo.remaining}/${limitInfo.limit} High-Speed Articles`;
            color = 'bg-blue-900/40 text-blue-200 border-blue-500/50';
        } else {
            label = 'Plan: Free Forever (Beast Mode)';
            detail = 'Unlimited Keyless Generation';
            color = 'bg-green-900/40 text-green-200 border-green-500/50';
        }
    }

    return (
        <div className={`flex flex-col items-end px-3 py-1 rounded-lg border text-xs font-medium mb-4 self-end ${color}`}>
            <span>{label}</span>
            {detail && <span className="opacity-75 text-[10px]">{detail}</span>}
        </div>
    );
};

interface ApiKeyInputProps {
    id: keyof AppSessionData['aiConfig'] | keyof AppSessionData['wordpressConfig'] | keyof AppSessionData['amazonConfig'];
    label: string;
    value: string;
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    tooltip: string;
    isPassword?: boolean;
    placeholder?: string;
}

const ApiKeyInput: React.FC<ApiKeyInputProps> = ({ id, label, value, onChange, tooltip, isPassword = true, placeholder }) => (
    <div>
        <label htmlFor={id} className="flex items-center text-xs font-medium text-text-secondary mb-2">
            {label} <Tooltip text={tooltip} />
        </label>
        <input
            id={id}
            name={id}
            type={isPassword ? "password" : "text"}
            value={value}
            onChange={onChange}
            placeholder={placeholder || `Enter your ${label}`}
            className="w-full app-input !py-3 !text-sm font-mono"
            aria-label={label}
        />
    </div>
);


const UrlInput: React.FC<UrlInputProps> = React.memo(({ session, appData, onAppDataChange, onInputChange, onWpConfigChange, onAmazonConfigChange, onAiConfigChange, onGenerate, onSaveConfig, onClearConfig, saveStatus, error, onBack, isGenerationDisabled, limitInfo }) => {
    const { inputVal, inputType, selectedBlueprint, wordpressConfig: wpConfig, amazonConfig, aiConfig } = appData;
    const [isSubmitting, setIsSubmitting] = React.useState(false);

    // Reset submitting state if error appears or if generation disabled status changes (e.g. completes)
    React.useEffect(() => {
        if (error || !isGenerationDisabled) {
            setIsSubmitting(false);
        }
    }, [error, isGenerationDisabled]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (isSubmitting) return;

        setIsSubmitting(true);
        onGenerate();
    };

    // Reset inputType to 'url' if it is 'asin' as that mode is removed
    React.useEffect(() => {
        if (inputType === 'asin') {
            onAppDataChange(prev => ({ ...prev, inputType: 'url' }));
        }
    }, [inputType, onAppDataChange]);

    const blueprintConfig = {
        recipe: {
            title: "Generate a Recipe / Guide",
            subtitle: "Provide a recipe URL to transform existing content, or enter a keyword to invent a brand new recipe.",
            placeholder: "e.g., URL to a recipe or topic 'Keto chocolate cake'",
        },
        roundup: {
            title: "Generate a URL Link Replicator",
            subtitle: "Provide an article URL to rebuild it with your SEO structure and publishing style.",
            placeholder: "e.g., https://example.com/best-air-fryers",
        },
        review: {
            title: "Generate an Amazon Multi-ASIN Master Post",
            subtitle: "Provide multiple Amazon ASINs separated by commas to build a full comparison article with product cards and CTA blocks.",
            placeholder: "e.g., B0D5CXXXXX, B0CNYXXXXX, B0BPSXXXXX",
        },
        howto: {
            title: "Generate a How-To Guide",
            subtitle: "Provide a URL to an existing tutorial, or describe a task to generate a new guide.",
            placeholder: "e.g., URL to 'how to make cold brew' or 'How to build a PC'",
        }
    };

    const currentConfig = blueprintConfig[selectedBlueprint] || blueprintConfig.recipe;
    const isError = saveStatus.toLowerCase().startsWith('error');

    const hasApiKey = !!aiConfig.geminiApiKey;
    const shouldDisableGenerate = !inputVal.trim() || (isGenerationDisabled && !hasApiKey) || isSubmitting;

    return (
        <div className="text-center p-4 sm:p-6 md:p-10 bg-card-bg rounded-2xl shadow-2xl border border-border-color backdrop-blur-xl max-w-4xl mx-auto w-full transition-all duration-300">
            <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-black text-text-headings mb-4 tracking-tight">
                {currentConfig.title.split(' ').slice(0, -1).join(' ')} <span className="chameleon-text">{currentConfig.title.split(' ').slice(-1)[0]}</span>
            </h2>
            <p className="text-text-secondary mb-8 md:mb-10 text-sm sm:text-base md:text-lg max-w-2xl mx-auto leading-relaxed px-2">
                {currentConfig.subtitle}
            </p>

            {/* Input Type Selector */}
            <div className="mb-8 max-w-2xl mx-auto">
                <div className="flex flex-col sm:flex-row gap-3 justify-center items-stretch">
                    <label className="flex items-center justify-center gap-3 px-6 py-4 rounded-xl border-2 cursor-pointer transition-all duration-300 flex-1 bg-gradient-to-br from-purple-500/10 to-blue-500/10 border-purple-500/30 hover:border-purple-400/60 hover:shadow-lg hover:shadow-purple-500/20">
                        <input
                            type="radio"
                            name="inputType"
                            value="url"
                            checked={inputType === 'url'}
                            onChange={(e) => onAppDataChange(prev => ({ ...prev, inputType: e.target.value as any }))}
                            className="w-5 h-5 text-purple-500 focus:ring-purple-500 focus:ring-2 accent-purple-500"
                            style={{ accentColor: '#a855f7' }}
                        />
                        <div className="flex items-center gap-2">
                            <svg className="w-5 h-5 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                            </svg>
                            <span className="font-semibold text-text-primary">URL</span>
                        </div>
                    </label>

                    <label className="flex items-center justify-center gap-3 px-6 py-4 rounded-xl border-2 cursor-pointer transition-all duration-300 flex-1 bg-gradient-to-br from-blue-500/10 to-cyan-500/10 border-blue-500/30 hover:border-blue-400/60 hover:shadow-lg hover:shadow-blue-500/20">
                        <input
                            type="radio"
                            name="inputType"
                            value="url" // Forcibly keep separate radio value but app treats as URL
                            checked={inputType === 'keyword'}
                            onChange={(e) => onAppDataChange(prev => ({ ...prev, inputType: 'keyword' }))}
                            className="w-5 h-5 text-blue-500 focus:ring-blue-500 focus:ring-2 accent-blue-500"
                            style={{ accentColor: '#3b82f6' }}
                        />
                        <div className="flex items-center gap-2">
                            <svg className="w-5 h-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                            </svg>
                            <span className="font-semibold text-text-primary">Keyword</span>
                        </div>
                    </label>


                </div>


            </div>

            <PlanBadge limitInfo={limitInfo || null} />

            <form onSubmit={handleSubmit} className="space-y-8">

                <div className="flex flex-col md:flex-row gap-4">
                    <label htmlFor="topic-input" className="sr-only">{currentConfig.placeholder}</label>
                    <input
                        type="text"
                        id="topic-input"
                        name="topic-input"
                        value={inputVal}
                        onChange={(e) => onInputChange(e.target.value)}
                        disabled={isSubmitting}
                        placeholder={
                            inputType === 'url'
                                ? currentConfig.placeholder
                                : inputType === 'keyword'
                                    ? (selectedBlueprint === 'review'
                                        ? "e.g., B0D5CXXXXX, B0CNYXXXXX, B0BPSXXXXX"
                                        : "e.g., 'Best Gaming Laptops 2025' or 'Keto chocolate cake'")
                                    : "e.g., amazon.com/dp/B0..."
                        }
                        className="flex-grow px-5 py-4 text-base app-input shadow-lg bg-background/60 border-white/10 focus:border-accent/50 w-full disabled:opacity-50"
                        aria-label="Content Topic or URL"
                        required
                    />
                    <button
                        type="submit"
                        className="cta-button text-base font-bold px-8 py-4 whitespace-nowrap shadow-lg shadow-cta/20 w-full md:w-auto disabled:opacity-70 disabled:cursor-not-allowed transition-all"
                        disabled={shouldDisableGenerate}
                    >
                        {isSubmitting ? 'Starting...' : (isGenerationDisabled && !hasApiKey ? 'On Cooldown...' : 'Generate Post')}
                    </button>
                </div>

                {error && (
                    <div className="bg-red-500/10 border border-red-500/50 text-red-200 p-4 rounded-xl text-center animate-shake">
                        <p className="font-bold mb-1">⚠️ Unable to Generate</p>
                        <p className="text-sm">{error}</p>
                    </div>
                )}

                <button type="button" onClick={onBack} className="text-sm font-medium text-text-secondary hover:text-accent transition-colors flex items-center justify-center gap-2 mx-auto">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
                    Change Blueprint
                </button>

                <div className="border-t border-border-color pt-8">
                    <details className="group">
                        <summary className="cursor-pointer font-medium text-text-secondary hover:text-accent transition-colors text-sm flex items-center justify-center gap-2 select-none p-2 rounded-lg hover:bg-white/5">
                            <span>API Configuration & Settings</span>
                            <svg className="w-4 h-4 transition-transform group-open:rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                        </summary>
                        <div className="mt-6 text-left space-y-4 max-w-3xl mx-auto bg-background/30 p-4 md:p-6 rounded-xl border border-border-color">
                            {/* --- Text Generation --- */}
                            <details className="config-section" open>
                                <summary>Text Generation &amp; Input</summary>
                                <div className="details-content space-y-4">
                                    <p className="text-sm text-text-secondary mb-2">
                                        Configure your primary AI for text generation. A Gemini key is required.
                                    </p>
                                    <p className="text-sm text-text-secondary mb-2">
                                        Configure your primary AI for text generation. (Optional for Free Beast Mode).
                                    </p>
                                    <ApiKeyInput id="geminiApiKey" label="Gemini API Key (Primary)" value={aiConfig.geminiApiKey} onChange={onAiConfigChange} tooltip="Optional. Leave empty to use Free Forever Beast Mode (Pollinations)." />
                                </div>
                            </details>

                            {/* --- Image Generation --- */}
                            <details className="config-section">
                                <summary>Image Generation</summary>
                                <div className="details-content space-y-4">
                                    <p className="text-sm text-text-secondary mb-3">
                                        Choose a service for generated hero and step-by-step images.
                                    </p>
                                    <div className="flex flex-col gap-3">
                                        <label className="flex items-center p-3 sm:p-4 rounded-lg border border-border-color bg-background/40 cursor-pointer hover:border-accent/50 transition-colors w-full">
                                            <input id="image-provider-free" name="imageProvider" type="radio" value="free_tier" checked={aiConfig.imageProvider === 'free_tier'} onChange={onAiConfigChange} className="text-accent focus:ring-accent w-4 h-4 flex-shrink-0" />
                                            <span className="ml-3 text-sm font-medium text-text-primary">Free Tier (Multi-Provider)</span>
                                        </label>
                                        <label className="flex items-center p-3 sm:p-4 rounded-lg border border-border-color bg-background/40 cursor-pointer hover:border-accent/50 transition-colors w-full">
                                            <input id="image-provider-gemini" name="imageProvider" type="radio" value="gemini" checked={aiConfig.imageProvider === 'gemini'} onChange={onAiConfigChange} className="text-accent focus:ring-accent w-4 h-4 flex-shrink-0" />
                                            <span className="ml-3 text-sm font-medium text-text-primary">Maximum Quality (Gemini)</span>
                                        </label>
                                        <label className="flex items-center p-3 sm:p-4 rounded-lg border border-border-color bg-background/40 cursor-pointer hover:border-accent/50 transition-colors w-full">
                                            <input id="image-provider-deepai" name="imageProvider" type="radio" value="deepai" checked={aiConfig.imageProvider === 'deepai'} onChange={onAiConfigChange} className="text-accent focus:ring-accent w-4 h-4 flex-shrink-0" />
                                            <span className="ml-3 text-sm font-medium text-text-primary">DeepAI (Standard)</span>
                                        </label>
                                    </div>

                                    {aiConfig.imageProvider === 'free_tier' && (
                                        <div className="text-xs text-text-secondary mt-2 p-3 bg-blue-900/20 rounded border border-blue-500/20">
                                            <strong>Info:</strong> Intelligently routes to high-quality open services. Add optional keys below to unlock specific premium providers.
                                        </div>
                                    )}

                                    {aiConfig.imageProvider === 'gemini' && (
                                        <div className="text-xs text-text-secondary mt-2 p-3 bg-purple-900/20 rounded border border-purple-500/20">
                                            Uses your Gemini API key. Ensure it is set in the "Text Generation" section.
                                        </div>
                                    )}

                                    {aiConfig.imageProvider === 'deepai' && (
                                        <div className="mt-4">
                                            <ApiKeyInput id="deepaiApiKey" label="DeepAI API Key" value={aiConfig.deepaiApiKey || ''} onChange={onAiConfigChange} tooltip="Your DeepAI API key." />
                                        </div>
                                    )}

                                    {aiConfig.imageProvider === 'free_tier' && (
                                        <details className="mt-4 border border-border-color rounded-lg bg-background/30">
                                            <summary className="p-3 text-xs font-medium text-text-secondary uppercase tracking-wider cursor-pointer hover:text-text-primary">Advanced: Add Your Own API Keys</summary>
                                            <div className="p-4 border-t border-border-color grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                <ApiKeyInput id="stabilityApiKey" label="Stability AI Key" value={aiConfig.stabilityApiKey || ''} onChange={onAiConfigChange} tooltip="Stability AI Platform key." />
                                                <ApiKeyInput id="picsartApiKey" label="Picsart API Key" value={aiConfig.picsartApiKey || ''} onChange={onAiConfigChange} tooltip="Picsart GenAI API key." />
                                                <ApiKeyInput id="clipdropApiKey" label="ClipDrop API Key" value={aiConfig.clipdropApiKey || ''} onChange={onAiConfigChange} tooltip="ClipDrop (Jasper) API key." />
                                                <ApiKeyInput id="replicateApiKey" label="Replicate Token" value={aiConfig.replicateApiKey || ''} onChange={onAiConfigChange} tooltip="Replicate API token." />
                                                <ApiKeyInput id="getimgApiKey" label="Getimg.ai Key" value={aiConfig.getimgApiKey || ''} onChange={onAiConfigChange} tooltip="Getimg.ai API key." />
                                                <ApiKeyInput id="falApiKey" label="Fal.ai Key" value={aiConfig.falApiKey || ''} onChange={onAiConfigChange} tooltip="Fal.ai API Key." />
                                                <ApiKeyInput id="leonardoApiKey" label="Leonardo.Ai Key" value={aiConfig.leonardoApiKey || ''} onChange={onAiConfigChange} tooltip="Leonardo.ai API key." />
                                                <ApiKeyInput id="prodiaApiKey" label="Prodia Key" value={aiConfig.prodiaApiKey || ''} onChange={onAiConfigChange} tooltip="Prodia API key." />
                                                <ApiKeyInput id="segmindApiKey" label="Segmind Key" value={aiConfig.segmindApiKey || ''} onChange={onAiConfigChange} tooltip="Segmind API key." />
                                                <ApiKeyInput id="stablediffusionapiApiKey" label="StableDiffusionAPI Key" value={aiConfig.stablediffusionapiApiKey || ''} onChange={onAiConfigChange} tooltip="StableDiffusionAPI.com key." />
                                                <ApiKeyInput id="monsterApiToken" label="Monster API Token" value={aiConfig.monsterApiToken || ''} onChange={onAiConfigChange} tooltip="Monster API Bearer token." />
                                                <ApiKeyInput id="evokeApiKey" label="Evoke Key" value={aiConfig.evokeApiKey || ''} onChange={onAiConfigChange} tooltip="Evoke App API key." />
                                                <ApiKeyInput id="starryaiApiKey" label="StarryAI Key" value={aiConfig.starryaiApiKey || ''} onChange={onAiConfigChange} tooltip="StarryAI API key." />
                                                <ApiKeyInput id="huggingFaceApiKey" label="Hugging Face Token" value={aiConfig.huggingFaceApiKey || ''} onChange={onAiConfigChange} tooltip="HF Access Token." />
                                                <ApiKeyInput id="cloudflareAccountId" label="Cloudflare Account ID" value={aiConfig.cloudflareAccountId || ''} onChange={onAiConfigChange} tooltip="Your Cloudflare Account ID for Workers AI." isPassword={false} />
                                                <ApiKeyInput id="cloudflareApiToken" label="Cloudflare API Token" value={aiConfig.cloudflareApiToken || ''} onChange={onAiConfigChange} tooltip="Cloudflare API Token with Workers AI permissions." />
                                                <ApiKeyInput id="aiHordeApiKey" label="AI Horde Key" value={aiConfig.aiHordeApiKey || ''} onChange={onAiConfigChange} tooltip="AI Horde API key (optional)." placeholder="0000000000" />
                                                <ApiKeyInput id="groqApiKey" label="Groq API Key" value={aiConfig.groqApiKey || ''} onChange={onAiConfigChange} tooltip="Groq API key for lightning-fast text fallback." />
                                                <ApiKeyInput id="cerebrasApiKey" label="Cerebras Key" value={aiConfig.cerebrasApiKey || ''} onChange={onAiConfigChange} tooltip="Cerebras API key for high-speed Llama models." />
                                                <ApiKeyInput id="openRouterApiKey" label="OpenRouter Key" value={aiConfig.openRouterApiKey || ''} onChange={onAiConfigChange} tooltip="OpenRouter API key for access to various models." />
                                                <ApiKeyInput id="infipApiKey" label="Infip.pro Key" value={aiConfig.infipApiKey || ''} onChange={onAiConfigChange} tooltip="Infip.pro API Key for high-speed Stable Diffusion XL generation." />
                                                <ApiKeyInput id="togetherApiKey" label="Together AI Key" value={aiConfig.togetherApiKey || ''} onChange={onAiConfigChange} tooltip="Together AI API Key for high-speed open models." />
                                                <ApiKeyInput id="mistralApiKey" label="Mistral API Key" value={aiConfig.mistralApiKey || ''} onChange={onAiConfigChange} tooltip="Mistral AI API Key for official Mistral models." />
                                                <ApiKeyInput id="siliconFlowApiKey" label="SiliconFlow Key" value={aiConfig.siliconFlowApiKey || ''} onChange={onAiConfigChange} tooltip="SiliconFlow API Key for Giant Chinese Models (Qwen/DeepSeek)." />

                                            </div>
                                        </details>
                                    )}
                                </div>
                            </details>

                            {/* --- Product Image Source --- */}
                            <details className="config-section">
                                <summary>Product Images</summary>
                                <div className="details-content space-y-4">
                                    <p className="text-sm text-text-secondary mb-3">
                                        Source for "Product Spotlight" images.
                                    </p>
                                    <div className="flex flex-col gap-3">
                                        <label className="flex items-center p-3 sm:p-4 rounded-lg border border-border-color bg-background/40 cursor-pointer hover:border-accent/50 transition-colors w-full">
                                            <input id="product-image-source-ai" name="productImageSource" type="radio" value="ai" checked={aiConfig.productImageSource === 'ai'} onChange={onAiConfigChange} className="text-accent focus:ring-accent w-4 h-4 flex-shrink-0" />
                                            <span className="ml-3 text-sm font-medium text-text-primary">AI Generated (E-commerce Style)</span>
                                        </label>
                                        <label className="flex items-center p-3 sm:p-4 rounded-lg border border-border-color bg-background/40 cursor-pointer hover:border-accent/50 transition-colors w-full">
                                            <input id="product-image-source-amazon" name="productImageSource" type="radio" value="amazon" checked={aiConfig.productImageSource === 'amazon'} onChange={onAiConfigChange} className="text-accent focus:ring-accent w-4 h-4 flex-shrink-0" />
                                            <span className="ml-3 text-sm font-medium text-text-primary">Amazon Product API (Official)</span>
                                        </label>
                                    </div>
                                </div>
                            </details>

                            {/* --- Amazon --- */}
                            <details className="config-section">
                                <summary>Amazon Associates</summary>
                                <div className="details-content space-y-4">
                                    <p className="text-sm text-text-secondary mb-4">
                                        Required for monetization. The Associate Tag creates your affiliate links. PAAPI keys are needed only if using "Amazon Product API" for images.
                                    </p>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <ApiKeyInput id="associateTag" label="Associate Tag (StoreID)" value={amazonConfig.associateTag} onChange={onAmazonConfigChange} placeholder="tag-20" tooltip="Your Amazon Associates tracking ID." />
                                        <div className="md:col-span-2 border-t border-border-color pt-4 mt-2">
                                            <p className="text-xs text-text-secondary mb-3 font-semibold">Optional: Product Advertising API (PAAPI)</p>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                <ApiKeyInput id="accessKey" label="PAAPI Access Key" value={amazonConfig.accessKey} onChange={onAmazonConfigChange} tooltip="Access Key ID." />
                                                <ApiKeyInput id="secretKey" label="PAAPI Secret Key" value={amazonConfig.secretKey} onChange={onAmazonConfigChange} isPassword={true} tooltip="Secret Access Key." />
                                            </div>
                                        </div>
                                    </div>
                                    <div>
                                        <label htmlFor="region" className="block text-xs font-medium text-text-secondary mb-2">PAAPI Region</label>
                                        <select
                                            id="region"
                                            name="region"
                                            value={amazonConfig.region}
                                            onChange={onAmazonConfigChange}
                                            className="w-full app-input !py-3 !text-sm"
                                        >
                                            <option value="us-east-1">United States (us-east-1)</option>
                                            <option value="eu-west-1">United Kingdom (eu-west-1)</option>
                                        </select>
                                    </div>
                                </div>
                            </details>

                            {/* --- WordPress --- */}
                            <details className="config-section">
                                <summary>WordPress Publishing</summary>
                                <div className="details-content space-y-4">
                                    <p className="text-sm text-text-secondary mb-4">
                                        Publish directly to your site. Requires an <a href="https://wordpress.org/documentation/article/application-passwords/" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">Application Password</a>.
                                    </p>
                                    <div className="grid grid-cols-1 gap-4">
                                        <ApiKeyInput id="url" label="WordPress Site URL" value={wpConfig.url} onChange={onWpConfigChange} placeholder="https://yourblog.com" tooltip="Full URL of your WordPress site." />
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <ApiKeyInput id="username" label="Admin Username" value={wpConfig.username} onChange={onWpConfigChange} placeholder="admin" tooltip="Your WordPress username." />
                                            <ApiKeyInput id="password" label="Application Password" value={wpConfig.password} onChange={onWpConfigChange} tooltip="Generated Application Password (not your login password)." />
                                        </div>
                                        <div>
                                            <label htmlFor="featuredImageHandling" className="flex items-center text-xs font-medium text-text-secondary mb-2">
                                                Featured Image Handling <Tooltip text="Control how the featured image is displayed in your theme." />
                                            </label>
                                            <select
                                                id="featuredImageHandling"
                                                name="featuredImageHandling"
                                                value={wpConfig.featuredImageHandling || 'theme_default'}
                                                onChange={onWpConfigChange}
                                                className="w-full app-input !py-3 !text-sm"
                                            >
                                                <option value="theme_default">Theme Default (Recommended)</option>
                                                <option value="skip_featured">Skip Featured Image (Manual)</option>
                                                <option value="gutenberg_cover">Force Gutenberg Cover Block</option>
                                            </select>
                                            <p className="text-[10px] text-text-secondary mt-1.5 leading-relaxed">
                                                <strong>Theme Default:</strong> Sets standard WordPress featured image. Most themes handle this automatically.<br />
                                                <strong>Skip:</strong> No featured image set. Good if you want to place it manually.<br />
                                                <strong>Force Cover:</strong> Adds a full-width cover block at the top of content. Use if your theme doesn't show featured images.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </details>

                            <div className="flex flex-col sm:flex-row gap-4 mt-6 pt-4 border-t border-border-color">
                                <button
                                    type="button"
                                    onClick={onSaveConfig}
                                    className="flex-1 secondary-button text-sm bg-accent/10 border-accent/30 text-accent hover:bg-accent hover:text-white py-3 w-full"
                                >
                                    Save Configuration
                                </button>
                                <button
                                    type="button"
                                    onClick={onClearConfig}
                                    className="flex-1 secondary-button text-sm hover:text-red-300 hover:border-red-500/50 py-3 w-full"
                                >
                                    Clear Config
                                </button>
                            </div>
                            {saveStatus && <p className={`text-sm text-center font-medium mt-3 ${isError ? 'text-red-400' : 'text-green-400 animate-pulse'}`}>{saveStatus}</p>}
                        </div>
                    </details>
                </div>
            </form>
        </div >
    );
});

export default UrlInput;
