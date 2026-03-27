
import { AiConfig } from '../types';

const CORS_PROXY_URL = "https://postgeniuspro.com/api/proxy.php?url=";

// SiliconFlow API Base URL
const SILICONFLOW_API_URL = "https://api.siliconflow.cn/v1/chat/completions";

// Free tier or very cheap high-performance Chinese models
export const SILICONFLOW_MODELS = [
    "deepseek-ai/DeepSeek-V3",
    "deepseek-ai/DeepSeek-V2.5",
    "Qwen/Qwen2.5-72B-Instruct",
    "Qwen/Qwen2.5-32B-Instruct",
    "Qwen/Qwen2.5-14B-Instruct",
    "THUDM/glm-4-9b-chat",
    "01-ai/Yi-1.5-34B-Chat-16K"
];

/**
 * Generate text using SiliconFlow API (DeepSeek/Qwen/Yi)
 * Requires SiliconFlow API Key
 */
export const generateTextWithSiliconFlow = async (
    prompt: string,
    config: AiConfig,
    systemInstruction: string = "You are a helpful AI assistant."
): Promise<string> => {
    const apiKey = config.siliconFlowApiKey;
    if (!apiKey) throw new Error("SiliconFlow API Key is missing");

    // Shuffle models for resilience
    const models = [...SILICONFLOW_MODELS].sort(() => Math.random() - 0.5);
    let lastError: any;

    for (const model of models) {
        try {
            console.log(`[SiliconFlow] 🐉 Trying ${model}...`);

            // Note: SiliconFlow often requires standard OpenAI-compatible payload
            const response = await fetch(`${CORS_PROXY_URL}${encodeURIComponent(SILICONFLOW_API_URL)}`, {
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
                    max_tokens: 4096,
                    stream: false
                })
            });

            if (!response.ok) {
                const errText = await response.text();
                // 402 = Payment Required (Quota Exceeded)
                if (response.status === 402) {
                    console.warn(`[SiliconFlow] Quota exceeded for ${model}`);
                    continue; // Try next model immediately
                }
                throw new Error(`Status ${response.status}: ${errText}`);
            }

            const data = await response.json();
            const content = data.choices?.[0]?.message?.content;

            if (content) {
                console.log(`[SiliconFlow] ✅ Success with ${model}`);
                return content;
            }
            throw new Error("Empty response from SiliconFlow");

        } catch (error: any) {
            console.warn(`[SiliconFlow] ❌ ${model} failed: ${error.message}`);
            lastError = error;
            // 429 = Rate Limit
            if (error.message.includes('429')) continue;
        }
    }

    throw new Error(`SiliconFlow failed all models. Last error: ${lastError?.message}`);
};
