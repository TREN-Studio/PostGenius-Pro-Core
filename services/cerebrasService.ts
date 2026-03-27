
import { AiConfig } from '../types';

const CORS_PROXY_URL = "https://postgeniuspro.com/api/proxy.php?url=";

export const CEREBRAS_MODELS = [
    "llama3.3-70b",
    "llama3.1-70b",
    "llama3.1-8b",
];

export const generateTextWithCerebras = async (
    prompt: string,
    config: AiConfig,
    systemInstruction: string = "You are a helpful AI assistant."
): Promise<string> => {
    const apiKey = config.cerebrasApiKey;
    if (!apiKey) throw new Error("Cerebras API Key is missing");

    // Shuffle models for rotation
    const models = [...CEREBRAS_MODELS].sort(() => Math.random() - 0.5);
    let lastError: any;

    for (const model of models) {
        try {
            console.log(`[Cerebras] 🚀 Trying ${model}...`);
            const response = await fetch(`${CORS_PROXY_URL}${encodeURIComponent('https://api.cerebras.ai/v1/chat/completions')}`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
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
                console.log(`[Cerebras] ✅ Success with ${model}`);
                return content;
            }
            throw new Error("Empty response from Cerebras");

        } catch (error: any) {
            console.warn(`[Cerebras] ❌ ${model} failed: ${error.message}`);
            lastError = error;
            if (error.message.includes('429')) {
                continue;
            }
        }
    }

    throw new Error(`Cerebras failed all models. Last error: ${lastError?.message}`);
};
