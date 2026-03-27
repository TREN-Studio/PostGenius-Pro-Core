
import { AiConfig } from '../types';

const CORS_PROXY_URL = "https://postgeniuspro.com/api/proxy.php?url=";

export const OPENROUTER_FREE_MODELS = [
    "deepseek/deepseek-r1:free",
    "deepseek/deepseek-r1-distill-llama-70b:free",
    "google/gemma-3-27b-it:free",
    "google/gemma-3-12b-it:free",
    "mistralai/mistral-small-24b-instruct-2501:free",
    "meta-llama/llama-3.3-70b-instruct:free",
    "nvidia/llama-3.1-nemotron-70b-instruct:free",
    "qwen/qwen-2.5-72b-instruct:free",
    "qwen/qwen-2.5-vl-72b-instruct:free", // Multimodal powerful
    "microsoft/phi-4:free",
    "deepseek/deepseek-v3:free",
    "nousresearch/hermes-3-llama-3.1-405b:free",
    "cognitivecomputations/dolphin-3.0-r1-mistral-24b:free",
];

export const generateTextWithOpenRouter = async (
    prompt: string,
    config: AiConfig,
    systemInstruction: string = "You are a helpful AI assistant."
): Promise<string> => {
    const apiKey = config.openRouterApiKey;
    if (!apiKey) throw new Error("OpenRouter API Key is missing");

    // Shuffle models for load balancing/rotation
    const models = [...OPENROUTER_FREE_MODELS].sort(() => Math.random() - 0.5);
    let lastError: any;

    for (const model of models) {
        try {
            console.log(`[OpenRouter] 🐉 Trying ${model}...`);
            const response = await fetch(`${CORS_PROXY_URL}${encodeURIComponent('https://openrouter.ai/api/v1/chat/completions')}`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'HTTP-Referer': 'https://postgeniuspro.com', // Required by OpenRouter
                    'X-Title': 'PostGenius Pro',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: model,
                    messages: [
                        { role: 'system', content: systemInstruction },
                        { role: 'user', content: prompt }
                    ],
                    temperature: 0.7,
                    max_tokens: 4000
                })
            });

            if (!response.ok) {
                const errData = await response.json();
                throw new Error(`Status ${response.status}: ${errData.error?.message || 'Unknown error'}`);
            }

            const data = await response.json();
            const content = data.choices?.[0]?.message?.content;

            if (content) {
                console.log(`[OpenRouter] ✅ Success with ${model}`);
                return content;
            }
            throw new Error("Empty response from OpenRouter");

        } catch (error: any) {
            console.warn(`[OpenRouter] ❌ ${model} failed: ${error.message}`);
            lastError = error;
            // Immediate retry with next model if rate limited or failed
            if (error.message.includes('429')) {
                continue;
            }
        }
    }

    throw new Error(`OpenRouter "Dragon" failed all models. Last error: ${lastError?.message}`);
};
