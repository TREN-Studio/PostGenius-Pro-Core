import { enhancePromptWithDeepSeek, generateImageWithZImage, HF_MODELS } from './huggingfaceService';
import type { AiConfig } from '../types';
import { detectRecipeStepStage } from './recipeStepPromptEngine';

export class ImageRateLimitError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ImageRateLimitError';
    }
}

// Use local Python backend proxy for local dev (bypasses CORS/headers issues)
// For production, use relative PHP path
const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const CORS_PROXY_URL = isLocal
    ? "http://localhost:5000/api/proxy?url=" // Use Python backend proxy locally
    : "/api/proxy.php?url="; // Use PHP proxy in production

const BACKUP_PROXY_URL = CORS_PROXY_URL; // Fallback to same proxy (retry) instead of allorigins which strips headers


// ðŸ”‹ --- KEY VAULT SYSTEM (The Arsenal) ---

interface KeyStats {
    fails: number;
    lastUsed: number;
    successRate: number;
}

// Ù…Ø®Ø²Ù† Ø§Ù„Ù…ÙØ§ØªÙŠØ­ Ø§Ù„Ø¶Ø®Ù… - ÙŠØ¯Ø¹Ù… Ø§Ù„ØªÙˆØ³Ø¹ Ù„Ø¢Ù„Ø§Ù Ø§Ù„Ù…ÙØ§ØªÙŠØ­
const KEY_VAULT = {
    huggingface: [
        'YOUR_HUGGINGFACE_KEY_1', // Default
        'YOUR_HUGGINGFACE_KEY_2', // Backup 1
        'YOUR_HUGGINGFACE_KEY_3', // Backup 2
        // ÙŠÙ…ÙƒÙ† Ø¥Ø¶Ø§ÙØ© Ø§Ù„Ù…Ø²ÙŠØ¯ Ù…Ù† Ø§Ù„Ù…ÙØ§ØªÙŠØ­ Ù‡Ù†Ø§ (MVP: 10-50 keys, Target: 1000+ keys)
    ],
    stability: [
        // Ø³ÙŠØªÙ… Ù…Ù„Ø¤Ù‡Ø§ Ø¨Ù…ÙØ§ØªÙŠØ­ Stability AI Ù…Ù† config Ø£Ùˆ external sources
    ] as string[],
    cloudflare: [
        // Ø³ÙŠØªÙ… Ù…Ù„Ø¤Ù‡Ø§ Ø¨Ù…ÙØ§ØªÙŠØ­ Cloudflare Workers AI
    ] as string[],
    fal: [
        // Ø³ÙŠØªÙ… Ù…Ù„Ø¤Ù‡Ø§ Ø¨Ù…ÙØ§ØªÙŠØ­ Fal.ai
    ] as string[],
    replicate: [] as string[],
    leonardo: [] as string[],
    getimg: [] as string[],
    picsart: [] as string[],
    infip: [] as string[],
} as const;

// Ù†Ø¸Ø§Ù… ØªØªØ¨Ø¹ ØµØ­Ø© Ø§Ù„Ù…ÙØ§ØªÙŠØ­ (Health Tracker)
const KEY_STATS = new Map<string, KeyStats>();

// ÙˆØ¸ÙŠÙØ© Ø§Ø®ØªÙŠØ§Ø± Ø§Ù„Ù…ÙØªØ§Ø­ Ø§Ù„Ø£Ù‚ÙˆÙ‰ (The Sturdy Key Selector)
const getSturdyKey = (provider: keyof typeof KEY_VAULT): string | null => {
    const providerKeys = KEY_VAULT[provider];

    if (!providerKeys || providerKeys.length === 0) {
        console.warn(`âš ï¸ [Key Vault] Empty vault for ${provider}! Switching to Beast mode.`);
        return null;
    }

    // ØªØµÙÙŠØ© Ø§Ù„Ù…ÙØ§ØªÙŠØ­ Ø§Ù„Ù…Ø­Ø¸ÙˆØ±Ø©
    const activeKeys = providerKeys.filter(key => !BLACKLISTED_KEYS.has(key));

    if (activeKeys.length < 2) {
        console.warn(`âš ï¸ [Key Vault] Critical for ${provider}! Only ${activeKeys.length} keys left.`);
        if (activeKeys.length === 0) return null;
    }

    // Ø§Ø®ØªÙŠØ§Ø± Ø¹Ø´ÙˆØ§Ø¦ÙŠ Ù…Ù† Ø§Ù„Ù…ÙØ§ØªÙŠØ­ Ø§Ù„Ù†Ø´Ø·Ø©
    const selectedKey = activeKeys[Math.floor(Math.random() * activeKeys.length)];

    // ØªØ­Ø¯ÙŠØ« Ø¥Ø­ØµØ§Ø¦ÙŠØ§Øª Ø§Ù„Ø§Ø³ØªØ®Ø¯Ø§Ù…
    const stats = KEY_STATS.get(selectedKey) || { fails: 0, lastUsed: 0, successRate: 100 };
    stats.lastUsed = Date.now();
    KEY_STATS.set(selectedKey, stats);

    console.log(`ðŸ”‘ [Key Vault] Selected key for ${provider}: ${selectedKey.substring(0, 15)}... (Success Rate: ${stats.successRate}%)`);
    return selectedKey;
};

// ÙˆØ¸ÙŠÙØ© ØªØ³Ø¬ÙŠÙ„ ÙØ´Ù„ Ø§Ù„Ù…ÙØªØ§Ø­ (Bad Key Reporter)
const reportKeyFailure = (key: string, provider: string, isFatal: boolean = false): void => {
    const stats = KEY_STATS.get(key) || { fails: 0, lastUsed: 0, successRate: 100 };
    stats.fails++;
    stats.successRate = Math.max(0, stats.successRate - 10);
    KEY_STATS.set(key, stats);

    // Ø¥Ø°Ø§ ÙƒØ§Ù† Ø§Ù„ÙØ´Ù„ Ù‚Ø§ØªÙ„ (Auth/Payment error) Ø£Ùˆ ØªØ¬Ø§ÙˆØ² 5 ÙØ´Ù„Ø§ØªØŒ Ù†Ø­Ø¸Ø± Ø§Ù„Ù…ÙØªØ§Ø­
    if (isFatal || stats.fails >= 5) {
        console.warn(`ðŸš« [Key Vault] Blacklisting key for ${provider}: ${key.substring(0, 15)}... (Fails: ${stats.fails}, Fatal: ${isFatal})`);
        BLACKLISTED_KEYS.add(key);
    } else {
        console.warn(`âš ï¸ [Key Vault] Key failure for ${provider}: ${key.substring(0, 15)}... (Fails: ${stats.fails}/5, Success Rate: ${stats.successRate}%)`);
    }
};

// ÙˆØ¸ÙŠÙØ© ØªØ³Ø¬ÙŠÙ„ Ù†Ø¬Ø§Ø­ Ø§Ù„Ù…ÙØªØ§Ø­
const reportKeySuccess = (key: string): void => {
    const stats = KEY_STATS.get(key) || { fails: 0, lastUsed: 0, successRate: 100 };
    stats.successRate = Math.min(100, stats.successRate + 5);
    KEY_STATS.set(key, stats);
    console.log(`âœ… [Key Vault] Key success: ${key.substring(0, 15)}... (Success Rate: ${stats.successRate}%)`);
};

// Legacy compatibility wrapper (keep getHFKey for backwards compatibility)
const getHFKey = () => getSturdyKey('huggingface') || KEY_VAULT.huggingface[0];
const HF_KEYS = KEY_VAULT.huggingface; // Alias for backwards compatibility

// ðŸ“¡ --- EXTERNAL KEY SYNCING SYSTEM REMOVED ---
// The system now relies on local KEY_VAULT and the Master Gateway (Cloudflare Worker) approach
// User API keys can still be configured manually through the settings interface

// ðŸš€ --- MASTER GATEWAY SYSTEM (Smart Fallback) ---

/**
 * Master Gateway - Cloudflare Worker URL
 * This is the primary image generation engine that runs 24/7 with unlimited quota
 */
const MASTER_WORKER_URL = 'https://postgenius-ai-gateway.larbilife.workers.dev';

/**
 * Generate image using Cloudflare Worker (Master Gateway)
 * Worker's internal prompt engine ensures maximum photorealism automatically
 */
const generateWithCloudflareWorker = async (
    prompt: string,
    type: 'hero' | 'step' | 'product',
    blueprint: string
): Promise<string> => {
    // Determine style based on type and blueprint
    let style = 'realistic';
    if (blueprint === 'recipe' || blueprint === 'food') style = 'food';
    if (type === 'product') style = 'commercial';

    // ðŸ”¥ Ø§Ù„Ø³Ø±: Ø¥Ø¶Ø§ÙØ© Ø³ÙŠØ§Ù‚ ÙÙˆØªÙˆØºØ±Ø§ÙÙŠ ØªÙ„Ù‚Ø§Ø¦ÙŠØ§Ù‹ Ù„Ù…Ù†Ø¹ Ø§Ù„Ø±Ø³ÙˆÙ…Ø§Øª
    // Ø¨Ø¯Ù„Ø§Ù‹ Ù…Ù† "Lemon Bars" â†’ "Lemon Bars professional food photography"
    let enhancedPrompt = prompt;
    if (!prompt.toLowerCase().includes('photograph') && !prompt.toLowerCase().includes('photo')) {
        if (style === 'food') {
            enhancedPrompt = `${prompt} professional food photography`;
        } else if (style === 'commercial') {
            enhancedPrompt = `${prompt} professional product photography`;
        } else {
            enhancedPrompt = `${prompt} professional photography`;
        }
    }

    const resolution =
        type === 'hero'
            ? RESOLUTIONS.hero
            : (type === 'step' ? RESOLUTIONS.step : RESOLUTIONS.product);

    const url = `${MASTER_WORKER_URL}?prompt=${encodeURIComponent(enhancedPrompt)}&style=${style}&width=${resolution.width}&height=${resolution.height}`;

    console.log(`[Master Worker] ðŸš€ Generating: "${prompt}"`);
    console.log(`[Master Worker] ðŸ“¸ Enhanced to: "${enhancedPrompt}"`);
    console.log(`[Master Worker] ðŸŽ¬ Style: ${style} | Type: ${type}`);
    console.log(`[Master Worker] ðŸ“ Dimensions: ${resolution.width}x${resolution.height}`);

    try {
        const response = await withTimeout(fetch(url), 45000); // 45s timeout

        if (!response.ok) {
            throw new Error(`Worker failed: ${response.status} ${response.statusText}`);
        }

        // Convert blob response to data URI
        const blob = await response.blob();
        const buffer = await blob.arrayBuffer();
        const dataUri = arrayBufferToDataUri(buffer, blob.type || 'image/png');

        console.log(`[Master Worker] âœ… Photorealistic image generated (${(buffer.byteLength / 1024).toFixed(2)} KB)`);
        return dataUri;

    } catch (error: any) {
        console.error('[Master Worker] âŒ Failed:', error.message);
        throw new Error(`Master Worker failed: ${error.message}`);
    }
};

