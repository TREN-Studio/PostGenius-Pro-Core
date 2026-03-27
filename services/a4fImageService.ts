import type { AiConfig } from '../types';

type ImageType = 'hero' | 'step' | 'product';

const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const CORS_PROXY_URL = isLocal
    ? "http://localhost:5000/api/proxy?url="
    : "/api/proxy.php?url=";

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

const modelCandidates = [
    'provider-5/openai/gpt-image-1',
    'provider-2/openai/gpt-image-1',
    'provider-5/black-forest-labs/flux-1.1-pro-ultra',
    'provider-2/black-forest-labs/flux-1.1-pro-ultra',
    'provider-5/google/imagen-4-ultra',
    'provider-2/google/imagen-4-ultra',
    'openai/gpt-image-1',
    'black-forest-labs/flux-1.1-pro-ultra',
    'google/imagen-4-ultra'
];

const parseA4FResponseImage = async (json: any): Promise<string> => {
    const maybeData = json?.data?.[0];
    const b64 = maybeData?.b64_json || json?.b64_json || json?.image?.b64_json;
    if (typeof b64 === 'string' && b64.trim()) {
        return `data:image/png;base64,${b64}`;
    }

    const url = maybeData?.url || json?.url || json?.image?.url;
    if (typeof url === 'string' && url.trim()) {
        if (url.startsWith('data:image/')) {
            return url;
        }
        const fetchResponse = await fetch(`${CORS_PROXY_URL}${encodeURIComponent(url)}`);
        if (!fetchResponse.ok) {
            return url;
        }
        const blob = await fetchResponse.blob();
        const buffer = await blob.arrayBuffer();
        return toDataUri(buffer, blob.type || 'image/png');
    }

    throw new Error('A4F response missing image url/base64');
};

export const generateWithA4F = async (
    prompt: string,
    type: ImageType,
    aspectRatio: string,
    config: AiConfig
): Promise<string> => {
    const apiKey = (config?.a4fApiKey || '').trim();
    if (!apiKey) {
        throw new Error('A4F API key missing');
    }

    const { width, height } = getResolution(type, aspectRatio);
    const errors: string[] = [];

    for (const model of modelCandidates) {
        try {
            const payload = {
                model,
                prompt,
                size: `${width}x${height}`,
                quality: 'hd',
                aspect_ratio: aspectRatio,
                response_format: 'b64_json',
            };

            const endpoint = `${CORS_PROXY_URL}${encodeURIComponent('https://api.a4f.co/v1/images/generations')}`;
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`,
                },
                body: JSON.stringify(payload),
            });

            const raw = await response.text();
            let json: any = {};
            try {
                json = raw ? JSON.parse(raw) : {};
            } catch {
                json = {};
            }

            if (!response.ok) {
                const errText = json?.error?.message || json?.message || raw || `HTTP ${response.status}`;
                errors.push(`${model}: ${response.status} ${String(errText).slice(0, 160)}`);
                continue;
            }

            return await parseA4FResponseImage(json);
        } catch (error: any) {
            errors.push(`${model}: ${error?.message || 'unknown error'}`);
        }
    }

    throw new Error(`A4F all models failed. ${errors.join(' | ')}`);
};

