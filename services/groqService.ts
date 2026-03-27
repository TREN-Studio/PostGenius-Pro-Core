
import { AiConfig } from '../types';

const CORS_PROXY_URL = "https://postgeniuspro.com/api/proxy.php?url=";

export const GROQ_MODELS = [
    "llama-3.3-70b-versatile",
    "deepseek-r1-distill-llama-70b",
    "qwen-qwq-32b",
    "mistral-saba-24b",
    "llama-3.1-70b-versatile",
    "gemma2-9b-it",
];

export const generateTextWithGroq = async (
    prompt: string,
    config: AiConfig,
    systemInstruction: string = "You are a helpful AI assistant."
): Promise<string> => {
    const apiKey = config.groqApiKey;
    if (!apiKey) throw new Error("Groq API Key is missing");

    // Shuffle models for rotation
    const models = [...GROQ_MODELS].sort(() => Math.random() - 0.5);
    let lastError: any;

    for (const model of models) {
        try {
            console.log(`[Groq] ⚡ Trying ${model}...`);
            const response = await fetch(`${CORS_PROXY_URL}${encodeURIComponent('https://api.groq.com/openai/v1/chat/completions')}`, {
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
                console.log(`[Groq] ✅ Success with ${model}`);
                return content;
            }
            throw new Error("Empty response from Groq");

        } catch (error: any) {
            console.warn(`[Groq] ❌ ${model} failed: ${error.message}`);
            lastError = error;
            if (error.message.includes('429')) {
                continue;
            }
        }
    }

    throw new Error(`Groq failed all models. Last error: ${lastError?.message}`);
};