/**
 * Smart Image Generation with Economy Mode
 * 
 * PRIORITY SYSTEM:
 * 1. ECONOMY MODE (User API Keys - Try in order of quality):
 *    - Stability AI (best for photorealism)
 *    - Fal.ai / Replicate (high quality)
 *    - Leonardo.Ai / Segmind / Getimg.ai
 *    - Hugging Face / Together AI / Infip.pro
 *    - Cloudflare (user's own Worker)
 *    - Others (Prodia, Monster API, StarryAI, etc.)
 * 
 * 2. MASTER MODE (Our Cloudflare Worker - Unlimited, 24/7):
 *    - URL: https://postgenius-ai-gateway.larbilife.workers.dev
 *    - Dimensions: 1200x632 (Google Discover optimized)
 *    - Models: Flux.1 Schnell â†’ SDXL Lightning â†’ SDXL Base
 *    - Features: Negative prompts, RAW photo prefix, auto enhancement
 * 
 * This ensures 100% uptime while maximizing cost efficiency
 */
export const generateSmartImage = async (
    prompt: string,
    type: 'hero' | 'step' | 'product',
    blueprint: string,
    userConfig: AiConfig
): Promise<string> => {
    console.log(`[Smart Gateway] ðŸŽ¯ Generating ${type} image for ${blueprint} blueprint`);
    console.log(`[Smart Gateway] ðŸ“ Prompt: "${prompt}"`);

    // Check if user has any configured API keys (Economy Mode eligibility)
    // Priority order matches quality/reliability
    const hasUserKeys = !!(
        userConfig.stabilityApiKey ||        // Priority 1: Best photorealism
        userConfig.falApiKey ||              // Priority 2: High quality
        userConfig.replicateApiKey ||        // Priority 2: High quality
        userConfig.leonardoApiKey ||         // Priority 3: Good quality
        userConfig.getimgApiKey ||           // Priority 3: Good quality
        userConfig.huggingFaceApiKey ||      // Priority 4: Open source
        userConfig.cloudflareApiToken ||     // Priority 5: User's own Worker
        userConfig.siliconFlowApiKey         // Priority 6: Alternative
    );

    // ECONOMY MODE: Try user's configured providers first (saves Master Worker quota)
    if (hasUserKeys) {
        console.log('[Smart Gateway] ðŸ’° Economy Mode: Trying user API keys first...');
        console.log('[Smart Gateway] ðŸ”‘ Available keys detected - attempting provider cascade');
        try {
            const result = await generateImageSmartly(prompt, type, blueprint, userConfig);
            console.log('[Smart Gateway] âœ… Success with user API keys!');
            return result;
        } catch (error: any) {
            console.warn('[Smart Gateway] âš ï¸ All user providers failed, falling back to Master Worker:', error.message);
            // Continue to Master Worker fallback
        }
    } else {
        console.log('[Smart Gateway] ðŸ†“ Free Mode: No user keys configured');
        console.log('[Smart Gateway] ðŸš€ Using Master Worker directly (unlimited quota)');
    }

    // MASTER MODE: Use our Cloudflare Worker as fallback (or primary if no keys)
    console.log('[Smart Gateway] ðŸŒŸ Engaging Master Worker (Cloudflare)...');
    const res =
        type === 'hero'
            ? RESOLUTIONS.hero
            : (type === 'step' ? RESOLUTIONS.step : RESOLUTIONS.product);
    console.log(`[Smart Gateway] ðŸ“ Dimensions: ${res.width}x${res.height}`);
    try {
        return await generateWithCloudflareWorker(prompt, type, blueprint);
    } catch (workerError: any) {
        console.error('[Smart Gateway] CRITICAL: Master Worker failed.', workerError);
        const width = type === 'hero' ? RESOLUTIONS.hero.width : (type === 'step' ? RESOLUTIONS.step.width : RESOLUTIONS.product.width);
        const height = type === 'hero' ? RESOLUTIONS.hero.height : (type === 'step' ? RESOLUTIONS.step.height : RESOLUTIONS.product.height);
        return getFallbackGradientImage(width, height);
    }
};



// Updated to match Stability AI SDXL supported resolutions
const RESOLUTIONS = {
    hero: { width: 1200, height: 628 }, // Golden Ratio (1.91:1) - Google Discover Optimized
    step: { width: 1200, height: 628 }, // Golden Ratio (1.91:1) - Consistent with Hero
    product: { width: 1024, height: 1024 } // 1:1 Square
};


const arrayBufferToDataUri = (buffer: ArrayBuffer, mimeType: string): string => {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    const base64 = window.btoa(binary);
    return `data:${mimeType};base64,${base64}`;
};

const withTimeout = async <T>(promise: Promise<T>, ms: number): Promise<T> => {
    return new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => {
            reject(new Error(`Request timed out after ${ms}ms`));
        }, ms);
        promise.then(resolve, reject).finally(() => clearTimeout(timeoutId));
    });
};

const fetchAndConvertToDataUri = async (url: string, options: RequestInit = {}): Promise<string> => {
    const processResponse = async (response: Response) => {
        if (!response.ok) {
            const errorText = await response.text().catch(() => `status: ${response.status}`);
            if (response.status === 429 || errorText.includes('Too Many Requests') || errorText.includes('Queue full')) {
                throw new ImageRateLimitError("The service is temporarily rate-limited.");
            }
            throw new Error(`API request failed: ${response.status} ${response.statusText}`);
        }
        const blob = await response.blob();

        // Check for text/json errors, but be smarter about it.
        // Some proxies return text/html for binary data if headers are lost.
        if (blob.type.startsWith('text/') || blob.type.startsWith('application/json')) {
            // Peek at the buffer to see if it's actually an image (Magic Bytes)
            const arrayBuffer = await blob.arrayBuffer();
            const bytes = new Uint8Array(arrayBuffer);

            // PNG Magic Bytes: 89 50 4E 47
            if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) {
                return arrayBufferToDataUri(arrayBuffer, 'image/png');
            }
            // JPEG Magic Bytes: FF D8 FF
            if (bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) {
                return arrayBufferToDataUri(arrayBuffer, 'image/jpeg');
            }
            // WEBP Magic Bytes (RIFF .... WEBP)
            if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46) {
                return arrayBufferToDataUri(arrayBuffer, 'image/webp');
            }

            // If no magic bytes, it's likely a real error message
            const textDecoder = new TextDecoder();
            const errorText = textDecoder.decode(bytes);

            if (errorText.includes('Too Many Requests')) {
                throw new ImageRateLimitError("The service is temporarily rate-limited.");
            }
            // Allow very short "binary" garbage to be thrown, but lengthy responses might be misidentified content
            throw new Error(`API returned text/json instead of image: ${errorText.slice(0, 200)}...`);
        }

        const buffer = await blob.arrayBuffer();
        return arrayBufferToDataUri(buffer, blob.type);
    };

    try {
        // Reduced timeout to 45s for faster failover (Free models shouldn't take longer if they are warm)
        const response = await withTimeout(fetch(url, options), 45000);
        return await processResponse(response);
    } catch (error: any) {
        // Check if using our PHP proxy structure
        if (url.includes('/api/proxy.php?url=')) {
            // If it failed, try the backup proxy (allorigins)
            console.warn(`Primary proxy failed (${error.message}), trying backup proxy...`);
            try {
                // Extract original target URL
                const targetUrlMatch = url.match(/url=(.+)$/);
                const targetUrl = targetUrlMatch ? decodeURIComponent(targetUrlMatch[1]) : url;

                const backupUrl = `${BACKUP_PROXY_URL}${encodeURIComponent(targetUrl)}`;
                const response = await withTimeout(fetch(backupUrl, options), 90000);
                return await processResponse(response);
            } catch (backupError: any) {
                console.warn(`Backup proxy also failed: ${backupError.message}`);
                throw error; // Throw original error to preserve context
            }
        }
        else if (url.startsWith("https://corsproxy.io/?")) {
            // Handle legacy corsproxy format just in case
            console.warn(`Legacy proxy failed (${error.message}), trying backup...`);
            try {
                const targetUrl = url.slice("https://corsproxy.io/?".length);
                const backupUrl = `${BACKUP_PROXY_URL}${encodeURIComponent(targetUrl)}`;
                const response = await withTimeout(fetch(backupUrl, options), 90000);
                return await processResponse(response);
            } catch (backupError: any) {
                throw error;
            }
        }
        throw error;
    }
};

const pollForResult = async <T>(
    url: string,
    headers: HeadersInit,
    isSuccess: (data: any) => boolean,
    isFailure: (data: any) => boolean,
    extractResult: (data: any) => T
): Promise<T> => {
    const startTime = Date.now();
    const timeout = 180000; // 3 mins timeout for long queues

    while (Date.now() - startTime < timeout) {
        await new Promise(resolve => setTimeout(resolve, 4000));
        const response = await fetch(url, { headers });
        if (!response.ok) continue;
        const data = await response.json();

        if (isFailure(data)) throw new Error(`Job failed: ${JSON.stringify(data)}`);
        if (isSuccess(data)) return extractResult(data);
    }
    throw new Error("Polling timed out");
};

