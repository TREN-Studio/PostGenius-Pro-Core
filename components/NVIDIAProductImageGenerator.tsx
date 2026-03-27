import React, { useState, useCallback, useEffect } from 'react';
import LoadingSpinner from './LoadingSpinner';

interface AIGeneratedImage {
    base64: string;
    url?: string;
    prompt: string;
    timestamp: number;
    validationStatus?: 'pending' | 'valid' | 'invalid';
    validationFeedback?: string;
    validationScore?: number;
}

interface GenerationState {
    productName: string;
    productDescription: string;
    usageContext: string;
}

interface NvidiaAdminConfig {
    nvidiaApiKey: string;
    stableDiffusionModelId: string;
    qwenVlmModelId: string;
    chatModelId: string;
    paligemmaModelId: string;
}

const NVIDIAProductImageGenerator: React.FC = () => {
    const [generationState, setGenerationState] = useState<GenerationState>({
        productName: '',
        productDescription: '',
        usageContext: '',
    });

    const [generatedImages, setGeneratedImages] = useState<AIGeneratedImage[]>([]);
    const [isGenerating, setIsGenerating] = useState(false);
    const [isValidating, setIsValidating] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [validatingImageIndex, setValidatingImageIndex] = useState<number | null>(null);
    const [pinterestAuthUrl, setPinterestAuthUrl] = useState<string | null>(null);
    const [oauthStep, setOAuthStep] = useState<'idle' | 'loading' | 'authorized'>('idle');
    const [nvidiaConfig, setNvidiaConfig] = useState<NvidiaAdminConfig>({
        nvidiaApiKey: '',
        stableDiffusionModelId: 'stable-diffusion-3-medium',
        qwenVlmModelId: 'qwen/qwen3.5-397b-a17b',
        chatModelId: 'qwen/qwen3.5-397b-a17b',
        paligemmaModelId: 'google/paligemma',
    });
    const [hasNvidiaKey, setHasNvidiaKey] = useState(false);
    const [isConfigLoading, setIsConfigLoading] = useState(true);
    const [isSavingConfig, setIsSavingConfig] = useState(false);

    const authToken = localStorage.getItem('auth_token') || '';

    useEffect(() => {
        let mounted = true;

        const loadConfig = async () => {
            setIsConfigLoading(true);
            try {
                const response = await fetch('/api/nvidia/config/', {
                    headers: {
                        'Authorization': authToken,
                    },
                });
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }

                const data = await response.json() as any;
                if (!mounted) return;

                setHasNvidiaKey(Boolean(data?.hasNvidiaKey));
                setNvidiaConfig(prev => ({
                    ...prev,
                    stableDiffusionModelId: data?.stableDiffusionModelId || prev.stableDiffusionModelId,
                    qwenVlmModelId: data?.qwenVlmModelId || prev.qwenVlmModelId,
                    chatModelId: data?.chatModelId || prev.chatModelId,
                    paligemmaModelId: data?.paligemmaModelId || prev.paligemmaModelId,
                }));
            } catch (configError) {
                console.warn('[NVIDIA] Failed to load admin config:', configError);
                if (mounted) {
                    setHasNvidiaKey(false);
                }
            } finally {
                if (mounted) setIsConfigLoading(false);
            }
        };

        loadConfig();

        return () => {
            mounted = false;
        };
    }, [authToken]);

    const handleSaveNvidiaConfig = useCallback(async () => {
        if (!hasNvidiaKey && !nvidiaConfig.nvidiaApiKey.trim()) {
            setError('Enter NVIDIA API key first time before saving.');
            return;
        }

        setIsSavingConfig(true);
        setError(null);
        setSuccess(null);

        try {
            const payload: Record<string, string> = {
                stableDiffusionModelId: nvidiaConfig.stableDiffusionModelId,
                qwenVlmModelId: nvidiaConfig.qwenVlmModelId,
                chatModelId: nvidiaConfig.chatModelId,
                paligemmaModelId: nvidiaConfig.paligemmaModelId,
            };
            if (nvidiaConfig.nvidiaApiKey.trim()) {
                payload.nvidiaApiKey = nvidiaConfig.nvidiaApiKey.trim();
            }

            const response = await fetch('/api/nvidia/config/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': authToken,
                },
                body: JSON.stringify(payload),
            });

            const data = await response.json().catch(() => ({} as any));
            if (!response.ok) {
                throw new Error(data?.error || `HTTP ${response.status}`);
            }

            setHasNvidiaKey(Boolean(data?.hasNvidiaKey));
            setNvidiaConfig(prev => ({
                ...prev,
                nvidiaApiKey: '',
                stableDiffusionModelId: data?.stableDiffusionModelId || prev.stableDiffusionModelId,
                qwenVlmModelId: data?.qwenVlmModelId || prev.qwenVlmModelId,
                chatModelId: data?.chatModelId || prev.chatModelId,
                paligemmaModelId: data?.paligemmaModelId || prev.paligemmaModelId,
            }));
            setSuccess('NVIDIA configuration saved successfully.');
            window.dispatchEvent(new Event('nvidia-config-updated'));
        } catch (saveError) {
            const message = saveError instanceof Error ? saveError.message : 'Unknown error';
            setError(`Failed to save NVIDIA configuration: ${message}`);
        } finally {
            setIsSavingConfig(false);
        }
    }, [authToken, hasNvidiaKey, nvidiaConfig]);

    // Generate images using NVIDIA Stable Diffusion 3.5
    const handleGenerateImages = useCallback(async () => {
        if (!generationState.productName || !generationState.productDescription) {
            setError('Please enter product name and description');
            return;
        }
        if (!hasNvidiaKey) {
            setError('NVIDIA API key is not configured. Save it in NVIDIA API Configuration first.');
            return;
        }

        setIsGenerating(true);
        setError(null);
        setSuccess(null);

        try {
            const response = await fetch('/api/nvidia/generate-images/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': authToken,
                },
                body: JSON.stringify({
                    productName: generationState.productName,
                    productDescription: generationState.productDescription,
                    usageContext: generationState.usageContext,
                    cfgScale: 7,
                    steps: 50,
                    enhancePrompt: true,
                    enableThinking: true,
                    negativePrompt: 'cartoon, anime, illustration, CGI render, low detail, blurry, watermark, text, logo',
                }),
            });

            if (!response.ok) {
                const errorData = await response.json() as any;
                throw new Error(errorData.error || 'Failed to generate images');
            }

            const data = await response.json() as any;

            const newImages: AIGeneratedImage[] = (data.images || []).map((img: any) => ({
                ...img,
                validationStatus: 'pending' as const,
            }));

            setGeneratedImages(newImages);
            setSuccess(`✅ Successfully generated ${newImages.length} professional lifestyle images!`);
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Unknown error';
            setError(`❌ Image generation failed: ${message}`);
            console.error('Generation error:', err);
        } finally {
            setIsGenerating(false);
        }
    }, [generationState, hasNvidiaKey]);

    // Validate a single image using NVIDIA Qwen VLM
    const handleValidateImage = useCallback(
        async (imageIndex: number) => {
            if (imageIndex >= generatedImages.length) return;

            const image = generatedImages[imageIndex];
            setValidatingImageIndex(imageIndex);
            setIsValidating(true);
            setError(null);

            try {
                const response = await fetch('/api/nvidia/validate-image/', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': authToken,
                    },
                    body: JSON.stringify({
                        imageBase64: image.base64,
                        productName: generationState.productName,
                        productDescription: generationState.productDescription,
                    }),
                });

                if (!response.ok) {
                    const errorData = await response.json() as any;
                    throw new Error(errorData.error || 'Validation failed');
                }

                const data = await response.json() as any;

                // Update the image with validation results
                const updatedImages = [...generatedImages];
                updatedImages[imageIndex] = {
                    ...updatedImages[imageIndex],
                    validationStatus: data.isValid ? 'valid' : 'invalid',
                    validationFeedback: data.feedback,
                    validationScore: Math.round(data.confidence * 100),
                };

                setGeneratedImages(updatedImages);
                setSuccess(data.feedback);
            } catch (err) {
                const message = err instanceof Error ? err.message : 'Unknown error';
                setError(`❌ Validation failed: ${message}`);
                console.error('Validation error:', err);
            } finally {
                setIsValidating(false);
                setValidatingImageIndex(null);
            }
        },
        [authToken, generatedImages, generationState],
    );

    // Initiate Pinterest OAuth flow
    const handlePinterestAuth = useCallback(async () => {
        setOAuthStep('loading');
        setError(null);

        try {
            const response = await fetch('/api/pinterest/oauth-config/');

            if (!response.ok) {
                const errorData = await response.json() as any;
                throw new Error(errorData.error || 'Failed to get OAuth config');
            }

            const data = await response.json() as any;
            setPinterestAuthUrl(data.authUrl);
            setSuccess('🔗 Redirect URL ready. Click "Connect to Pinterest" to authorize.');
            setOAuthStep('authorized');

            // Open Pinterest OAuth in new window
            if (data.authUrl) {
                window.open(data.authUrl, 'pinterest_auth', 'width=600,height=700');
            }
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Unknown error';
            setError(`❌ OAuth setup failed: ${message}`);
            setOAuthStep('idle');
            console.error('OAuth error:', err);
        }
    }, []);

    const validImages = generatedImages.filter((img) => img.validationStatus === 'valid');

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="border-b border-border-color pb-4">
                <h2 className="text-2xl font-bold text-text-primary flex items-center gap-2">
                    🎨 NVIDIA AI Image Generator
                </h2>
                <p className="text-text-secondary text-sm mt-1">
                    Generate and validate professional lifestyle product images using Stable Diffusion 3.5 & Qwen VLM
                </p>
            </div>

            {/* Error/Success Messages */}
            {error && (
                <div className="p-4 bg-red-900/20 border border-red-500/30 rounded-lg text-red-300 text-sm">
                    {error}
                </div>
            )}
            {success && (
                <div className="p-4 bg-green-900/20 border border-green-500/30 rounded-lg text-green-300 text-sm">
                    {success}
                </div>
            )}

            {/* Admin NVIDIA Configuration */}
            <div className="bg-background/50 border border-border-color rounded-lg p-6 space-y-4">
                <div className="flex items-center justify-between gap-4">
                    <h3 className="text-lg font-semibold text-text-primary">NVIDIA API Configuration</h3>
                    <span className={`text-xs px-3 py-1 rounded-full border ${hasNvidiaKey ? 'text-green-300 border-green-500/40 bg-green-900/20' : 'text-yellow-200 border-yellow-500/40 bg-yellow-900/20'}`}>
                        {hasNvidiaKey ? 'Key Configured' : 'Key Missing'}
                    </span>
                </div>

                <p className="text-sm text-text-secondary">
                    This section is admin-only. Leave API key empty to keep the existing saved key.
                </p>

                {isConfigLoading ? (
                    <div className="py-4 flex items-center gap-2 text-text-secondary text-sm">
                        <LoadingSpinner />
                        Loading NVIDIA config...
                    </div>
                ) : (
                    <>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="md:col-span-2">
                                <label className="block text-sm font-medium text-text-primary mb-2">NVIDIA API Key</label>
                                <input
                                    type="password"
                                    placeholder={hasNvidiaKey ? 'Configured on server (enter new key to rotate)' : 'nvapi-...'}
                                    value={nvidiaConfig.nvidiaApiKey}
                                    onChange={(e) => setNvidiaConfig(prev => ({ ...prev, nvidiaApiKey: e.target.value }))}
                                    className="w-full px-4 py-2 bg-input-bg border border-border-color rounded-lg text-text-primary placeholder-text-secondary focus:outline-none focus:border-accent font-mono"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-text-primary mb-2">Stable Diffusion Model ID</label>
                                <input
                                    type="text"
                                    value={nvidiaConfig.stableDiffusionModelId}
                                    onChange={(e) => setNvidiaConfig(prev => ({ ...prev, stableDiffusionModelId: e.target.value }))}
                                    className="w-full px-4 py-2 bg-input-bg border border-border-color rounded-lg text-text-primary placeholder-text-secondary focus:outline-none focus:border-accent font-mono text-sm"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-text-primary mb-2">Qwen VLM Model ID</label>
                                <input
                                    type="text"
                                    value={nvidiaConfig.qwenVlmModelId}
                                    onChange={(e) => setNvidiaConfig(prev => ({ ...prev, qwenVlmModelId: e.target.value }))}
                                    className="w-full px-4 py-2 bg-input-bg border border-border-color rounded-lg text-text-primary placeholder-text-secondary focus:outline-none focus:border-accent font-mono text-sm"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-text-primary mb-2">Qwen Chat Model ID</label>
                                <input
                                    type="text"
                                    value={nvidiaConfig.chatModelId}
                                    onChange={(e) => setNvidiaConfig(prev => ({ ...prev, chatModelId: e.target.value }))}
                                    className="w-full px-4 py-2 bg-input-bg border border-border-color rounded-lg text-text-primary placeholder-text-secondary focus:outline-none focus:border-accent font-mono text-sm"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-text-primary mb-2">PaliGemma Model ID</label>
                                <input
                                    type="text"
                                    value={nvidiaConfig.paligemmaModelId}
                                    onChange={(e) => setNvidiaConfig(prev => ({ ...prev, paligemmaModelId: e.target.value }))}
                                    className="w-full px-4 py-2 bg-input-bg border border-border-color rounded-lg text-text-primary placeholder-text-secondary focus:outline-none focus:border-accent font-mono text-sm"
                                />
                            </div>
                        </div>

                        <button
                            onClick={handleSaveNvidiaConfig}
                            disabled={isSavingConfig}
                            className="w-full secondary-button disabled:opacity-50 py-3"
                        >
                            {isSavingConfig ? 'Saving NVIDIA Configuration...' : 'Save NVIDIA Configuration'}
                        </button>
                    </>
                )}
            </div>

            {/* Input Section */}
            <div className="bg-background/50 border border-border-color rounded-lg p-6 space-y-4">
                <h3 className="text-lg font-semibold text-text-primary">Product Information</h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-text-primary mb-2">
                            Product Name *
                        </label>
                        <input
                            type="text"
                            placeholder="e.g., Wireless Noise-Canceling Headphones"
                            value={generationState.productName}
                            onChange={(e) =>
                                setGenerationState({ ...generationState, productName: e.target.value })
                            }
                            className="w-full px-4 py-2 bg-input-bg border border-border-color rounded-lg text-text-primary placeholder-text-secondary focus:outline-none focus:border-accent"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-text-primary mb-2">
                            Usage Context (Optional)
                        </label>
                        <input
                            type="text"
                            placeholder="e.g., in professional office setting"
                            value={generationState.usageContext}
                            onChange={(e) =>
                                setGenerationState({ ...generationState, usageContext: e.target.value })
                            }
                            className="w-full px-4 py-2 bg-input-bg border border-border-color rounded-lg text-text-primary placeholder-text-secondary focus:outline-none focus:border-accent"
                        />
                    </div>
                </div>

                <div>
                    <label className="block text-sm font-medium text-text-primary mb-2">
                        Product Description *
                    </label>
                    <textarea
                        placeholder="Detailed description of the product, its features, and use cases..."
                        value={generationState.productDescription}
                        onChange={(e) =>
                            setGenerationState({ ...generationState, productDescription: e.target.value })
                        }
                        rows={4}
                        className="w-full px-4 py-2 bg-input-bg border border-border-color rounded-lg text-text-primary placeholder-text-secondary focus:outline-none focus:border-accent resize-none"
                    />
                </div>

                <button
                    onClick={handleGenerateImages}
                    disabled={isGenerating || isConfigLoading || !hasNvidiaKey || !generationState.productName || !generationState.productDescription}
                    className="w-full primary-button disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                    {isGenerating ? (
                        <>
                            <LoadingSpinner />
                            Generating Images...
                        </>
                    ) : (
                        <>
                            🎨 Generate 3 Images (Stable Diffusion 3.5)
                        </>
                    )}
                </button>
            </div>

            {/* Generated Images Section */}
            {generatedImages.length > 0 && (
                <div className="bg-background/50 border border-border-color rounded-lg p-6 space-y-4">
                    <div className="flex items-center justify-between">
                        <h3 className="text-lg font-semibold text-text-primary">
                            Generated Images ({validImages.length} valid / {generatedImages.length} total)
                        </h3>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {generatedImages.map((image, index) => (
                            <div
                                key={index}
                                className={`border rounded-lg overflow-hidden ${
                                    image.validationStatus === 'valid'
                                        ? 'border-green-500/50 bg-green-500/5'
                                        : image.validationStatus === 'invalid'
                                          ? 'border-red-500/50 bg-red-500/5'
                                          : 'border-border-color'
                                }`}
                            >
                                {/* Image Preview */}
                                {image.base64 && (
                                    <img
                                        src={`data:image/png;base64,${image.base64}`}
                                        alt={`Generated ${index + 1}`}
                                        className="w-full h-64 object-cover"
                                    />
                                )}

                                <div className="p-4 space-y-3">
                                    {/* Validation Status Badge */}
                                    {image.validationStatus && image.validationStatus !== 'pending' && (
                                        <div className="flex items-center gap-2">
                                            {image.validationStatus === 'valid' ? (
                                                <>
                                                    <span className="text-green-400">✅</span>
                                                    <span className="text-green-300 text-sm">
                                                        Quality: {image.validationScore}%
                                                    </span>
                                                </>
                                            ) : (
                                                <>
                                                    <span className="text-red-400">❌</span>
                                                    <span className="text-red-300 text-sm">
                                                        Needs Review
                                                    </span>
                                                </>
                                            )}
                                        </div>
                                    )}

                                    {image.validationFeedback && (
                                        <p className="text-xs text-text-secondary line-clamp-2">
                                            {image.validationFeedback}
                                        </p>
                                    )}

                                    {/* Validate Button */}
                                    <button
                                        onClick={() => handleValidateImage(index)}
                                        disabled={
                                            isValidating && validatingImageIndex === index ||
                                            image.validationStatus !== 'pending'
                                        }
                                        className="w-full text-xs secondary-button disabled:opacity-50 py-2"
                                    >
                                        {isValidating && validatingImageIndex === index
                                            ? '👁️ Validating...'
                                            : image.validationStatus === 'pending'
                                              ? '👁️ Validate with VLM'
                                              : image.validationStatus === 'valid'
                                                ? '✅ Passed'
                                                : '❌ Failed'}
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>

                    {validImages.length > 0 && (
                        <div className="p-4 bg-green-900/20 border border-green-500/30 rounded-lg">
                            <p className="text-green-300 text-sm">
                                ✅ <strong>{validImages.length}</strong> image(s) ready for publication and
                                Pinterest distribution
                            </p>
                        </div>
                    )}
                </div>
            )}

            {/* Pinterest OAuth Section */}
            <div className="bg-background/50 border border-border-color rounded-lg p-6 space-y-4">
                <h3 className="text-lg font-semibold text-text-primary flex items-center gap-2">
                    📌 Pinterest Automation
                </h3>
                <p className="text-text-secondary text-sm">
                    Authorize PostGenius Pro to automatically publish validated images to Pinterest with
                    proper scopes for seamless integration.
                </p>

                <div className="bg-blue-900/20 border border-blue-500/30 rounded-lg p-4 text-sm text-blue-300 space-y-2">
                    <div className="font-semibold">Required Scopes:</div>
                    <ul className="list-disc list-inside space-y-1">
                        <li>
                            <strong>pins:write</strong> - Create and publish pins with generated images
                        </li>
                        <li>
                            <strong>boards:write</strong> - Organize pins in product boards for better
                            organization
                        </li>
                        <li>
                            <strong>user_accounts:read</strong> - Analyze audience for prompt optimization
                        </li>
                    </ul>
                </div>

                <button
                    onClick={handlePinterestAuth}
                    disabled={oauthStep === 'loading'}
                    className="w-full primary-button disabled:opacity-50 py-3 flex items-center justify-center gap-2"
                >
                    {oauthStep === 'loading' ? (
                        <>
                            <LoadingSpinner />
                            Setting up OAuth...
                        </>
                    ) : oauthStep === 'authorized' ? (
                        <>
                            ✅ Pinterest Connected
                        </>
                    ) : (
                        <>
                            📌 Connect to Pinterest (OAuth)
                        </>
                    )}
                </button>
                {pinterestAuthUrl && (
                    <p className="text-xs text-text-secondary break-all">
                        OAuth URL: {pinterestAuthUrl}
                    </p>
                )}
            </div>

            {/* Database Schema Info */}
            <div className="bg-yellow-900/20 border border-yellow-500/30 rounded-lg p-4 text-sm text-yellow-300 space-y-2">
                <div className="font-semibold">Database Schema Required:</div>
                <p>
                    The following fields must be added to your products/posts table for full integration:
                </p>
                <ul className="list-disc list-inside space-y-1 ml-2">
                    <li>
                        <code>ai_lifestyle_images</code> (JSON) - Stores generated image URLs
                    </li>
                    <li>
                        <code>vlm_check_status</code> (BOOLEAN) - Validation status flag
                    </li>
                    <li>
                        <code>generation_prompt</code> (TEXT) - The exact prompt used for generation
                    </li>
                </ul>
            </div>
        </div>
    );
};

export default NVIDIAProductImageGenerator;
