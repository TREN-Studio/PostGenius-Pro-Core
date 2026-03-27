import type { AiConfig } from '../types';
import { generatePuterImage } from './puterImageService';
import { generateWithA4F } from './a4fImageService';
import { generateWithCloudflareWorker } from './cloudflareWorkerImageService';
import { generateImage as generateWithGemini } from './geminiService';

type ImageType = 'hero' | 'step' | 'product';

interface NvidiaImageSpec {
    role: ImageType;
    aspectRatio: string;
}

interface NvidiaRequestPayload {
    productName: string;
    productDescription: string;
    usageContext: string;
    imageCount: number;
    cfgScale: number;
    steps: number;
    enhancePrompt: boolean;
    enableThinking: boolean;
    negativePrompt: string;
    imageSpecs: NvidiaImageSpec[];
}

interface PriorityImageOptions {
    prompt: string;
    type: ImageType;
    blueprint: string;
    aiConfig: AiConfig;
    preferredAspectRatio: string;
    allowNvidia: boolean;
    preferNvidiaForStep?: boolean;
    authToken?: string;
    nvidiaPayload: NvidiaRequestPayload;
}

const parseAspectRatio = (value: string): { w: number; h: number } => {
    const normalized = String(value || '16:9').trim().replace('x', ':');
    const [wRaw, hRaw] = normalized.split(':');
    const w = Number(wRaw);
    const h = Number(hRaw);
    if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) {
        return { w: 16, h: 9 };
    }
    return { w, h };
};