const getFallbackGradientImage = (width: number, height: number) => {
    const svg = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <defs>
            <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" style="stop-color:#1f2937;stop-opacity:1" />
                <stop offset="100%" style="stop-color:#111827;stop-opacity:1" />
            </linearGradient>
            <pattern id="pattern" width="20" height="20" patternUnits="userSpaceOnUse">
                 <circle cx="1" cy="1" r="1" fill="rgba(255,255,255,0.05)" />
            </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grad)" />
        <rect width="100%" height="100%" fill="url(#pattern)" />
        <text x="50%" y="45%" font-family="sans-serif" font-weight="bold" font-size="24" fill="#9CA3AF" text-anchor="middle" dominant-baseline="middle">Generation Failed</text>
        <text x="50%" y="55%" font-family="sans-serif" font-size="16" fill="#6B7280" text-anchor="middle" dominant-baseline="middle">Click "Regenerate" to try again</text>
    </svg>`;
    return `data:image/svg+xml;base64,${window.btoa(svg)}`;
};

const isPlaceholderImageResult = (value: string): boolean => {
    const normalized = String(value || '').trim().toLowerCase();
    if (!normalized) return true;
    if (normalized.startsWith('data:image/svg+xml')) return true;
    if (normalized.includes('generation failed')) return true;
    if (normalized.includes('image fallback')) return true;
    if (normalized.includes('step image fallback')) return true;
    return false;
};


// --- PROVIDER IMPLEMENTATIONS ---

// Provider 16: Z-Image-Turbo (Hugging Face)
const generateWithZImageTurbo = async (prompt: string, config: AiConfig, width: number, height: number): Promise<string> => {
    const apiKey = config.huggingFaceApiKey || 'YOUR_HUGGINGFACE_KEY_1';
    return generateImageWithZImage(prompt, width, height, apiKey);
};

// Provider 1: Stability AI
const generateWithStability = async (prompt: string, config: AiConfig, width: number, height: number): Promise<string> => {
    // ðŸ”‘ Try dynamic key from vault first, then config
    const vaultKey = getSturdyKey('stability');
    const apiKey = vaultKey || config.stabilityApiKey;

    if (!apiKey) {
        throw new Error('Stability AI: No keys available in vault or config');
    }

    let retries = 0;
    const maxRetries = 2; // Reduced from 5 to switch to other providers faster if key is exhausted
    const baseDelay = 2000; // 2 seconds

    while (retries <= maxRetries) {
        try {
            const response = await fetch(`${CORS_PROXY_URL}${encodeURIComponent('https://api.stability.ai/v1/generation/stable-diffusion-xl-1024-v1-0/text-to-image')}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Accept: 'application/json',
                    Authorization: `Bearer ${apiKey}`,
                },
                body: JSON.stringify({
                    text_prompts: [
                        { text: prompt, weight: 1 },
                        { text: "illustration, drawing, painting, cartoon, anime, sketch, digital art, water color, 3d render, cgi, fake texture, animated, stylized, low quality, blurry, bad quality, distorted, watermark, text, logo, signature, ugly, deformed", weight: -1 }
                    ],
                    cfg_scale: 7,
                    height,
                    width,
                    samples: 1,
                    steps: 30,
                }),
            });

            if (response.status === 429) {
                const retryAfter = response.headers.get('Retry-After');
                const delay = retryAfter ? parseInt(retryAfter) * 1000 : baseDelay * Math.pow(2, retries);
                console.warn(`Stability AI Rate Limit (429). Retrying in ${delay / 1000}s... (Attempt ${retries + 1}/${maxRetries})`);

                if (retries === maxRetries) {
                    reportKeyFailure(apiKey, 'stability', false); // Rate limit is not fatal
                    throw new Error("Stability AI Rate Limit Exceeded (Max Retries)");
                }

                await new Promise(resolve => setTimeout(resolve, delay));
                retries++;
                continue;
            }

            if (!response.ok) {
                const error = await response.json().catch(() => ({ message: response.statusText }));
                const errorMsg = error.message || response.statusText;

                // Check for fatal errors (Auth/Payment)
                const isFatal = response.status === 401 || response.status === 402 || response.status === 403 ||
                    errorMsg.includes('payment') || errorMsg.includes('quota') || errorMsg.includes('insufficient');

                reportKeyFailure(apiKey, 'stability', isFatal);
                throw new Error(`Stability AI Error: ${errorMsg}`);
            }

            const result = await response.json();
            if (!result.artifacts || !result.artifacts[0]) {
                throw new Error("Stability AI returned no image artifacts.");
            }

            // âœ… Success! Report key success
            reportKeySuccess(apiKey);
            return `data:image/png;base64,${result.artifacts[0].base64}`;

        } catch (error: any) {
            // If it's the max retry error, rethrow it. Otherwise logic flow handles it or rethrow for non-transient
            if (error.message.includes("Max Retries")) throw error;
            // For other fetch errors (network), we might not want to retry, or maybe we do?
            // Existing logic didn't retry, so rethrowing non-429 unexpected errors is safer unless we want robust network retries too.
            // But for this task, strictly 429 handling inside the loop.
            throw error;
        }
    }
    throw new Error("Stability AI Failed"); // Should not reach here

};

// Provider 2: Picsart
const generateWithPicsart = async (prompt: string, config: AiConfig, width: number, height: number): Promise<string> => {
    const response = await fetch(`${CORS_PROXY_URL}${encodeURIComponent('https://genai-api.picsart.io/v1/text2image')}`, {
        method: 'POST',
        headers: { 'x-picsart-api-key': `${config.picsartApiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, width, height, count: 1 })
    });
    if (!response.ok) throw new Error(`Picsart failed with status ${response.status}: ${await response.text()}`);
    const data = await response.json();
    if (!data.data || !data.data[0] || !data.data[0].url) {
        throw new Error(`Picsart did not return a valid image URL. Response: ${JSON.stringify(data)}`);
    }
    // Fetch the URL to convert to base64 data URI for consistency
    return fetchAndConvertToDataUri(`${CORS_PROXY_URL}${encodeURIComponent(data.data[0].url)}`);
};

// Provider 3: AI Horde
const generateWithAiHorde = async (prompt: string, config: AiConfig, width: number, height: number): Promise<string> => {
    const apiKey = config.aiHordeApiKey || '0000000000';
    const initialResponse = await fetch(`${CORS_PROXY_URL}${encodeURIComponent('https://stablehorde.net/api/v2/generate/async')}`, {
        method: 'POST',
        headers: { 'apikey': apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            prompt: `${prompt} ### aesthetic, photorealistic`,
            params: { sampler_name: 'k_dpmpp_2s_a', width, height, steps: 25, n: 1 },
            models: ['stable_diffusion_xl'],
            r2: true,
            shared: true
        })
    });
    const responseJson = await initialResponse.json();
    if (!responseJson.id) throw new Error(`AI Horde did not return a job ID. Response: ${JSON.stringify(responseJson)}`);
    const { id } = responseJson;

    const checkUrl = `${CORS_PROXY_URL}${encodeURIComponent(`https://stablehorde.net/api/v2/generate/check/${id}`)}`;
    const statusUrl = `${CORS_PROXY_URL}${encodeURIComponent(`https://stablehorde.net/api/v2/generate/status/${id}`)}`;

    const startTime = Date.now();
    const timeout = 540000; // 9 minutes
    while (Date.now() - startTime < timeout) {
        await new Promise(resolve => setTimeout(resolve, 4000));
        const checkRes = await fetch(checkUrl, { headers: { 'apikey': apiKey } });
        const checkData = await checkRes.json();

        if (checkData.faulted) throw new Error('AI Horde job faulted.');

        if (checkData.done) {
            const statusRes = await fetch(statusUrl, { headers: { 'apikey': apiKey } });
            const statusData = await statusRes.json();
            if (statusData.generations?.[0]?.img) {
                return statusData.generations[0].img; // Usually a URL
            } else {
                throw new Error('AI Horde job finished but no image was found.');
            }
        }
    }
    throw new Error(`AI Horde job timed out.`);
};

// Provider 4: ClipDrop
const generateWithClipDrop = async (prompt: string, config: AiConfig): Promise<string> => {
    const formData = new FormData();
    formData.append('prompt', prompt);

    return fetchAndConvertToDataUri(`${CORS_PROXY_URL}${encodeURIComponent('https://clipdrop-api.co/text-to-image/v1')}`, {
        method: 'POST',
        headers: { 'x-api-key': `${config.clipdropApiKey}` },
        body: formData,
    });
};

// Provider 5: Replicate
const generateWithReplicate = async (prompt: string, config: AiConfig, width: number, height: number): Promise<string> => {
    const body = {
        version: "ac732df83cea7fff18b8472768c88ad041fa750ff7682a21affe81863cbe77e4", // SDXL
        input: { prompt, width, height }
    };
    const initialResponse = await fetch(`${CORS_PROXY_URL}${encodeURIComponent('https://api.replicate.com/v1/predictions')}`, {
        method: 'POST',
        headers: { 'Authorization': `Token ${config.replicateApiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
    const prediction = await initialResponse.json();
    if (initialResponse.status !== 201) throw new Error(prediction.detail || "Replicate creation failed");

    const resultUrl = await pollForResult<string>(
        `${CORS_PROXY_URL}${encodeURIComponent(prediction.urls.get)}`,
        { 'Authorization': `Token ${config.replicateApiKey}` },
        p => p.status === 'succeeded',
        p => p.status === 'failed',
        p => p.output[0]
    );
    return fetchAndConvertToDataUri(resultUrl);
};

// Provider 6: Getimg.ai
const generateWithGetimg = async (prompt: string, config: AiConfig, width: number, height: number): Promise<string> => {
    // Ensure dimensions are integers
    const apiKey = config.getimgApiKey; // Define apiKey here
    const w = Math.round(width);
    const h = Math.round(height);

    const response = await fetch(`${CORS_PROXY_URL}${encodeURIComponent('https://api.getimg.ai/v1/stable-diffusion/text-to-image')}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: 'stable-diffusion-v1-5',
            prompt: prompt,
            negative_prompt: "blurry, bad quality, distorted",
            // Hardcoded integers to prevent type errors. 
            // If dynamic width is needed: parseInt(String(Math.floor(width/8)*8), 10)
            width: 1024,
            height: 1024,
            steps: 25
        })
    });
    if (!response.ok) throw new Error(`Getimg.ai failed with status ${response.status}: ${await response.text()}`);
    const data = await response.json();
    if (data.image) {
        return `data:image/jpeg;base64,${data.image}`;
    }
    throw new Error("Getimg.ai did not return a valid image.");
};

