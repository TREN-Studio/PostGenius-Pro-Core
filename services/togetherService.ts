
import { AiConfig } from '../types';

const CORS_PROXY_URL = "https://postgeniuspro.com/api/proxy.php?url=";

export const TOGETHER_MODELS = [
    "meta-llama/Llama-3.3-70B-Instruct-Turbo",
    "deepseek-ai/DeepSeek-R1-Distill-Llama-70B",
    "meta-llama/Llama-Vision-Free",
    "mistralai/Mistral-Small-24B-Instruct-2501",
    "Qwen/Qwen2.5-72B-Instruct-Turbo",
];

export const generateTextWithTogether = async (
    prompt: string,
    config: AiConfig,
    systemInstruction: string = "You are a helpful AI assistant."
): Promise<string> => {
    const apiKey = config.togetherApiKey;
    if (!apiKey) throw new Error("Together API Key is missing");

    const models = [...TOGETHER_MODELS].sort(() => Math.random() - 0.5);
    let lastError: any;

    for (const model of models) {
        try {
            console.log(`[Together] 🤖 Trying ${model}...`);
            const response = await fetch(`${CORS_PROXY_URL}${encodeURIComponent('https://api.together.xyz/v1/chat/completions')}`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
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
                console.log(`[Together] ✅ Success with ${model}`);
                return content;
            }
            throw new Error("Empty response from Together");

        } catch (error: any) {
            console.warn(`[Together] ❌ ${model} failed: ${error.message}`);
            lastError = error;
            if (error.message.includes('429')) {
                continue;
            }
        }
    }

    throw new Error(`Together failed all models. Last error: ${lastError?.message}`);
};
