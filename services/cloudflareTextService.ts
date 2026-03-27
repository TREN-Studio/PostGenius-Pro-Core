
import { AiConfig } from '../types';

const CORS_PROXY_URL = "https://postgeniuspro.com/api/proxy.php?url=";

export const CLOUDFLARE_MODELS = [
    "@cf/meta/llama-3.3-70b-instruct-fp8",
    "@cf/deepseek-ai/deepseek-r1-distill-qwen-32b",
    "@cf/meta/llama-3.1-8b-instruct",
    "@cf/qwen/qwen1.5-14b-chat-awq",
    "@cf/mistral/mistral-7b-instruct-v0.2",
    "@cf/google/gemma-7b-it-lora"
];

export const generateTextWithCloudflare = async (
    prompt: string,
    config: AiConfig,
    systemInstruction: string = "You are a helpful AI assistant."
): Promise<string> => {
    const { cloudflareAccountId, cloudflareApiToken } = config;
    if (!cloudflareAccountId || !cloudflareApiToken) throw new Error("Cloudflare credentials missing");

    // Shuffle models
    const models = [...CLOUDFLARE_MODELS].sort(() => Math.random() - 0.5);
    let lastError: any;

    for (const model of models) {
        try {
            console.log(`[Cloudflare] 🌩️ Trying ${model}...`);
            const targetUrl = `https://api.cloudflare.com/client/v4/accounts/${cloudflareAccountId}/ai/run/${model}`;

            const response = await fetch(`${CORS_PROXY_URL}${encodeURIComponent(targetUrl)}`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${cloudflareApiToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    messages: [
                        { role: 'system', content: systemInstruction },
                        { role: 'user', content: prompt }
                    ]
                })
            });

            if (!response.ok) {
                const errText = await response.text();
                throw new Error(`Status ${response.status}: ${errText}`);
            }

            const data = await response.json();
            // Cloudflare output format: { result: { response: "string" }, success: true }
            const content = data.result?.response;

            if (content) {
                console.log(`[Cloudflare] ✅ Success with ${model}`);
                return content;
            }
            throw new Error("Empty response from Cloudflare");

        } catch (error: any) {
            console.warn(`[Cloudflare] ❌ ${model} failed: ${error.message}`);
            lastError = error;
            if (error.message.includes('429')) continue;
        }
    }

    throw new Error(`Cloudflare failed all models. Last error: ${lastError?.message}`);
};