// Provider 7: Fal.ai
const generateWithFal = async (prompt: string, config: AiConfig): Promise<string> => {
    // ðŸ”‘ Try dynamic key from vault first, then config
    const vaultKey = getSturdyKey('fal');
    const apiKey = vaultKey || config.falApiKey;

    if (!apiKey) {
        throw new Error('Fal.ai: No keys available in vault or config');
    }

    try {
        const response = await fetch(`${CORS_PROXY_URL}${encodeURIComponent('https://fal.run/fal-ai/fast-sdxl')}`, {
            method: 'POST',
            headers: { 'Authorization': `Key ${apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt })
        });

        if (!response.ok) {
            const isFatal = response.status === 401 || response.status === 402 || response.status === 403;
            reportKeyFailure(apiKey, 'fal', isFatal);
            throw new Error(`Fal.ai failed with status ${response.status}`);
        }

        const data = await response.json();
        if (data.images && data.images[0] && data.images[0].url) {
            reportKeySuccess(apiKey);
            return fetchAndConvertToDataUri(data.images[0].url);
        }
        throw new Error("Fal.ai returned no image URL");
    } catch (error: any) {
        // If not already reported, report as non-fatal failure
        if (!error.message.includes('vault')) {
            reportKeyFailure(apiKey, 'fal', false);
        }
        throw error;
    }
};

// Provider 8: Leonardo.Ai
const generateWithLeonardo = async (prompt: string, config: AiConfig, width: number, height: number): Promise<string> => {
    const initialResponse = await fetch(`${CORS_PROXY_URL}${encodeURIComponent('https://cloud.leonardo.ai/api/rest/v1/generations')}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${config.leonardoApiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, modelId: "b24e16ff-06e3-43eb-a2ae-99ff0a1e225c", height, width })
    });
    const { sdGenerationJob } = await initialResponse.json();
    if (!sdGenerationJob?.generationId) throw new Error("Leonardo.ai did not return a generation ID.");

    const resultUrl = await pollForResult<string>(
        `${CORS_PROXY_URL}${encodeURIComponent(`https://cloud.leonardo.ai/api/rest/v1/generations/${sdGenerationJob.generationId}`)}`,
        { 'Authorization': `Bearer ${config.leonardoApiKey}` },
        p => p.generations_by_pk?.status === 'COMPLETE',
        p => p.generations_by_pk?.status === 'FAILED',
        p => p.generations_by_pk?.generated_images?.[0]?.url
    );
    return fetchAndConvertToDataUri(resultUrl);
};

// Provider 9: Prodia
const generateWithProdia = async (prompt: string, config: AiConfig, width: number, height: number): Promise<string> => {
    const initialResponse = await fetch(`${CORS_PROXY_URL}${encodeURIComponent('https://api.prodia.com/v1/sdxl/generate')}`, {
        method: 'POST',
        headers: { 'X-Prodia-Key': `${config.prodiaApiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, model: "sd_xl_base_1.0.safetensors [be9edd61]", width, height })
    });
    const job = await initialResponse.json();
    if (!job?.job) throw new Error("Prodia did not return a job ID.");

    const resultUrl = await pollForResult<string>(
        `${CORS_PROXY_URL}${encodeURIComponent(`https://api.prodia.com/v1/job/${job.job}`)}`,
        { 'X-Prodia-Key': `${config.prodiaApiKey}` },
        p => p.status === 'succeeded',
        p => p.status === 'failed',
        p => p.imageUrl
    );
    return fetchAndConvertToDataUri(resultUrl);
};

// Provider 10: Segmind
const generateWithSegmind = async (prompt: string, config: AiConfig): Promise<string> => {
    return fetchAndConvertToDataUri(`${CORS_PROXY_URL}${encodeURIComponent('https://api.segmind.com/v1/sdxl1.0-txt2img')}`, {
        method: 'POST',
        headers: { 'x-api-key': `${config.segmindApiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, style: "photorealistic", scheduler: "dpmpp_2m_sde_karras" })
    });
};

// Provider 11: StableDiffusionAPI.com
const generateWithStableDiffusionApi = async (prompt: string, config: AiConfig, width: number, height: number): Promise<string> => {
    const initialResponse = await fetch(`${CORS_PROXY_URL}${encodeURIComponent('https://stablediffusionapi.com/api/v3/text2img')}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: config.stablediffusionapiApiKey, prompt, width: width.toString(), height: height.toString() })
    });
    const data = await initialResponse.json();
    if (data.status === 'error') throw new Error(`StableDiffusionAPI Error: ${data.message}`);

    let resultUrl = '';
    if (data.status === 'success') {
        resultUrl = data.output[0];
    } else {
        resultUrl = await pollForResult<string>(
            `${CORS_PROXY_URL}${encodeURIComponent(data.fetch_result)}`,
            { 'Content-Type': 'application/json' },
            p => p.status === 'success',
            p => p.status === 'error',
            p => p.output[0]
        );
    }
    return fetchAndConvertToDataUri(resultUrl);
};

// Provider 12: Monster API
const generateWithMonsterApi = async (prompt: string, config: AiConfig): Promise<string> => {
    const initialResponse = await fetch(`${CORS_PROXY_URL}${encodeURIComponent('https://api.monsterapi.ai/v1/generate/txt2img')}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${config.monsterApiToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, model: "sdxl-base" })
    });
    const data = await initialResponse.json();
    if (!data.process_id) throw new Error(`MonsterAPI Error: ${JSON.stringify(data)}`);

    const resultUrl = await pollForResult<string>(
        `${CORS_PROXY_URL}${encodeURIComponent(`https://api.monsterapi.ai/v1/status/${data.process_id}`)}`,
        { 'Authorization': `Bearer ${config.monsterApiToken}` },
        p => p.status === 'COMPLETED',
        p => p.status === 'FAILED',
        p => p.result.output[0]
    );
    return fetchAndConvertToDataUri(resultUrl);
};

// Provider 13: Evoke
const generateWithEvoke = async (prompt: string, config: AiConfig): Promise<string> => {
    const initialResponse = await fetch(`${CORS_PROXY_URL}${encodeURIComponent('https://api.evoke-app.com/v1/models/stability-ai/stable-diffusion-xl-base-1.0/runs')}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${config.evokeApiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt })
    });
    const data = await initialResponse.json();
    if (!data.run.id) throw new Error(`Evoke Error: ${JSON.stringify(data)}`);

    const resultUrl = await pollForResult<string>(
        `${CORS_PROXY_URL}${encodeURIComponent(`https://api.evoke-app.com/v1/runs/${data.run.id}`)}`,
        { 'Authorization': `Bearer ${config.evokeApiKey}` },
        p => p.run.status === 'succeeded',
        p => p.run.status === 'failed',
        p => p.run.images[0].url
    );
    return fetchAndConvertToDataUri(resultUrl);
};

// Provider 14: Starryai
const generateWithStarryai = async (prompt: string, config: AiConfig, width: number, height: number, aspectRatio: string): Promise<string> => {
    const initialResponse = await fetch(`${CORS_PROXY_URL}${encodeURIComponent('https://api.starryai.com/creations')}`, {
        method: 'POST',
        headers: { 'X-API-KEY': `${config.starryaiApiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, aspectRatio: aspectRatio === "1:1" ? "SQUARE" : "WIDE", runtime: "NORMAL", style: "Hyper-Detailed" })
    });
    const data = await initialResponse.json();
    if (!data.id) throw new Error(`Starryai Error: ${JSON.stringify(data)}`);

    const resultUrl = await pollForResult<string>(
        `${CORS_PROXY_URL}${encodeURIComponent(`https://api.starryai.com/creations/${data.id}`)}`,
        { 'X-API-KEY': `${config.starryaiApiKey}` },
        p => p.status === 'completed',
        p => p.status === 'failed',
        p => p.images[0].url
    );
    return fetchAndConvertToDataUri(resultUrl);
};

// Provider 15: Hugging Face
// Provider 15: Hugging Face (Optimized for Free Tier)
const generateWithHuggingFace = async (prompt: string, config: AiConfig): Promise<string> => {
    // Switch to a more reliable, older model that is often free.
    // stable-diffusion-2-1 is the most reliable free fallback currently.
    const model = 'stabilityai/stable-diffusion-2-1';
    const apiKey = config.huggingFaceApiKey || 'YOUR_HUGGINGFACE_KEY_1';

    // Removed internal public-anonymous image fallback.
    // If HF fails, it should throw so the Smart Gateway can rotate to the next provider.
    return await fetchAndConvertToDataUri(`${CORS_PROXY_URL}${encodeURIComponent(`https://api-inference.huggingface.co/models/${model}`)}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'x-use-cache': 'false' },
        body: JSON.stringify({ inputs: prompt })
    });
};

// Provider 17: Cloudflare Workers AI
const generateWithCloudflareAI = async (prompt: string, config: AiConfig): Promise<string> => {
    // ðŸ”‘ Try dynamic key from vault first (token), then config
    const vaultKey = getSturdyKey('cloudflare');
    const apiToken = vaultKey || config.cloudflareApiToken;
    const accountId = config.cloudflareAccountId;

    if (!accountId || !apiToken) {
        throw new Error("Cloudflare: Account ID or API token missing");
    }

    // Model: Stable Diffusion XL Base 1.0
    const model = '@cf/stabilityai/stable-diffusion-xl-base-1.0';
    const targetUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`;

    try {
        const response = await fetch(`${CORS_PROXY_URL}${encodeURIComponent(targetUrl)}`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ prompt })
        });

        if (!response.ok) {
            const isFatal = response.status === 401 || response.status === 402 || response.status === 403;
            reportKeyFailure(apiToken, 'cloudflare', isFatal);
            throw new Error(`Cloudflare AI failed: ${response.status} ${await response.text()}`);
        }

        // Cloudflare returns binary image data
        const blob = await response.blob();
        const buffer = await blob.arrayBuffer();
        reportKeySuccess(apiToken);
        return arrayBufferToDataUri(buffer, blob.type);
    } catch (error: any) {
        if (!error.message.includes('missing')) {
            reportKeyFailure(apiToken, 'cloudflare', false);
        }
        throw error;
    }
};

// Provider 18: Infip.pro (OpenAI-compatible SDXL)
const generateWithInfip = async (prompt: string, config: AiConfig): Promise<string> => {
    const apiKey = config.infipApiKey;
    if (!apiKey) throw new Error("Infip.pro API Key missing");

    const response = await fetch(`${CORS_PROXY_URL}${encodeURIComponent('https://api.infip.pro/v1/images/generations')}`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            prompt: prompt,
            model: "juggernaut-xl", // Changed from v1-5 to juggernaut-xl which is often available
            n: 1,
            size: "1024x1024"
        })
    });

    if (!response.ok) {
        throw new Error(`Infip.pro failed: ${response.status} ${await response.text()}`);
    }

    const data = await response.json();
    const imageUrl = data.data?.[0]?.url;
    if (!imageUrl) throw new Error("Infip.pro returned no image URL");

    return fetchAndConvertToDataUri(`${CORS_PROXY_URL}${encodeURIComponent(imageUrl)}`);
};



// --- New Robust Hugging Face Models ---

// --- KEY HEALTH SYSTEM (Self-Healing) ---
const BLACKLISTED_KEYS = new Set<string>();

const getValidHFKey = () => {
    const validKeys = HF_KEYS.filter(k => !BLACKLISTED_KEYS.has(k));
    if (validKeys.length === 0) {
        console.warn("[Key System] âš ï¸ All keys blacklisted! Resetting pool.");
        BLACKLISTED_KEYS.clear();
        return HF_KEYS[0];
    }
    return validKeys[Math.floor(Math.random() * validKeys.length)];
};

const reportBadKey = (key: string) => {
    console.warn(`[Key System] ðŸš« Blacklisting invalid key: ${key.substring(0, 10)}...`);
    BLACKLISTED_KEYS.add(key);
};

// ðŸ§¼ --- PROMPT PURIFICATION ENGINE (The Cleaner) ---

/**
 * ØªÙ†Ø¸ÙŠÙ Ø§Ù„Ø¨Ø±ÙˆÙ…Ø¨Øª Ù…Ù† "Ø«Ø±Ø«Ø±Ø©" DeepSeek Ùˆ AI commentary
 * 
 * ÙŠØ²ÙŠÙ„:
 * - Ø§Ù„Ø¹Ø¨Ø§Ø±Ø§Øª Ø§Ù„ØªØ¹Ø±ÙŠÙÙŠØ©: "Enhanced Prompt:", "Here is", "Sure, here's"
 * - Ø§Ù„ØªÙ†Ø³ÙŠÙ‚: **Bold**, ### Headers, - Lists
 * - Ø§Ù„Ø¬Ù…Ù„ Ø§Ù„Ø¥Ø¹Ù„Ø§Ù†ÙŠØ©: "Heroic", "Majestic", "Epic"
 * - Ø¹Ù„Ø§Ù…Ø§Øª Ø§Ù„Ø§Ù‚ØªØ¨Ø§Ø³ ÙˆØ§Ù„Ø£Ø­Ø±Ù Ø§Ù„Ø®Ø§ØµØ©
 * 
 * ÙŠØ­ØªÙØ¸ Ø¨Ù€:
 * - Ø§Ù„ÙˆØµÙ Ø§Ù„Ø£Ø³Ø§Ø³ÙŠ ÙÙ‚Ø· (Core description)
 * - Ø§Ù„Ø³Ø·Ø± Ø§Ù„Ø£ÙˆÙ„ Ù…Ù† Ø£ÙŠ Ø¨Ø±ÙˆÙ…Ø¨Øª Ù…ØªØ¹Ø¯Ø¯ Ø§Ù„Ø£Ø³Ø·Ø±
 */
const cleanDeepSeekPrompt = (prompt: string): string => {
    let cleaned = prompt
        // 1. Ø¥Ø²Ø§Ù„Ø© Ø§Ù„Ø¹Ø¨Ø§Ø±Ø§Øª Ø§Ù„ØªØ¹Ø±ÙŠÙÙŠØ© (Declarative Sentences)
        .replace(/\*\*|Enhanced Prompt:|Here is|Prompt:|Description:|Analysis:|Sure,?|I've created|Here's a|Image prompt:/gi, '')

        // 2. Ø¥Ø²Ø§Ù„Ø© Ø§Ù„ØªÙ†Ø³ÙŠÙ‚ (Markdown Formatting)
        .replace(/^[#\-\*\>]+/gm, '')  // Headers, lists, quotes
        .replace(/\*\*[^*]+\*\*/g, '') // Bold text
        .replace(/\*([^*]+)\*/g, '$1') // Italic text (keep content only)

        // 3. Ø¥Ø²Ø§Ù„Ø© Ø¹Ù„Ø§Ù…Ø§Øª Ø§Ù„Ø§Ù‚ØªØ¨Ø§Ø³
        .replace(/["'`]/g, '')

        // 4. Ø¥Ø²Ø§Ù„Ø© Ø§Ù„ØµÙØ§Øª Ø§Ù„Ù…Ø¨Ø§Ù„Øº ÙÙŠÙ‡Ø§ (Heroic/Epic)
        .replace(/\b(heroic|epic|majestic|dramatic|cinematic|breathtaking|stunning|incredible)\b/gi, '')

        // 5. ØªÙ†Ø¸ÙŠÙ Ø§Ù„Ù…Ø³Ø§ÙØ§Øª ÙˆØ§Ù„Ø£Ø³Ø·Ø± Ø§Ù„Ù…ØªØ¹Ø¯Ø¯Ø©
        .replace(/\n+/g, ' ')  // Multi-line to single line
        .replace(/\s{2,}/g, ' ') // Multiple spaces to single
        .trim();

    // 6. Ø£Ø®Ø° Ø§Ù„Ø¬Ù…Ù„Ø© Ø§Ù„Ø£ÙˆÙ„Ù‰ ÙÙ‚Ø· Ø¥Ø°Ø§ ÙƒØ§Ù† Ø§Ù„Ø¨Ø±ÙˆÙ…Ø¨Øª Ø·ÙˆÙŠÙ„ Ø¬Ø¯Ø§Ù‹ (> 300 chars)
    if (cleaned.length > 300) {
        const firstSentence = cleaned.split(/\.|!|\?/)[0];
        if (firstSentence.length > 50) {
            cleaned = firstSentence + '.';
        }
    }

    return cleaned;
};


