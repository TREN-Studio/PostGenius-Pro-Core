import { AiConfig } from '../types';
import { generateTextWithNvidiaKimi } from './nvidiaTextService';
import { generateTextWithHuggingFaceFallback } from './huggingfaceService';

/**
 * BEAST MODE:
 * 1) NVIDIA Kimi for authenticated admin sessions
 * 2) Hugging Face router fallback
 */
export const generateTextWithBeastMode = async (
    prompt: string,
    systemInstruction: string = 'You are a helpful AI assistant.',
    config?: AiConfig
): Promise<string> => {
    if (typeof window !== 'undefined') {
        const token = (localStorage.getItem('auth_token') || '').trim();
        if (token) {
            try {
                console.log('[Beast Mode] Trying NVIDIA Kimi chain first...');
                const kimiResponse = await generateTextWithNvidiaKimi(prompt, {
                    systemInstruction,
                    authToken: token,
                    config,
                    temperature: 1.0,
                    topP: 1.0,
                    maxTokens: 16384,
                    enableThinking: true,
                });
                if (kimiResponse && kimiResponse.length > 10) {
                    return kimiResponse;
                }
            } catch (error: any) {
                console.warn(`[Beast Mode] NVIDIA Kimi chain failed: ${error?.message || error}`);
            }
        }
    }

    try {
        console.log('[Beast Mode] Falling back to Hugging Face router...');
        const hfResponse = await generateTextWithHuggingFaceFallback(
            prompt,
            config?.huggingFaceApiKey,
            systemInstruction
        );
        if (hfResponse && hfResponse.length > 10) {
            return hfResponse;
        }
        throw new Error('Empty response from Hugging Face fallback');
    } catch (error: any) {
        throw new Error(`Beast Mode failed without public-anonymous fallback: ${error?.message || error}`);
    }
};

