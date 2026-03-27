import type { AiConfig } from '../types';

type ImageType = 'hero' | 'step' | 'product';
type StepStage = 'prep' | 'mix' | 'form' | 'cook' | 'serve' | 'generic';

const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const CORS_PROXY_URL = isLocal
    ? "http://localhost:5000/api/proxy?url="
    : "/api/proxy.php?url=";
const DEFAULT_WORKER_ENDPOINT = 'https://api.postgeniuspro.com/generate';
const FALLBACK_WORKER_ENDPOINT = 'https://postgeniuspro-image-api.larbilife.workers.dev/generate';

const toDataUri = (buffer: ArrayBuffer, mimeType: string): string => {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    const base64 = window.btoa(binary);
    return `data:${mimeType};base64,${base64}`;
};

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

const getResolution = (type: ImageType, aspectRatio: string): { width: number; height: number } => {
    const ratio = parseAspectRatio(aspectRatio);
    if (type === 'hero') {
        return { width: 1536, height: Math.round(1536 * (ratio.h / ratio.w)) };
    }
    if (type === 'step') {
        return { width: 1280, height: Math.round(1280 * (ratio.h / ratio.w)) };
    }
    return { width: 1024, height: 1024 };
};

const buildWorkerEndpoint = (raw: string): string => {
    const trimmed = raw.trim();
    if (!trimmed) return DEFAULT_WORKER_ENDPOINT;
    try {
        const url = new URL(trimmed);
        if (url.pathname === '/' || url.pathname === '') {
            url.pathname = '/generate';
        }
        return url.toString();
    } catch {
        return trimmed;
    }
};

const looksLikeDataUri = (value: string): boolean => /^data:image\/[a-zA-Z0-9.+-]+;base64,/.test(value);

interface WorkerValidationFeedback {
    pass?: boolean;
    needsRetry?: boolean;
    reason?: string;
    detectedStage?: string;
    labels?: string[];
    raw?: any;
}

interface WorkerImageResult {
    imageDataUri: string;
    validation?: WorkerValidationFeedback;
}

const getWorkerQualityProfile = (type: ImageType, stage: StepStage): string => {
    if (type === 'hero') return 'studio-premium';
    if (type === 'product') return 'product-premium';
    if (stage === 'prep' || stage === 'mix' || stage === 'form') return 'editorial-prep';
    if (stage === 'cook') return 'editorial-cook';
    if (stage === 'serve') return 'editorial-serve';
    return 'editorial-balanced';
};

const urlToDataUri = async (url: string): Promise<string> => {
    const direct = await fetch(url).catch(() => null);
    if (direct && direct.ok) {
        const blob = await direct.blob();
        const buf = await blob.arrayBuffer();
        return toDataUri(buf, blob.type || 'image/png');
    }

    const proxied = await fetch(`${CORS_PROXY_URL}${encodeURIComponent(url)}`);
    if (!proxied.ok) {
        throw new Error(`Failed to fetch worker image URL (HTTP ${proxied.status})`);
    }
    const blob = await proxied.blob();
    const buf = await blob.arrayBuffer();
    return toDataUri(buf, blob.type || 'image/png');
};

const parseWorkerValidation = (json: any): WorkerValidationFeedback | undefined => {
    const candidate = json?.validation || json?.vision_validation || json?.checks;
    if (!candidate || typeof candidate !== 'object') return undefined;
    return {
        pass: typeof candidate.pass === 'boolean' ? candidate.pass : undefined,
        needsRetry: typeof candidate.needs_retry === 'boolean'
            ? candidate.needs_retry
            : (typeof candidate.needsRetry === 'boolean' ? candidate.needsRetry : undefined),
        reason: typeof candidate.reason === 'string' ? candidate.reason : undefined,
        detectedStage: typeof candidate.detected_stage === 'string'
            ? candidate.detected_stage
            : (typeof candidate.detectedStage === 'string' ? candidate.detectedStage : undefined),
        labels: Array.isArray(candidate.labels) ? candidate.labels.map((x: any) => String(x)) : undefined,
        raw: candidate,
    };
};