// Helper for generic HF Inference with Auto-Retry
const generateWithHfModel = async (prompt: string, config: AiConfig, model: string): Promise<string> => {
    // Try up to 2 times with different keys
    let attempts = 0;
    const maxAttempts = 2;

    while (attempts < maxAttempts) {
        const apiKey = config.huggingFaceApiKey || getValidHFKey();
        try {
            return await fetchAndConvertToDataUri(`${CORS_PROXY_URL}${encodeURIComponent(`https://api-inference.huggingface.co/models/${model}`)}`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'x-use-cache': 'false' },
                body: JSON.stringify({ inputs: prompt })
            });
        } catch (error: any) {
            // Check for Auth errors
            if (error.message.includes('401') || error.message.includes('403')) {
                reportBadKey(apiKey);
                attempts++;
                if (attempts === maxAttempts) throw error;
                console.log(`[Key System] Retrying with fresh key...`);
                continue;
            }
            throw error;
        }
    }
    throw new Error("HF Model Generation Failed");
};

/* --- GLOBAL BEAST POOL (No-Key / Inference) --- */
// 1. Hunyuan (The Chinese Dragon - Food/Recipe Specialist)
const generateWithHunyuan = async (prompt: string, config: AiConfig): Promise<string> => {
    // Falls back to SiliconFlow if key present, else tries free HF Space via proxy logic
    if (config.siliconFlowApiKey) {
        try { return await generateWithSiliconFlow(prompt, config, "Tencent-Hunyuan/HunyuanDiT"); }
        catch (e) { console.warn("SiliconFlow Hunyuan failed, trying HF...", e); }
    }
    // HF Free Tier Fallback for Hunyuan (if available) or standard SDXL
    return generateWithHfModel(prompt, config, 'Tencent-Hunyuan/HunyuanDiT');
};

// 2. Kandinsky 3.1 (The Russian Bear - Illustration/How-To)
const generateWithKandinsky = async (prompt: string, config: AiConfig): Promise<string> => {
    return generateWithHfModel(prompt, config, 'kandinsky-community/kandinsky-3');
};

// 3. Flux.1 (The Text Master - Best Of/Product)
const generateWithFluxSchnell = async (prompt: string, config: AiConfig): Promise<string> => {
    // Try SiliconFlow first for speed
    if (config.siliconFlowApiKey) {
        try { return await generateWithSiliconFlow(prompt, config, "black-forest-labs/FLUX.1-schnell"); }
        catch (e) { console.warn("SiliconFlow Flux failed, trying HF...", e); }
    }
    return generateWithHfModel(prompt, config, 'black-forest-labs/FLUX.1-schnell');
};

/* --- END BEAST POOL --- */

// 1. Flux Dev (Nebius/HF)
const generateWithFluxDev = async (prompt: string, config: AiConfig): Promise<string> => {
    return generateWithHfModel(prompt, config, 'black-forest-labs/FLUX.1-dev');
};

// 2. SDXL (Nscale)
const generateWithSDXLNscale = async (prompt: string, config: AiConfig): Promise<string> => {
    return generateWithHfModel(prompt, config, 'stabilityai/stable-diffusion-xl-base-1.0');
};

// 3. Hunyuan (Fal-ai)
const generateWithSD35 = async (prompt: string, config: AiConfig): Promise<string> => {
    return generateWithHfModel(prompt, config, 'stabilityai/stable-diffusion-3.5-large');
};

// 4. Qwen Lightning (Fal-ai)
const generateWithQwenLightning = async (prompt: string, config: AiConfig): Promise<string> => {
    return generateWithHfModel(prompt, config, 'lightx2v/Qwen-Image-Lightning');
};

// 5. FLUX.2-dev (Fal-ai provider) - High quality text-to-image
const generateWithFlux2Dev = async (prompt: string, config: AiConfig): Promise<string> => {
    return generateWithHfModel(prompt, config, 'black-forest-labs/FLUX.2-dev');
};

// 6. Technically-Color-Z-Image-Turbo (Wavespeed provider)
const generateWithColorTurbo = async (prompt: string, config: AiConfig): Promise<string> => {
    return generateWithHfModel(prompt, config, 'renderartist/Technically-Color-Z-Image-Turbo');
};

// 7. iPhone_realism (Fal-ai provider)
// 7. iPhone_realism (Highest realism for mobile-style shots)
const generateWithiPhoneRealism = async (prompt: string, config: AiConfig): Promise<string> => {
    return generateWithHfModel(prompt, config, '00quebec/iPhone_realism');
};

// 11. Kolors (Chinese - Incredible Realism)
// 11. Kolors (Chinese - Incredible Realism) - Tries SiliconFlow first, then HF Fallback
const generateWithKolors = async (prompt: string, config: AiConfig): Promise<string> => {
    // Try SiliconFlow first if available (Faster & Better)
    if (config.siliconFlowApiKey) {
        try {
            return await generateWithSiliconFlow(prompt, config, "kwai/Kolors");
        } catch (e) { console.warn("SiliconFlow Kolors failed, trying HF...", e); }
    }

    // HF Fallback (Use SD 1.5 - The most reliable 1.0 generation model on free tier)
    return generateWithHfModel(prompt, config, 'runwayml/stable-diffusion-v1-5');
};

// 12. CogView3Plus-3B (Chinese - Strong Composition)
const generateWithCogView = async (prompt: string, config: AiConfig): Promise<string> => {
    // Try SiliconFlow first
    if (config.siliconFlowApiKey) {
        try {
            return await generateWithSiliconFlow(prompt, config, "THUDM/CogView3-Plus-3B");
        } catch (e) { console.warn("SiliconFlow CogView failed, trying HF...", e); }
    }

    return generateWithHfModel(prompt, config, 'runwayml/stable-diffusion-v1-5');
};

// 8. SRPO (Fal-ai provider)
const generateWithSRPO = async (prompt: string, config: AiConfig): Promise<string> => {
    return generateWithHfModel(prompt, config, 'tencent/SRPO');
};

// 9. Storyboard-Sketch (Fal-ai provider)
const generateWithStoryboardSketch = async (prompt: string, config: AiConfig): Promise<string> => {
    return generateWithHfModel(prompt, config, 'blink7630/storyboard-sketch');
};

// 10. Realism Engine (Hugging Face)
const generateWithRealismEngine = async (prompt: string, config: AiConfig): Promise<string> => {
    return generateWithHfModel(prompt, config, 'AS-S/Realism_Engine_SDXL');
};



// 13. SILICONFLOW (The Monster Engine - Kolors, DeepSeek, etc.)
const generateWithSiliconFlow = async (prompt: string, config: AiConfig, model: string = "kwai/Kolors"): Promise<string> => {
    if (!config.siliconFlowApiKey) throw new Error("SiliconFlow API Key missing");

    const response = await fetch(`${CORS_PROXY_URL}${encodeURIComponent('https://api.siliconflow.cn/v1/images/generations')}`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${config.siliconFlowApiKey}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            model: model,
            prompt: prompt,
            image_size: "1024x1024",
            batch_size: 1,
            num_inference_steps: 30,
            guidance_scale: 5
        })
    });

    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`SiliconFlow Error (${response.status}): ${errText}`);
    }

    const data = await response.json();
    if (data.images && data.images[0] && data.images[0].url) {
        return fetchAndConvertToDataUri(`${CORS_PROXY_URL}${encodeURIComponent(data.images[0].url)}`);
    }
    throw new Error("SiliconFlow returned no image URL");
};

