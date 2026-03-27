
import { AiConfig } from '../types';

export class ImageRateLimitError extends Error {
    retryAfter: number;

    constructor(message: string, retryAfter: number) {
        super(message);
        this.name = 'ImageRateLimitError';
        this.retryAfter = retryAfter;
    }
}

interface DeepAIOptions {
    apiKey?: string;
}

export const getRateLimitStatus = () => {
    // This is a placeholder as DeepAI doesn't expose a dedicated rate limit endpoint
    // usually, rate limits are returned in headers of requests.
    // We can implement a simple local tracker if needed, but for now we'll return a dummy status.
    return { remaining: 100, reset: Date.now() + 3600000 };
};

export const generateImageWithDeepAI = async (
    prompt: string,
    type: 'hero' | 'step' | 'product',
    niche: string,
    options: DeepAIOptions = {}
): Promise<string> => {
    const apiKey = options.apiKey || 'quickstart-QUdJIGlzIGNvbWluZy4uLi4K'; // Default quickstart key if none provided

    try {
        const formData = new FormData();
        formData.append('text', `${prompt}, ${niche} style, high quality, photorealistic. NO hands, NO fingers, NO people, NO human body parts. Object on surface, NOT held.`);

        // Adjust grid size based on type if needed, though DeepAI text2img is usually square
        // We can't easily control aspect ratio in the standard free endpoint, it's usually 1:1.

        const response = await fetch('https://api.deepai.org/api/text2img', {
            method: 'POST',
            headers: {
                'api-key': apiKey,
            },
            body: formData,
        });

        if (response.status === 429) {
            const retryAfter = parseInt(response.headers.get('retry-after') || '60', 10);
            throw new ImageRateLimitError('DeepAI rate limit exceeded', retryAfter);
        }

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`DeepAI API error: ${response.status} ${response.statusText} - ${errorText}`);
        }

        const data = await response.json();

        if (data.output_url) {
            return data.output_url;
        } else {
            throw new Error('No output URL in DeepAI response');
        }

    } catch (error: any) {
        if (error instanceof ImageRateLimitError) {
            throw error;
        }
        console.error('DeepAI generation error:', error);
        throw new Error(`DeepAI generation failed: ${error.message}`);
    }
};