const parseWorkerJsonImage = async (json: any): Promise<WorkerImageResult> => {
    if (json?.success === false) {
        throw new Error(json?.error || json?.details || 'Cloudflare Worker returned success=false');
    }

    const validation = parseWorkerValidation(json);

    const dataUri = json?.dataUri || json?.image_data_uri || json?.imageDataUri || json?.image;
    if (typeof dataUri === 'string' && dataUri.trim()) {
        if (looksLikeDataUri(dataUri)) {
            return { imageDataUri: dataUri, validation };
        }
        if (/^[A-Za-z0-9+/=]+$/.test(dataUri.trim())) {
            return { imageDataUri: `data:image/png;base64,${dataUri.trim()}`, validation };
        }
    }

    const b64 = json?.base64 || json?.b64_json || json?.image_base64 || json?.imageBase64 || json?.result?.image;
    if (typeof b64 === 'string' && b64.trim()) {
        return { imageDataUri: `data:image/png;base64,${b64}`, validation };
    }

    const url = json?.url || json?.imageUrl || json?.image_url || json?.result?.url;
    if (typeof url === 'string' && url.trim()) {
        return { imageDataUri: await urlToDataUri(url), validation };
    }

    throw new Error('Cloudflare Worker returned no image payload');
};

const detectStepStageFromPrompt = (prompt: string): StepStage => {
    const text = String(prompt || '').toLowerCase();
    const explicit = text.match(/stage:\s*(prep|mix|form|cook|serve|generic)/i)?.[1]?.toLowerCase();
    if (explicit === 'prep' || explicit === 'mix' || explicit === 'form' || explicit === 'cook' || explicit === 'serve') {
        return explicit;
    }
    if (/\b(serve|plate|garnish|finish|top with|drizzle)\b/.test(text)) return 'serve';
    if (/\b(cook|bake|roast|fry|sear|simmer|boil|grill|air fry|broil)\b/.test(text)) return 'cook';
    if (/\b(form|shape|portion|patty|patties|press|roll)\b/.test(text)) return 'form';
    if (/\b(mix|combine|stir|whisk|fold|blend|marinate|season)\b/.test(text)) return 'mix';
    if (/\b(gather|measure|mise en place|drain|mince|chop|slice|dice|rinse|prep|prepare)\b/.test(text)) return 'prep';
    return 'generic';
};

const isEarlyStepStage = (stage: StepStage): boolean => stage === 'prep' || stage === 'mix' || stage === 'form';

const buildStepAwarePrompt = (prompt: string, stage: StepStage, attempt: number): string => {
    if (!isEarlyStepStage(stage)) return prompt;
    const stageClues = stage === 'prep'
        ? 'raw ingredients separated, measured portions, opened cans/jars when relevant, no cooked texture'
        : stage === 'mix'
            ? 'uncooked mixture in bowl, wet/sticky in-progress texture, no crust or browning'
            : 'hands shaping uncooked portions/patties on tray or parchment, pale uncooked surface';
    const strictBoost = attempt > 1
        ? 'MANDATORY RETRY RULE: absolutely no cooked food, no plated dish, no browning, no final result, no hero food styling.'
        : '';
    return `${prompt} RAW/UNCOOKED STAGE LOCK: show only in-progress preparation for stage "${stage}". REQUIRED VISUAL CLUES: ${stageClues}. ${strictBoost}`.trim();
};

const buildWorkerNegativePrompt = (type: ImageType, stage: StepStage): string => {
    const base = 'cartoon, anime, illustration, cgi, low quality, blurry, watermark, text, logo';
    if (type !== 'step') return base;
    if (isEarlyStepStage(stage)) {
        return `${base}, cooked, fried, golden brown, plated meal, final dish, restaurant presentation, sear marks, charred crust, sheet pan, baking tray, oven roasted, baked wedges, finished dish`;
    }
    if (stage === 'cook') {
        return `${base}, plated hero dish, final serving presentation`;
    }
    return base;
};

const buildValidationRejectTerms = (stage: StepStage): string[] => {
    const shared = ['plated dish', 'final serving', 'hero shot'];
    if (stage === 'prep' || stage === 'mix' || stage === 'form') {
        return [...shared, 'cooked meal', 'browned crust', 'fried texture', 'sear marks'];
    }
    if (stage === 'cook') {
        return [...shared];
    }
    return shared;
};