// =====================================
// ðŸ§  INTELLIGENT PROMPT ENHANCEMENT
// =====================================
/**
 * Extracts meaningful content from raw prompts that may contain article titles
 * Example: "Easy Lemon Bars: Prepare the eggplant" â†’ "Preparing eggplant slices, food preparation"
 */
const extractContentFromPrompt = (rawPrompt: string): { main: string, context: string } => {
    // Split by colon to separate title from content
    const parts = rawPrompt.split(':').map(p => p.trim());

    if (parts.length >= 2) {
        return {
            main: parts.slice(1).join(': '),  // Everything after first colon
            context: parts[0]  // Title before colon
        };
    }

    return { main: rawPrompt, context: '' };
};

const isStepLockedPrompt = (prompt: string): boolean => {
    const text = String(prompt || '');
    return /Step-locked documentary food photography|STEP-LOCKED FOOD ACTION|Stage:\s*(prep|mix|form|cook|serve|generic)/i.test(text);
};

const extractLockedStage = (prompt: string): 'prep' | 'mix' | 'form' | 'cook' | 'serve' | 'generic' => {
    const match = String(prompt || '').match(/Stage:\s*(prep|mix|form|cook|serve|generic)/i);
    const stage = (match?.[1] || '').toLowerCase();
    if (stage === 'prep' || stage === 'mix' || stage === 'form' || stage === 'cook' || stage === 'serve') {
        return stage;
    }
    return 'generic';
};

const buildStageAwareNegativePrompt = (stage: 'prep' | 'mix' | 'form' | 'cook' | 'serve' | 'generic'): string => {
    const base =
        'illustration, drawing, painting, cartoon, anime, sketch, digital art, water color, 3d render, cgi, low quality, blurry, watermark, text, logo, unrealistic, signature, ugly, deformed, malformed hands, extra fingers';

    if (stage === 'serve') return base;
    if (stage === 'cook') {
        return `${base}, final plated hero dish, restaurant serving presentation, stylized garnish hero shot`;
    }

    return `${base}, final plated hero dish, restaurant serving presentation, fully cooked patties, crispy browned crust, char marks, ready-to-eat serving plate`;
};

/**
 * Enhances a raw prompt with professional photography keywords
 * Prevents random image generation by adding specific, context-aware descriptors
 */
const enhancePromptForImageGeneration = (
    rawPrompt: string,
    type: 'hero' | 'step' | 'product',
    blueprint: string
): string => {
    if (type === 'step' && isStepLockedPrompt(rawPrompt)) {
        // Preserve strict stage-locked prompt from recipeStepPromptEngine.
        return String(rawPrompt || '').trim();
    }

    const { main, context } = extractContentFromPrompt(rawPrompt);

    // Clean up the main content
    // START FIX: Only clean "hands/action" for Hero and Product images. 
    // For Steps, we WANT to see hands and action!
    let cleanMain = main.trim();

    if (type !== 'step') {
        cleanMain = main
            .replace(/\b(holding|held|hand|hands|finger|fingers|touching|lifting|grabbing|using)\b/gi, "")
            .replace(/unboxing/gi, "product on table")
            .trim();
    }
    // END FIX

    // Blueprint-specific styling
    const isFood = blueprint === 'recipe' || blueprint === 'food' || context.toLowerCase().includes('recipe') ||
        cleanMain.toLowerCase().match(/\\b(cook|bake|ingredient|dish|food|dessert)\\b/);

    const isTech = blueprint === 'review' || blueprint === 'tech' ||
        cleanMain.toLowerCase().match(/\\b(pc|computer|hardware|electronics|component)\\b/);

    // Type-specific enhancement
    if (type === 'hero') {
        if (isFood) {
            return `Professional food photography of ${cleanMain}, delicious ${context.toLowerCase()}, high resolution 8k, studio lighting, appetizing presentation, vibrant colors, shallow depth of field, commercial quality`;
        } else if (isTech) {
            return `Professional tech photography of ${cleanMain}, modern technology, high resolution 8k, clean studio lighting, sharp focus, minimalist background, commercial quality`;
        } else {
            return `Professional commercial photography of ${cleanMain}, ${context.toLowerCase()}, high resolution 8k, studio lighting, premium quality, cinematic composition`;
        }
    } else if (type === 'step') {
        const detectFoodStepStage = (text: string): 'prep' | 'mix' | 'form' | 'cook' | 'serve' | 'generic' =>
            detectRecipeStepStage(text) as 'prep' | 'mix' | 'form' | 'cook' | 'serve' | 'generic';

        const stage = detectFoodStepStage(cleanMain);
        if (isFood) {
            let stageRules = 'Show one exact food-preparation action only.';
            if (stage === 'prep') {
                stageRules = 'Preparation stage only: show raw ingredients being arranged/measured/cut. DO NOT show cooked or plated final dish.';
            } else if (stage === 'mix') {
                stageRules = 'Mixing stage only: show ingredients being combined in bowl/pan. DO NOT show finished plated dish.';
            } else if (stage === 'form') {
                stageRules = 'Forming stage only: show uncooked portions/patties being shaped by hand. DO NOT show browning, sear marks, or plated final dish.';
            } else if (stage === 'cook') {
                stageRules = 'Cooking stage only: show in-progress heat/pan/oven process. DO NOT show final serving shot.';
            } else if (stage === 'serve') {
                stageRules = 'Serving stage: show final plated food and garnish.';
            }
            return `STEP-LOCKED FOOD ACTION: ${cleanMain}. ${stageRules} SHOW: realistic utensils and ingredients matching the step. DO NOT SHOW: unrelated proteins/ingredients, wrong fish species, random finished dish unless serving stage. STYLE: Macro kitchen photography, high-end realism, 8k resolution, cinematic lighting, shallow depth of field.`;
        } else if (isTech) {
            return `STRICT TECHNICAL ACTION: ${cleanMain}. 
                    SHOW: hands assembling components, tools in use, exploded view, macro detail. 
                    DO NOT SHOW: finished product, box art, retail packaging. 
                    STYLE: Technical macro photography, bright studio lighting, instructional diagram style.`;
        } else {
            return `STRICT PROCESS SHOT: ${cleanMain}. 
                    SHOW: work in progress, hands doing the task, raw materials, tools. 
                    DO NOT SHOW: finished result, completed project. 
                    STYLE: Educational photography, clear focus, 8k resolution, neutral background.`;
        }
    } else { // product
        return `Professional product photography of ${cleanMain}, ${context.toLowerCase()}, clean white background, 8k resolution, studio lighting, commercial amazon-style presentation, centered composition`;
    }
};

/**
 * ðŸ‹ STEP-TO-IMAGE MAPPING
 * Extracts rich visual context from step descriptions to prevent generic/empty prompts
 * Example: "Step 2: Mix butter and sugar until creamy" â†’ 
 *          "Close-up food photography of mixing butter and sugar until creamy, 
 *           part of lemon bars dessert cooking process..."
 */
const generateStepPrompt = (
    stepContent: string,
    articleContext: string,
    blueprint: string
): string => {
    // Extract action words and ingredients from step content
    const actionWords = stepContent.match(/\b(mix|blend|stir|pour|bake|whisk|beat|fold|spread|layer|cut|slice|prepare|cook|heat|chill|combine|add)\b/gi);
    const ingredientHints = stepContent.match(/\b(butter|sugar|flour|egg|lemon|cream|milk|chocolate|vanilla|oil|spice|herb|vegetable|fruit|meat|cheese)\b/gi);

    const isFood = blueprint === 'recipe' || blueprint === 'food' ||
        articleContext.toLowerCase().match(/\b(recipe|cook|bake|dessert|dish|food)\b/);

    const isTech = blueprint === 'review' || blueprint === 'tech' ||
        articleContext.toLowerCase().match(/\b(pc|computer|hardware|install|component)\b/);

    const detectFoodStepStage = (text: string): 'prep' | 'mix' | 'form' | 'cook' | 'serve' | 'generic' =>
        detectRecipeStepStage(text) as 'prep' | 'mix' | 'form' | 'cook' | 'serve' | 'generic';
    const stage = detectFoodStepStage(stepContent);

    // Build rich contextual prompt
    let base = `${stepContent}`;

    if (isFood) {
        const cookingContext = actionWords?.length ? `${actionWords.join(', ')} process` : 'cooking process';
        const ingredientContext = ingredientHints?.length ? `featuring ${ingredientHints.slice(0, 3).join(', ')}` : '';
        const nonFreshCue = /\b(canned|tinned|jarred|preserved|drained|flaked|frozen|dried|powdered)\b/i.test(`${stepContent} ${articleContext}`);
        let stageRules = 'Show exactly the action in this step only.';
        if (stage === 'prep') {
            stageRules = 'Preparation stage only: show raw ingredients being arranged or cut. DO NOT show cooked/final plated dish.';
        } else if (stage === 'mix') {
            stageRules = 'Mixing stage only: show ingredients being combined. DO NOT show final plated dish.';
        } else if (stage === 'form') {
            stageRules = 'Forming stage only: show uncooked portions/patties being shaped. DO NOT show browned crust, frying, or final plated dish.';
        } else if (stage === 'cook') {
            stageRules = 'Cooking stage only: show in-progress cooking. DO NOT show final serving presentation.';
        } else if (stage === 'serve') {
            stageRules = 'Serving stage: show final plated presentation.';
        }
        const stateLock = nonFreshCue
            ? 'STATE LOCK: keep preserved/canned/frozen texture exactly as instructed; do not replace with fresh raw fillets or fresh whole produce.'
            : '';

        return `STEP-LOCKED FOOD ACTION: ${base}. ${stageRules} ${stateLock} SHOW: ${cookingContext} ${ingredientContext}. DO NOT SHOW: unrelated ingredients or wrong species substitution. STYLE: Macro kitchen photography, high-end realism, 8k resolution, cinematic lighting, shallow depth of field.`;
    } else if (isTech) {
        return `Technical instructional photograph showing ${base}, part of ${articleContext} guide, 
                detailed close-up, 8k resolution, clear component visibility, professional tech photography, 
                clean background, instructional diagram style`;
    } else {
        return `STRICT ACTION SHOT: ${base}. 
                SHOW: hands doing the work, tools in use, work in progress state, macro detail.
                DO NOT SHOW: finished product, final result.
                STYLE: Educational photography, clear focus, 8k resolution, neutral background.`;
    }
};

/**
 * ðŸ›¡ï¸ PROMPT VALIDATION INTERCEPTOR
 * Prevents sending empty/generic prompts to AI models that cause random image generation
 */
