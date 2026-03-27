
import { AiConfig } from '../types';

const CORS_PROXY_URL = "https://postgeniuspro.com/api/proxy.php?url=";

export const MISTRAL_MODELS = [
    "mistral-small-latest",
    "pixtral-large-latest",
    "mistral-large-latest",
    "open-mistral-nemo",
    "codestral-latest",
];

export const generateTextWithMistral = async (
    prompt: string,
    config: AiConfig,
    systemInstruction: string = "You are a helpful AI assistant."
): Promise<string> => {
    const apiKey = config.mistralApiKey;
    if (!apiKey) throw new Error("Mistral API Key is missing");

    const models = [...MISTRAL_MODELS]; // Order matters more for Mistral trial
    let lastError: any;

    for (const model of models) {
        try {
            console.log(`[Mistral] 🌪️ Trying ${model}...`);
            const response = await fetch(`${CORS_PROXY_URL}${encodeURIComponent('https://api.mistral.ai/v1/chat/completions')}`, {
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
                console.log(`[Mistral] ✅ Success with ${model}`);
                return content;
            }
            throw new Error("Empty response from Mistral");

        } catch (error: any) {
            console.warn(`[Mistral] ❌ ${model} failed: ${error.message}`);
            lastError = error;
            if (error.message.includes('429')) {
                continue;
            }
        }
    }

    throw new Error(`Mistral failed all models. Last error: ${lastError?.message}`);
};
