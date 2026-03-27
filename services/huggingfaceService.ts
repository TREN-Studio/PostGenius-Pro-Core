
import { GoogleGenAI } from "@google/genai"; // Context implies we might use mixed models, but this file is HF specific

// Default key provided by user - can be overridden by user config
const DEFAULT_HF_KEYS = [
    'HUGGINGFACE_KEY_PLACEHOLDER',
    'HUGGINGFACE_KEY_PLACEHOLDER'
];

// Helper to get a random key
const getRandomHfKey = () => DEFAULT_HF_KEYS[Math.floor(Math.random() * DEFAULT_HF_KEYS.length)];


// Text Models in order of priority (DeepSeek -> GLM -> MiniMax)
// Text Models in order of priority (Qwen -> DeepSeek -> Mistral)
// Text Models in order of priority (Zephyr -> Mistral v0.2 -> Phi-3)
export const HF_TEXT_MODELS = [
    'Qwen/Qwen2.5-7B-Instruct',
    'microsoft/Phi-3.5-mini-instruct',
    'HuggingFaceH4/zephyr-7b-beta'
];

export const HF_MODELS = {
    IMAGE: 'stabilityai/stable-diffusion-xl-base-1.0',
    VISION: 'zai-org/GLM-4.6V-Flash:novita'
};

const ROUTER_URL = "https://router.huggingface.co/v1";

interface HFMessage {
    role: 'user' | 'assistant' | 'system';
    content: string | Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }>;
}

/**
 * Generate text using Hugging Face Router with automatic model fallback
 * Switch to Inference API URL for better compatibility with free tokens
 */
export const generateTextWithHuggingFaceFallback = async (
    prompt: string,
    apiKey: string = getRandomHfKey(),
    systemPrompt: string = "You are a helpful AI assistant."
): Promise<string> => {
    let lastError: any;
    // Fallback to HF Router/Inference
    for (const model of HF_TEXT_MODELS) {
        try {
            console.log(`[HF Text Gen] Trying model: ${model}`);

            const response = await fetch(`${ROUTER_URL}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: model,
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: prompt }
                    ],
                    max_tokens: 2048,
                    temperature: 0.7
                })
            });

            if (!response.ok) {
                // If 403 Forbidden, it likely means the API Key doesn't have permission for this model.
                // Try again WITHOUT the key (Anonymous access) which often works for public models.
                if (response.status === 403 && apiKey) {
                    console.warn(`[HF Text Gen] 403 Forbidden with key for ${model}. Retrying anonymously via Proxy...`);
                    const PROXY_URL = "/api/proxy.php?url=";
                    const targetUrl = `${ROUTER_URL}/chat/completions`;
                    const fullUrl = `${PROXY_URL}${encodeURIComponent(targetUrl)}`;

                    const anonResponse = await fetch(fullUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' }, // No Authorization header
                        body: JSON.stringify({
                            model: model,
                            messages: [
                                { role: 'system', content: systemPrompt },
                                { role: 'user', content: prompt }
                            ],
                            max_tokens: 2048,
                            temperature: 0.7
                        })
                    });

                    if (anonResponse.ok) {
                        const anonData = await anonResponse.json();
                        const anonContent = anonData.choices[0]?.message?.content || '';
                        if (anonContent) {
                            console.log(`[HF Text Gen] Success (Anonymous) with ${model}`);
                            return anonContent;
                        }
                    }
                }

                const errorText = await response.text();
                throw new Error(`HF Router Error (${model}): ${response.status} - ${errorText}`);
            }

            const data = await response.json();
            const content = data.choices[0]?.message?.content || '';

            if (content) {
                console.log(`[HF Text Gen] Success with ${model}`);
                return content;
            }

        } catch (error: any) {
            console.warn(`[HF Text Gen] Failed with ${model}:`, error.message);
            lastError = error;
            // Continue to next model
        }
    }

    console.error('All HF Text Models failed:', lastError);
    throw lastError || new Error("All Hugging Face text models failed.");
};

/**
 * Legacy wrapper for backward compatibility
 */
export const generateTextWithDeepSeek = async (prompt: string, apiKey?: string): Promise<string> => {
    return generateTextWithHuggingFaceFallback(prompt, apiKey);
};

/**
 * Analyze image using GLM-4V via HF Router
 */
export const analyzeImageWithGLM4V = async (
    imageUrl: string,
    prompt: string = "Describe this image in one sentence.",
    apiKey: string = getRandomHfKey()
): Promise<string> => {
    try {
        const response = await fetch(`${ROUTER_URL}/chat/completions`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: HF_MODELS.VISION,
                messages: [
                    {
                        role: 'user',
                        content: [
                            { type: 'text', text: prompt },
                            { type: 'image_url', image_url: { url: imageUrl } }
                        ]
                    }
                ],
                max_tokens: 512
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HF Router Error: ${response.status} - ${errorText}`);
        }

        const data = await response.json();
        return data.choices[0]?.message?.content || '';
    } catch (error) {
        console.error('GLM-4V Analysis Failed:', error);
        throw error;
    }
};

/**
 * Generate Image using Z-Image-Turbo via Local Backend or HF Inference API
 * Note: InferenceClient logic from python maps to direct API calls
 */
export const generateImageWithZImage = async (
    prompt: string,
    width: number = 1024,
    height: number = 1024,
    apiKey: string = getRandomHfKey()
): Promise<string> => { // Returns Base64 Data URI
    // 1. Try Local Python Backend (No CORS, Secure Key)
    // 1. Try Local Python Backend (Skipped for Production Deployment)
    // To enable local python backend, uncomment this block or use env var
    /*
    try {
        const backendUrl = "http://localhost:5000/api/generate-image";
        // ... (Local backend logic commented out to prevent ERR_CONNECTION_REFUSED on Hostinger)
    } catch (e) { console.warn("Local backend skipped"); }
    */

    // 2. Fallback to Direct HF Inference API (via Proxy)
    try {
        // Determine proxy URL based on environment (handled by isLocal check usually, but here we enforce PHP proxy for prod compatibility)
        const isLocal = window.location.hostname === 'localhost';
        const proxyUrl = isLocal ? "http://localhost:5000/api/proxy?url=" : "/api/proxy.php?url=";

        const model = HF_MODELS.IMAGE;
        const targetUrl = `https://api-inference.huggingface.co/models/${model}`;
        const fullUrl = `${proxyUrl}${encodeURIComponent(targetUrl)}`;

        const response = await fetch(fullUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
                'x-use-cache': 'false'
            },
            body: JSON.stringify({ inputs: prompt })
        });

        if (!response.ok) throw new Error(`HF API Error: ${response.status}`);

        const blob = await response.blob();
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });

    } catch (error) {
        console.error("HF Generation Failed:", error);
        throw error;
    }
};




/**
 * Background Service to Enhance Prompts using DeepSeek
 */
export const enhancePromptWithDeepSeek = async (basePrompt: string, apiKey: string): Promise<string> => {
    const metaPrompt = `
    You are an expert AI art prompter. Enhance the following description into a high-quality stable diffusion prompt.
    Focus on lighting, texture, composition, and artistic style. Keep it under 50 words.
    
    Description: "${basePrompt}"
    
    Enhanced Prompt:`;

    try {
        const enhanced = await generateTextWithHuggingFaceFallback(metaPrompt, apiKey, "You are an expert prompt engineer.");
        return enhanced.trim().replace(/^"|"$/g, ''); // Remove quotes
    } catch (e) {
        console.warn('DeepSeek enhancement failed, using original prompt');
        return basePrompt;
    }
};