const validatePrompt = (prompt: string, articleTitle: string): { isValid: boolean, reason?: string } => {
    // Check minimum length
    if (!prompt || prompt.trim().length < 5) {
        return { isValid: false, reason: 'Prompt is empty or too short' };
    }

    // Check if prompt contains at least 2 meaningful words (not just articles/prepositions)
    const meaningfulWords = prompt.match(/\b[a-z]{4,}\b/gi);
    if (!meaningfulWords || meaningfulWords.length < 2) {
        return { isValid: false, reason: 'Prompt lacks meaningful keywords' };
    }

    // Check if prompt is just a generic word like "image", "photo", "picture"
    const genericTerms = /^(image|photo|picture|illustration|graphic)s?$/i;
    if (genericTerms.test(prompt.trim())) {
        return { isValid: false, reason: 'Prompt is too generic' };
    }

    // Check if prompt has some relation to article (at least 1 common word)
    const promptWords = new Set(prompt.toLowerCase().match(/\b[a-z]{4,}\b/g) || []);
    const titleWords = new Set(articleTitle.toLowerCase().match(/\b[a-z]{4,}\b/g) || []);
    const commonWords = [...promptWords].filter(w => titleWords.has(w));

    if (commonWords.length === 0 && articleTitle.length > 10) {
        console.warn(`[Prompt Validator] âš ï¸ Prompt has no common words with article title. This may cause mismatched images.`);
        // Don't block, just warn - some valid prompts may not share words
    }

    return { isValid: true };
};

// --- MAIN GENERATION FUNCTION ---