const shouldRetryFromValidation = (validation: WorkerValidationFeedback | undefined, stage: StepStage): boolean => {
    if (!validation) return false;
    if (validation.needsRetry === true) return true;
    if (validation.pass === false) return true;

    if (!isEarlyStepStage(stage)) return false;

    const labels = (validation.labels || []).map((x) => x.toLowerCase());
    const disallowed = ['plated', 'final dish', 'serving', 'cooked', 'fried', 'golden brown'];
    if (labels.some((l) => disallowed.some((d) => l.includes(d)))) return true;

    if (validation.detectedStage) {
        const detected = validation.detectedStage.toLowerCase();
        if (detected === 'cook' || detected === 'serve') return true;
    }
    return false;
};

export const generateWithCloudflareWorker = async (
    prompt: string,
    type: ImageType,
    aspectRatio: string,
    config: AiConfig
): Promise<string> => {
    const primaryUrl = buildWorkerEndpoint((config.cloudflareWorkerUrl || '').trim());
    const endpoints = [primaryUrl, FALLBACK_WORKER_ENDPOINT].filter((v, i, a) => Boolean(v) && a.indexOf(v) === i);

    const token = (config.cloudflareWorkerToken || '').trim();
    const { width, height } = getResolution(type, aspectRatio);
    const errors: string[] = [];
    const stepStage: StepStage = type === 'step' ? detectStepStageFromPrompt(prompt) : 'generic';
    const qualityProfile = getWorkerQualityProfile(type, stepStage);

    for (const workerUrl of endpoints) {
        const maxAttempts = type === 'step' ? 2 : 1;
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 45000);
            try {
                const effectivePrompt = type === 'step'
                    ? buildStepAwarePrompt(prompt, stepStage, attempt)
                    : prompt;
                const response = await fetch(workerUrl, {
                    method: 'POST',
                    signal: controller.signal,
                    headers: {
                        'Content-Type': 'application/json',
                        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
                    },
                    body: JSON.stringify({
                        prompt: effectivePrompt,
                        text: effectivePrompt,
                        type,
                        generation_profile: type,
                        quality_profile: qualityProfile,
                        width,
                        height,
                        aspect_ratio: aspectRatio,
                        step_stage: type === 'step' ? stepStage : undefined,
                        negative_prompt: buildWorkerNegativePrompt(type, stepStage),
                        validation: type === 'step'
                            ? {
                                enabled: true,
                                model: '@cf/meta/llama-3.2-11b-vision-instruct',
                                expected_stage: stepStage,
                                reject_if_detected: buildValidationRejectTerms(stepStage),
                                auto_retry: true
                            }
                            : { enabled: false }
                    })
                });

                const contentType = response.headers.get('content-type') || '';
                if (!response.ok) {
                    const errText = await response.text().catch(() => '');
                    errors.push(`${workerUrl} attempt ${attempt}: HTTP ${response.status} ${errText.slice(0, 180)}`);
                    continue;
                }

                if (contentType.startsWith('image/')) {
                    const blob = await response.blob();
                    const buf = await blob.arrayBuffer();
                    return toDataUri(buf, blob.type || 'image/png');
                }

                const json = await response.json().catch(() => ({}));
                const parsed = await parseWorkerJsonImage(json);
                if (type === 'step' && shouldRetryFromValidation(parsed.validation, stepStage) && attempt < maxAttempts) {
                    const usedModel = typeof json?.model === 'string' ? ` [${json.model}]` : '';
                    errors.push(`${workerUrl}${usedModel} attempt ${attempt}: validation requested retry (${parsed.validation?.reason || 'stage mismatch'})`);
                    continue;
                }
                return parsed.imageDataUri;
            } catch (error: any) {
                errors.push(`${workerUrl} attempt ${attempt}: ${error?.message || 'unknown error'}`);
            } finally {
                clearTimeout(timeout);
            }
        }
    }

    throw new Error(`Cloudflare Worker failed on all endpoints. ${errors.join(' | ')}`);
};