const createEmergencyFallbackImage = (aspectRatio: string): string => {
    const ratio = parseAspectRatio(aspectRatio);
    const width = ratio.w >= ratio.h ? 1280 : 1024;
    const height = Math.max(512, Math.round(width * (ratio.h / ratio.w)));
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
<defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="1"><stop offset="0%" stop-color="#0b1020"/><stop offset="100%" stop-color="#1f2937"/></linearGradient></defs>
<rect width="100%" height="100%" fill="url(#g)"/>
<text x="50%" y="50%" text-anchor="middle" fill="#d1d5db" font-family="Arial, sans-serif" font-size="36">Image fallback</text>
</svg>`;
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
};

const parseNvidiaImageResponse = (payload: any): string => {
    const image = payload?.images?.[0];
    if (!image) {
        throw new Error('NVIDIA image generation returned no images.');
    }

    if (typeof image.url === 'string' && image.url.trim()) {
        return image.url;
    }

    if (typeof image.base64 === 'string' && image.base64.trim()) {
        if (image.base64.startsWith('data:image/')) {
            return image.base64;
        }
        return `data:image/png;base64,${image.base64}`;
    }

    throw new Error('NVIDIA image payload is missing url/base64.');
};

const generateWithNvidiaEndpoint = async (
    authToken: string,
    payload: NvidiaRequestPayload
): Promise<string> => {
    const response = await fetch('/api/nvidia/generate-images/', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': authToken
        },
        body: JSON.stringify(payload)
    });

    const rawText = await response.text();
    let body: any = {};
    try {
        body = rawText ? JSON.parse(rawText) : {};
    } catch {
        body = {};
    }

    if (!response.ok) {
        throw new Error(body?.error || `NVIDIA image generation failed (HTTP ${response.status})`);
    }

    return parseNvidiaImageResponse(body);
};

// Command order:
// 1) Gemini (for cooking hero/step when API key exists)
// 2) Cloudflare Worker AI (primary general)
// 3) NVIDIA backend endpoint (heavy guard)
// 4) A4F premium chain (spec-ops fallback)
// 5) Puter fallback (disabled unless useBeastMode=true)
export const generateImageWithPriorityChain = async (options: PriorityImageOptions): Promise<string> => {
    const errors: string[] = [];
    const geminiKey = String(options.aiConfig?.geminiApiKey || '').trim();
    const normalizedBlueprint = String(options.blueprint || '').toLowerCase();
    const cookingPromptSignal = /(?:^|\W)(recipe|cook|cooking|ingredient|oven|skillet|pan|boil|bake|saute|season|prep|mix|serve|dish)(?:$|\W)/i;
    const isCookingFlow = normalizedBlueprint === 'recipe' || cookingPromptSignal.test(options.prompt || '');
    const shouldTryGeminiFirst = Boolean(
        geminiKey &&
        !options.allowNvidia &&
        (options.type === 'hero' || options.type === 'step') &&
        isCookingFlow
    );

    if (shouldTryGeminiFirst) {
        try {
            const geminiImage = await generateWithGemini(
                options.prompt,
                options.type,
                normalizedBlueprint || 'food',
                options.aiConfig,
                geminiKey
            );
            if (geminiImage && geminiImage.trim()) {
                return geminiImage;
            }
            errors.push('gemini: empty image response');
        } catch (error: any) {
            errors.push(`gemini: ${error?.message || 'unknown error'}`);
        }
    } else if (options.type === 'hero' || options.type === 'step') {
        errors.push('gemini: skipped (no key or non-cooking flow)');
    }

    const strictStepMatch = options.type === 'step'
        ? String(options.prompt || '').match(/Stage:\s*(prep|mix|form|cook|serve|generic)/i)
        : null;
    const strictStepStage = (strictStepMatch?.[1] || '').toLowerCase();
    const isStrictStepLocked = Boolean(strictStepMatch);
    const isStrictEarlyStep = strictStepStage === 'prep' || strictStepStage === 'mix' || strictStepStage === 'form';
    const shouldPrioritizeNvidia = Boolean(
        options.allowNvidia &&
        options.type === 'step' &&
        (options.preferNvidiaForStep || isStrictStepLocked)
    );

    if (shouldPrioritizeNvidia) {
        try {
            const firstNvidia = await generateWithNvidiaEndpoint(options.authToken || '', options.nvidiaPayload);
            if (firstNvidia && firstNvidia.trim()) {
                return firstNvidia;
            }
            errors.push('nvidia: empty image response');
        } catch (error: any) {
            errors.push(`nvidia: ${error?.message || 'unknown error'}`);
        }
    }

    try {
        const worker = await generateWithCloudflareWorker(
            options.prompt,
            options.type,
            options.preferredAspectRatio,
            options.aiConfig
        );
        if (worker && worker.trim()) {
            return worker;
        }
        errors.push('cloudflare-worker: empty image response');
    } catch (error: any) {
        errors.push(`cloudflare-worker: ${error?.message || 'unknown error'}`);
    }

    if (options.allowNvidia && !shouldPrioritizeNvidia) {
        try {
            const second = await generateWithNvidiaEndpoint(options.authToken || '', options.nvidiaPayload);
            if (second && second.trim()) {
                return second;
            }
            errors.push('nvidia: empty image response');
        } catch (error: any) {
            errors.push(`nvidia: ${error?.message || 'unknown error'}`);
        }
    } else {
        if (!options.allowNvidia) {
            errors.push('nvidia: skipped (admin key unavailable)');
        }
    }

    // For strict early recipe stages, skip A4F/Puter to avoid "final dish" drift.
    if (!isStrictEarlyStep) {
        try {
            const a4f = await generateWithA4F(
                options.prompt,
                options.type,
                options.preferredAspectRatio,
                options.aiConfig
            );
            if (a4f && a4f.trim()) {
                return a4f;
            }
            errors.push('a4f: empty image response');
        } catch (error: any) {
            errors.push(`a4f: ${error?.message || 'unknown error'}`);
        }
    } else {
        errors.push('a4f: skipped (strict early-step lock)');
    }

    const allowPuterFallback = Boolean(options.aiConfig?.useBeastMode);
    if (allowPuterFallback && !isStrictEarlyStep) {
        try {
            const third = await generatePuterImage(options.prompt, {
                aspectRatio: options.preferredAspectRatio,
                quality: 'hd',
            });
            if (third && third.trim()) {
                return third;
            }
            errors.push('puter: empty image response');
        } catch (error: any) {
            errors.push(`puter: ${error?.message || 'unknown error'}`);
        }
    } else {
        errors.push(isStrictEarlyStep ? 'puter: skipped (strict early-step lock)' : 'puter: disabled (useBeastMode=false)');
    }

    console.warn('[ImageChain] All providers failed.', errors);
    throw new Error(`Image generation failed across all providers. ${errors.join(' | ')}`);
};
