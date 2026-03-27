declare global {
    interface Window {
        puter?: {
            ai?: {
                txt2img?: (input: unknown, options?: unknown) => Promise<unknown>;
            };
        };
    }
}

const PUTER_SCRIPT_SRC = 'https://js.puter.com/v2/';
let puterLoaderPromise: Promise<void> | null = null;

const isPuterReady = (): boolean => {
    return typeof window !== 'undefined' && typeof window.puter?.ai?.txt2img === 'function';
};

const parseAspectRatio = (value: string): { w: number; h: number } => {
    const normalized = value.trim().replace('x', ':');
    const [wRaw, hRaw] = normalized.split(':');
    const w = Number(wRaw);
    const h = Number(hRaw);
    if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) {
        return { w: 16, h: 9 };
    }
    return { w, h };
};

const extractImageSrc = (result: unknown): string => {
    if (typeof result === 'string' && result.trim()) {
        return result;
    }

    if (result && typeof result === 'object') {
        const asRecord = result as Record<string, unknown>;
        const src = asRecord.src;
        if (typeof src === 'string' && src.trim()) {
            return src;
        }
    }

    return '';
};

const getMinimumImageRequirements = (ratio: { w: number; h: number }) => {
    const ratioValue = ratio.w / ratio.h;
    if (Math.abs(ratioValue - 16 / 9) < 0.06) {
        return { minWidth: 1280, minHeight: 720, minBytes: 110 * 1024 };
    }
    if (Math.abs(ratioValue - 1) < 0.06) {
        return { minWidth: 1024, minHeight: 1024, minBytes: 95 * 1024 };
    }
    return { minWidth: 1024, minHeight: 768, minBytes: 90 * 1024 };
};

const getDataUriByteSize = (src: string): number | null => {
    const match = src.match(/^data:image\/[a-zA-Z0-9.+-]+;base64,(.+)$/);
    if (!match?.[1]) return null;
    const base64 = match[1];
    const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
    return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
};

const loadImageDimensions = async (src: string): Promise<{ width: number; height: number }> => {
    return await new Promise<{ width: number; height: number }>((resolve, reject) => {
        const image = new Image();
        image.onload = () => {
            const width = image.naturalWidth || 0;
            const height = image.naturalHeight || 0;
            if (width > 0 && height > 0) {
                resolve({ width, height });
                return;
            }
            reject(new Error('invalid image dimensions'));
        };
        image.onerror = () => reject(new Error('failed to decode generated image'));
        image.src = src;
    });
};

const getImageByteSize = async (src: string): Promise<number | null> => {
    const dataUriSize = getDataUriByteSize(src);
    if (dataUriSize !== null) {
        return dataUriSize;
    }

    try {
        const response = await fetch(src, { cache: 'no-store' });
        if (!response.ok) return null;
        const blob = await response.blob();
        return blob.size;
    } catch {
        return null;
    }
};

const validateImageQuality = async (
    src: string,
    ratio: { w: number; h: number }
): Promise<{ ok: boolean; reason?: string }> => {
    const requirements = getMinimumImageRequirements(ratio);
    const { width, height } = await loadImageDimensions(src);
    if (width < requirements.minWidth || height < requirements.minHeight) {
        return {
            ok: false,
            reason: `resolution ${width}x${height} below ${requirements.minWidth}x${requirements.minHeight}`,
        };
    }

    const bytes = await getImageByteSize(src);
    if (typeof bytes === 'number' && bytes < requirements.minBytes) {
        return {
            ok: false,
            reason: `file size ${bytes} bytes below ${requirements.minBytes}`,
        };
    }

    return { ok: true };
};

export const ensurePuterLoaded = async (): Promise<void> => {
    if (isPuterReady()) return;
    if (typeof window === 'undefined' || typeof document === 'undefined') {
        throw new Error('Puter is only available in browser runtime.');
    }

    if (!puterLoaderPromise) {
        puterLoaderPromise = new Promise<void>((resolve, reject) => {
            const existing = document.querySelector(`script[src="${PUTER_SCRIPT_SRC}"]`) as HTMLScriptElement | null;
            if (existing) {
                if (isPuterReady()) {
                    resolve();
                    return;
                }
                existing.addEventListener('load', () => resolve(), { once: true });
                existing.addEventListener('error', () => reject(new Error('Failed to load Puter.js script.')), { once: true });
                return;
            }

            const script = document.createElement('script');
            script.src = PUTER_SCRIPT_SRC;
            script.async = false;
            script.defer = false;
            script.addEventListener('load', () => resolve(), { once: true });
            script.addEventListener('error', () => reject(new Error('Failed to load Puter.js script.')), { once: true });
            document.head.appendChild(script);
        });
    }

    await puterLoaderPromise;
    if (!isPuterReady()) {
        throw new Error('Puter.js loaded but puter.ai.txt2img is unavailable.');
    }
};

export const generatePuterImage = async (
    prompt: string,
    options?: {
        aspectRatio?: string;
        quality?: 'hd' | 'high';
    }
): Promise<string> => {
    await ensurePuterLoaded();

    const txt2img = window.puter?.ai?.txt2img;
    if (typeof txt2img !== 'function') {
        throw new Error('Puter txt2img is not available.');
    }

    const sanitizedPrompt = prompt.trim();
    if (!sanitizedPrompt) {
        throw new Error('Image prompt is empty.');
    }

    const ratio = parseAspectRatio(options?.aspectRatio || '16:9');
    const aspectRatioText = `${ratio.w}:${ratio.h}`;
    const strategies: Array<{
        name: string;
        invoke: () => Promise<unknown>;
    }> = [
        {
            name: 'together:flux-1.1-pro',
            invoke: () => txt2img(sanitizedPrompt, {
                provider: 'together',
                model: 'black-forest-labs/FLUX.1.1-pro',
                quality: 'hd',
                aspect_ratio: aspectRatioText,
                steps: 32,
            }),
        },
        {
            name: 'openai:dall-e-3',
            invoke: () => txt2img(sanitizedPrompt, {
                provider: 'openai-image-generation',
                model: 'dall-e-3',
                quality: 'hd',
                ratio: { w: ratio.w, h: ratio.h },
            }),
        },
        {
            name: 'together:stable-diffusion-3-large',
            invoke: () => txt2img(sanitizedPrompt, {
                provider: 'together',
                model: 'stabilityai/stable-diffusion-3.5-large',
                aspect_ratio: aspectRatioText,
                steps: 40,
            }),
        },
    ];

    const errors: string[] = [];

    for (const strategy of strategies) {
        try {
            const result = await strategy.invoke();
            const src = extractImageSrc(result);
            if (src) {
                const qualityResult = await validateImageQuality(src, ratio);
                if (!qualityResult.ok) {
                    errors.push(`${strategy.name}: quality shield rejected (${qualityResult.reason})`);
                    continue;
                }
                return src;
            }
            errors.push(`${strategy.name}: empty image response`);
        } catch (error: any) {
            errors.push(`${strategy.name}: ${error?.message || 'unknown error'}`);
        }
    }

    throw new Error(`Puter image generation failed across all strategies. ${errors.join(' | ')}`);
};