export const generateImageSmartly = async (
    prompt: string,
    type: 'hero' | 'step' | 'product',
    blueprint: string,
    config: AiConfig
): Promise<string> => {
    // 0. SAFETY CONFIG
    const safeConfig = config || {
        geminiApiKey: '',
        imageProvider: 'free_tier',
        productImageSource: 'amazon'
    } as AiConfig;

    const hasStockImageKey = (cfg: AiConfig): boolean => {
        const provider = cfg.stockImageProvider;
        if (!provider || provider === 'none') return false;
        if (provider === 'pexels') return !!cfg.pexelsApiKey?.trim();
        if (provider === 'unsplash') return !!cfg.unsplashApiKey?.trim();
        if (provider === 'pixabay') return !!cfg.pixabayApiKey?.trim();
        return false;
    };

    // --- ðŸš€ NEW: Smart Hybrid Mode (Stock Images) ---
    // If configured, try to find a real image first for Steps/Ingredients
    // This solves the issue of AI struggling with specific real-world items or "ugly" food results.
    if (type === 'step' && safeConfig.stockImageProvider && safeConfig.stockImageProvider !== 'none' && hasStockImageKey(safeConfig)) {
        try {
            const { searchStockImages } = await import('./stockImageService');
            // Clean prompt for search - remove AI directives
            const cleanQuery = prompt
                .replace(/^Action shot of/i, '')
                .replace(/^Close-up of/i, '')
                .replace(/cinematic lighting.*$/i, '')
                .replace(/photorealistic.*$/i, '')
                .trim();

            const stockImages = await searchStockImages(cleanQuery, safeConfig, 1); // Limit 1 for auto-mode
            if (stockImages && stockImages.length > 0) {
                const bestMatch = stockImages[0];
                console.log(`[Smart Gateway] ðŸ“¸ Found Real Stock Image from ${bestMatch.source} for "${cleanQuery}"`);
                return bestMatch.url;
            }
        } catch (e) {
            console.warn('[Smart Gateway] Stock image search failed, falling back to AI:', e);
        }
    }
    // ------------------------------------------------


    // Safety check for config
    const aiConfig = config || {} as AiConfig; // Fallback
    const niche = blueprint; // Alias for legacy logic compatibility if needed temporarily
    const normalizedBlueprint = String(blueprint || '').toLowerCase();
    const isRecipeVisual = normalizedBlueprint === 'recipe' || normalizedBlueprint === 'food';
    const hasStrictStepLock = type === 'step' && isStepLockedPrompt(prompt);

    // âœ¨ STEP 1: INTELLIGENT PROMPT ENHANCEMENT
    // Transform raw prompt (e.g., "Easy Lemon Bars: Prepare eggplant") 
    // into professional description (e.g., "Detailed close-up food photography showing prepare eggplant...")
    let intelligentPrompt = hasStrictStepLock
        ? String(prompt || '').trim()
        : enhancePromptForImageGeneration(prompt, type, blueprint);
    console.log('[Image Gen] ðŸŽ¯ Original:', prompt.substring(0, 60));
    console.log('[Image Gen] âœ¨ Enhanced:', intelligentPrompt.substring(0, 60));

    // ðŸ›¡ï¸ STEP 1.5: VALIDATE PROMPT (Interceptor)
    // Extract article title from prompt (before the colon)
    const articleTitle = prompt.split(':')[0]?.trim() || 'Article';
    const validation = hasStrictStepLock
        ? { isValid: true as const }
        : validatePrompt(intelligentPrompt, articleTitle);

    if (!validation.isValid) {
        console.error(`[Image Gen] âŒ PROMPT VALIDATION FAILED: ${validation.reason}`);
        console.error(`[Image Gen] ðŸš« Blocked invalid prompt: "${intelligentPrompt}"`);

        // Try using generateStepPrompt as fallback for step images
        if (type === 'step') {
            console.log('[Image Gen] ðŸ”„ Attempting Step-to-Image mapping fallback...');
            intelligentPrompt = generateStepPrompt(prompt, articleTitle, blueprint);
            console.log('[Image Gen] ðŸ‹ Step-mapped prompt:', intelligentPrompt.substring(0, 80));

            // Re-validate
            const revalidation = validatePrompt(intelligentPrompt, articleTitle);
            if (!revalidation.isValid) {
                throw new Error(`Cannot generate image: ${validation.reason}. Please provide more detailed step description.`);
            }
        } else {
            throw new Error(`Cannot generate image: ${validation.reason}. Prompt too generic or empty.`);
        }
    }

    console.log('[Image Gen] âœ… Prompt validation passed');

    // OPTIONAL: ENHANCE PROMPT WITH DEEPSEEK (Background - for additional refinement)
    const startTime = Date.now();
    let basePrompt = intelligentPrompt; // Start with our intelligent prompt instead of raw
    // Only use HuggingFace prompt enhancement when the user explicitly provides a key.
    // The legacy bundled token caused unstable behavior (410/blocked models) and low-quality outputs.
    const hfKey = aiConfig.huggingFaceApiKey;

    if (hfKey && !hasStrictStepLock) {
        try {
            // Only enhance reasonable length prompts to avoid recursion or excessive tokens
            if (intelligentPrompt.length < 500) {
                const enhanced = await enhancePromptWithDeepSeek(intelligentPrompt, hfKey);
                if (enhanced && enhanced.length > 10) {
                    basePrompt = enhanced;
                    console.log('[Image Gen] DeepSeek Enhanced Prompt:', basePrompt.substring(0, 50) + '...');
                }
            }
        } catch (e) {
            console.warn('[Image Gen] DeepSeek enhancement skipped:', e);
        }
    }

    // SANITIZE PROMPT: Remove action verbs that imply hands/humans
    // ðŸ”¥ SKIP for steps - we need hands for action shots!
    let sanitizedPrompt = basePrompt;
    if (type !== 'step') {
        sanitizedPrompt = basePrompt
            .replace(/\b(holding|held|hand|hands|finger|fingers|touching|lifting|grabbing|using|human|person|people|man|woman)\b/gi, "")
            .replace(/unboxing/gi, "product box sitting on a table");
    }

    let engineeredPrompt = sanitizedPrompt;
    let width = 1024;
    let height = 1024;
    let aspectRatio = "1:1";

    if (type === 'hero') {
        width = RESOLUTIONS.hero.width;
        height = RESOLUTIONS.hero.height;
        aspectRatio = "21:9";
        if (blueprint === 'recipe' || blueprint === 'food' || niche === 'food') {
            engineeredPrompt = `high-end food photography, 8k resolution, photorealistic, cinematic lighting, cinematic shot of ${basePrompt}. Authentic textures, hyper-detailed, shot on 35mm lens, f/2.8, no drawing, no illustration, appetizing presentation, vibrant natural colors.`;
        } else {
            engineeredPrompt = `Professional 8k photorealistic commercial photography, cinematic shot of ${basePrompt}. Authentic textures, hyper-detailed, shot on 35mm lens, f/2.8, no drawing, no illustration, expensive studio look, detailed textures.`;
        }
    } else if (type === 'step') {
        width = RESOLUTIONS.step.width;
        height = RESOLUTIONS.step.height;
        aspectRatio = "16:9";
        if (hasStrictStepLock) {
            engineeredPrompt = `${basePrompt} Keep strict stage lock. Do not beautify into a plated hero image.`;
        } else if (blueprint === 'recipe' || blueprint === 'food' || niche === 'food') {
            engineeredPrompt = `Professional 8k photorealistic macro food photography, cinematic shot of ${basePrompt}. Authentic textures, hyper-detailed, shot on 35mm lens, f/2.8, no drawing, no illustration, step-by-step detail.`;
        } else {
            engineeredPrompt = `Professional 8k photorealistic instructional photography, cinematic shot of ${basePrompt}. Authentic textures, hyper-detailed, shot on 35mm lens, f/2.8, no drawing, no illustration, technical focus.`;
        }
    } else { // product
        width = RESOLUTIONS.product.width;
        height = RESOLUTIONS.product.height;
        aspectRatio = "1:1";
        engineeredPrompt = `Professional 8k photorealistic product photography of a ${basePrompt}. Authentic textures, hyper-detailed, shot on 35mm lens, f/2.8, no drawing, no illustration, pure clean background, commercial quality.`;
    }

    const lockedStage = hasStrictStepLock ? extractLockedStage(engineeredPrompt || prompt) : 'generic';
    const negativePrompt =
        hasStrictStepLock
            ? buildStageAwareNegativePrompt(lockedStage)
            : `illustration, drawing, painting, cartoon, anime, sketch, digital art, water color, 3d render, cgi, fake texture, animated, stylized, low quality, transparent objects, floating artifacts, ghost objects, deformed whisk, distorted utensils, messy background, blurry, text, watermark, words, logo, unrealistic, signature, ugly, deformed, bad quality, mutated hands, extra fingers, malformed hands, poorly drawn hands, bad anatomy, missing fingers, floating limbs, disconnected limbs, mutation, amputation, extra limbs, human hands, holding, fingers`;

    // --- AGGRESSIVE POOL MANAGEMENT (The Hive Memory) ---
    const PROVIDER_HEALTH = new Map<string, boolean>(); // Tracks if a provider is alive
    let LAST_SUCCESSFUL_PROVIDER = ''; // The "Champion" provider to milk

    // Helper to banish weak providers
    const banishProvider = (name: string, reason: string) => {
        console.warn(`[Hive System] ðŸš« Banishing ${name}: ${reason}`);
        PROVIDER_HEALTH.set(name, false);
    };

    // --- BLUEPRINT STRATEGY (The Orchestrator Brain) ---
    // Maps blueprint/type to the absolute best "Beast" model
    let targetBeast = 'standard';
    let promptPrefix = '';

    // âœ… CRITICAL PRIORITY: Check Type FIRST before Blueprint
    // This ensures steps always use Flux/Action logic, even for Recipes
    if (type === 'step' || blueprint === 'how-to' || blueprint === 'guide' || blueprint === 'howto') {
        targetBeast = 'flux'; // Force Flux for steps as per user request
        promptPrefix = hasStrictStepLock
            ? ''
            : isRecipeVisual
                ? 'High-end food photography, macro shot, appetizing, 8k, realistic textures, studio lighting warm, '
                : 'High-end lifestyle editorial photography, real-world context, premium commercial lighting, photorealistic 8k, ';
    }
    else if (blueprint === 'recipe' || blueprint === 'food' || niche === 'food') {
        targetBeast = 'hunyuan'; // Recipes
        promptPrefix = 'High-end food photography, macro shot, appetizing, 8k, realistic textures, studio lighting warm, ';
    }
    else if (blueprint === 'review' || blueprint === 'best-of' || type === 'product' || niche.includes('tech')) {
        targetBeast = 'flux'; // Tech/Product
        promptPrefix = 'Product photography, clean background, high resolution, clear text labels, cinematic lighting, ';
    }

    // ðŸ§¼ STEP 1: ØªÙ†Ø¸ÙŠÙ Ø§Ù„Ø¨Ø±ÙˆÙ…Ø¨Øª Ù…Ù† ÙÙ„Ø³ÙØ© DeepSeek (Prompt Purification)
    const cleanedBasePrompt = hasStrictStepLock ? basePrompt : cleanDeepSeekPrompt(basePrompt);
    console.log(`[Image Gen] ðŸ§¼ Cleaned prompt: "${basePrompt.substring(0, 50)}..." â†’ "${cleanedBasePrompt.substring(0, 50)}..."`);

    // 2. Clean DeepSeek Markdown & Declarative Sentences (Legacy - kept for backwards compatibility)
    let cleanBasePrompt = cleanedBasePrompt;
    if (!hasStrictStepLock) {
        cleanBasePrompt = cleanedBasePrompt
            .replace(/\*\*|Enhanced Prompt:|Here is a prompt|Sure, here|I've created|Here's a prompt|Here is a description/gi, '')
            .replace(/^[#\-\*\>]+/gm, '') // Remove markdown list items/quotes
            .replace(/\*\*[^*]+\*\*/g, '') // Remove bolded text if it looks like a header (e.g. **Title**)
            .replace(/\n/g, ' ')
            .trim();
    }

    engineeredPrompt = hasStrictStepLock ? cleanBasePrompt : (promptPrefix + cleanBasePrompt);


    console.log(`[Image Gen] ðŸ§  Blueprint Strategy: ${targetBeast.toUpperCase()} selected for ${niche}/${type}`);

    // --- SMART ORCHESTRATOR POOLS ---

    // 1. Define Provider Pools with Blueprint Awareness
    const POOLS = {
        PREMIUM: [
            { name: 'Fal.ai', key: 'falApiKey', execute: (p: string, c: AiConfig) => generateWithFal(p, c) },
            { name: 'Leonardo.Ai', key: 'leonardoApiKey', execute: generateWithLeonardo },
            { name: 'Replicate', key: 'replicateApiKey', execute: generateWithReplicate },
            { name: 'Stability AI', key: 'stabilityApiKey', execute: generateWithStability },
        ],
        STABLE: [
            { name: 'Getimg.ai', key: 'getimgApiKey', execute: generateWithGetimg },
            { name: 'Infip.pro', key: 'infipApiKey', execute: (p: string, c: AiConfig) => generateWithInfip(p, c) },
            { name: 'Cloudflare Workers AI', key: 'cloudflareApiToken', execute: (p: string, c: AiConfig) => generateWithCloudflareAI(p, c) },
            { name: 'Picsart', key: 'picsartApiKey', execute: generateWithPicsart },
            { name: 'Prodia', key: 'prodiaApiKey', execute: generateWithProdia },
            { name: 'Segmind', key: 'segmindApiKey', execute: (p: string, c: AiConfig) => generateWithSegmind(p, c) },
            { name: 'Monster API', key: 'monsterApiToken', execute: (p: string, c: AiConfig) => generateWithMonsterApi(p, c) },
        ],
        // The "Unlimited" pool now adapts based on the Target Beast
        // The "Unlimited" pool now adapts based on the Target Beast
        UNLIMITED: [

            // 3. Authenticated Fallbacks
            { name: 'SiliconFlow (Kolors)', key: 'siliconFlowApiKey', execute: (p: string, c: AiConfig) => generateWithKolors(p, c) },
        ]
    };

    // 2. Select Plan Strategy (Default to Free/Unlimited if no keys)

    // We infer "Premium" if specific paid keys are present, otherwise "Free"
    const hasPremiumKeys = POOLS.PREMIUM.some(p => safeConfig[p.key as keyof AiConfig]);
    const hasStableKeys = POOLS.STABLE.some(p => safeConfig[p.key as keyof AiConfig]);

    let priorityList: any[] = [];

    if (hasPremiumKeys) {
        // PRO: Premium -> Stable -> Unlimited
        console.log(`[Image Gen] ðŸ’Ž Pro Tier Detected`);
        priorityList = [...POOLS.PREMIUM, ...POOLS.STABLE, ...POOLS.UNLIMITED];
    } else if (hasStableKeys) {
        // STANDARD: Stable -> Unlimited
        console.log(`[Image Gen] ðŸ’  Standard Tier Detected`);
        priorityList = [...POOLS.STABLE, ...POOLS.UNLIMITED];
    } else {
        // FREE: authenticated providers only
        console.log(`[Image Gen] ðŸ†“ Free Tier Detected`);
        // Priority list starts with the specific Blueprint Beast (already at top of UNLIMITED), then fallback
        priorityList = [...POOLS.UNLIMITED];
    }

    // 3. Sequential Execution with Aggressive Rotation
    // Filter out banned providers first
    let activeProviders = priorityList.filter(p => PROVIDER_HEALTH.get(p.name) !== false);

    // "Milk" the Champion: If we have a winner and it's compatible with current tier, try it first
    if (LAST_SUCCESSFUL_PROVIDER) {
        const champion = activeProviders.find(p => p.name === LAST_SUCCESSFUL_PROVIDER);
        if (champion) {
            // Move champion to front
            activeProviders = [champion, ...activeProviders.filter(p => p.name !== LAST_SUCCESSFUL_PROVIDER)];
            console.log(`[Hive System] ðŸ¥› Milking active champion: ${LAST_SUCCESSFUL_PROVIDER}`);
        }
    }

    for (const provider of activeProviders) {
        try {
            // Check if key exists (skip provider when key is missing)
            const keyVal = provider.key ? (safeConfig[provider.key as keyof AiConfig] as string) : "FREE";

            // If provider requires a key but it's missing/empty, skip
            if (provider.key && (!keyVal || keyVal === '')) continue;

            console.log(`[Image Gen] Attempting with: ${provider.name}...`);
            // Execute
            const result = await provider.execute(engineeredPrompt, safeConfig, width, height, aspectRatio);

            if (result && !isPlaceholderImageResult(result)) {
                console.log(`[Image Gen] âœ… Success with ${provider.name}`);
                // Crown the new Champion
                LAST_SUCCESSFUL_PROVIDER = provider.name;
                // Mark as healthy
                PROVIDER_HEALTH.set(provider.name, true);
                return result;
            }
            throw new Error(`${provider.name} returned placeholder/invalid image`);
        } catch (error: any) {
            const errMsg = error.message || '';
            console.warn(`[Image Gen] âš ï¸ ${provider.name} failed: ${errMsg}`);

            // AGGRESSIVE BANISHMENT: If Auth/Payment error, kill it for the session
            if (errMsg.includes('401') || errMsg.includes('402') || errMsg.includes('403') || errMsg.includes('quota') || errMsg.includes('payment')) {
                banishProvider(provider.name, errMsg);
            }
            continue;
        }
    }
    // Final fallback: safe gradient placeholder.
    console.warn('[Image Gen] All providers failed. Returning safe fallback image.');
    return getFallbackGradientImage(width, height);
};

// Strict free-provider priority used by App image chain:
// 1) SiliconFlow/HuggingFace Flux Schnell
// 2) SiliconFlow Kolors
export const generatePreferredFreeImage = async (
    prompt: string,
    type: 'hero' | 'step' | 'product',
    blueprint: string,
    config: AiConfig
): Promise<string> => {
    const safeConfig = config || {} as AiConfig;
    const engineeredPrompt = enhancePromptForImageGeneration(prompt, type, blueprint);
    const width = type === 'hero' ? RESOLUTIONS.hero.width : (type === 'step' ? RESOLUTIONS.step.width : RESOLUTIONS.product.width);
    const height = type === 'hero' ? RESOLUTIONS.hero.height : (type === 'step' ? RESOLUTIONS.step.height : RESOLUTIONS.product.height);
    const negativePrompt = `illustration, cartoon, anime, cgi, low quality, blurry, watermark, text, logo, distorted`;

    const attempts: Array<{ name: string; enabled: boolean; execute: () => Promise<string> }> = [
        {
            name: 'SiliconFlow/HuggingFace (FLUX.1-schnell)',
            enabled: Boolean(safeConfig.siliconFlowApiKey || safeConfig.huggingFaceApiKey),
            execute: () => generateWithFluxSchnell(engineeredPrompt, safeConfig),
        },
        {
            name: 'SiliconFlow/HuggingFace (Kolors)',
            enabled: Boolean(safeConfig.siliconFlowApiKey || safeConfig.huggingFaceApiKey),
            execute: () => generateWithKolors(engineeredPrompt, safeConfig),
        },
    ];

    const errors: string[] = [];

    for (const attempt of attempts) {
        if (!attempt.enabled) {
            errors.push(`${attempt.name}: skipped (missing keys)`);
            continue;
        }

        try {
            const result = await attempt.execute();
            if (result && result.trim() && !isPlaceholderImageResult(result)) {
                return result;
            }
            errors.push(`${attempt.name}: empty/placeholder response`);
        } catch (error: any) {
            errors.push(`${attempt.name}: ${error?.message || 'unknown error'}`);
        }
    }

    throw new Error(`Preferred free providers failed. ${errors.join(' | ')}`);
};

// Export main Smart Gateway function and helpers
export const generateImage = generateSmartImage; // Primary: Smart Gateway with Master Worker fallback
export { generateStepPrompt, validatePrompt }; // Helper functions



