import type { AiConfig } from '../types';

const NVIDIA_CHAT_ENDPOINT = '/api/nvidia/chat-completions/';

export const NVIDIA_KIMI_MODELS = [
    'moonshotai/kimi-k2.5',
    'moonshotai/kimi-k2-instruct',
];

interface NvidiaTextOptions {
    models?: string[];
    systemInstruction?: string;
    temperature?: number;
    topP?: number;
    maxTokens?: number;
    enableThinking?: boolean;
    authToken?: string;
    config?: AiConfig;
}

const getAuthToken = (provided?: string): string => {
    if (provided && provided.trim()) {
        return provided.trim();
    }
    if (typeof window === 'undefined') {
        return '';
    }
    return (localStorage.getItem('auth_token') || '').trim();
};

const normalizeContent = (payload: any): string => {
    const direct = payload?.content;
    if (typeof direct === 'string' && direct.trim()) {
        return direct.trim();
    }

    const rawContent = payload?.raw?.choices?.[0]?.message?.content;
    if (typeof rawContent === 'string' && rawContent.trim()) {
        return rawContent.trim();
    }

    if (Array.isArray(rawContent)) {
        const joined = rawContent
            .map((part: any) => (typeof part?.text === 'string' ? part.text : ''))
            .join('')
            .trim();
        if (joined) {
            return joined;
        }
    }

    return '';
};

export const generateTextWithNvidiaKimi = async (
    prompt: string,
    options: NvidiaTextOptions = {}
): Promise<string> => {
    const authToken = getAuthToken(options.authToken);
    if (!authToken) {
        throw new Error('NVIDIA Kimi skipped: missing auth token.');
    }

    const models = (options.models && options.models.length > 0)
        ? options.models
        : NVIDIA_KIMI_MODELS;
    const systemInstruction = options.systemInstruction || 'You are a helpful AI assistant.';
    const temperature = options.temperature ?? 1.0;
    const topP = options.topP ?? 1.0;
    const maxTokens = options.maxTokens ?? 16384;
    const enableThinking = options.enableThinking ?? true;

    const errors: string[] = [];

    for (const model of models) {
        try {
            const response = await fetch(NVIDIA_CHAT_ENDPOINT, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': authToken,
                },
                body: JSON.stringify({
                    model,
                    messages: [
                        { role: 'system', content: systemInstruction },
                        { role: 'user', content: prompt },
                    ],
                    max_tokens: maxTokens,
                    temperature,
                    top_p: topP,
                    stream: false,
                    enable_thinking: enableThinking,
                    chat_template_kwargs: {
                        enable_thinking: enableThinking,
                        thinking: enableThinking,
                    },
                }),
            });

            const raw = await response.text();
            let data: any = {};
            try {
                data = raw ? JSON.parse(raw) : {};
            } catch {
                data = {};
            }

            if (!response.ok) {
                const details = typeof data?.details === 'string' && data.details
                    ? data.details
                    : raw.slice(0, 240);
                throw new Error(`HTTP ${response.status}${details ? `: ${details}` : ''}`);
            }

            const content = normalizeContent(data);
            if (!content) {
                throw new Error('Empty content from NVIDIA chat response.');
            }

            console.log(`[Beast Mode] Success with NVIDIA Kimi model: ${model}`);
            return content;
        } catch (error: any) {
            const message = error instanceof Error ? error.message : String(error);
            console.warn(`[Beast Mode] NVIDIA Kimi model failed (${model}): ${message}`);
            errors.push(`${model}: ${message}`);
        }
    }

    throw new Error(`NVIDIA Kimi models failed. ${errors.join(' | ')}`);
};
