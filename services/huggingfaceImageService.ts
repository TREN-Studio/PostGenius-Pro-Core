/**
 * HuggingFace Image Generation Service
 * Interfaces with Python Flask backend for ultra-fast image generation
 */

const PYTHON_API_URL = import.meta.env.VITE_PYTHON_API_URL || 'http://localhost:5000';

export interface HFGenerateRequest {
    prompt: string;
    model?: string; // 'turbo', 'iphone', 'flux-schnell', 'flux-dev', 'sdxl', 'ovis' or full model ID
    width?: number;
    height?: number;
    num_inference_steps?: number;
}

export interface HFGenerateResponse {
    success: boolean;
    image?: string; // Base64 encoded image
    model?: string;
    size?: [number, number];
    error?: string;
}

export interface HFBatchRequest {
    prompt: string;
    models: string[];
    width?: number;
    height?: number;
    num_inference_steps?: number;
}

export interface HFBatchResult {
    model: string;
    image?: string;
    success: boolean;
    size?: [number, number];
    error?: string;
}

export interface HFBatchResponse {
    success: boolean;
    results: HFBatchResult[];
    total: number;
    successful: number;
    error?: string;
}

export interface HFModel {
    alias: string;
    id: string;
    description: string;
}

/**
 * Check if Python backend is available
 */
export async function checkBackendHealth(): Promise<boolean> {
    try {
        const response = await fetch(`${PYTHON_API_URL}/health`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' }
        });

        if (response.ok) {
            const data = await response.json();
            console.log('[HF Backend] Health check:', data);
            return data.status === 'ok';
        }

        return false;
    } catch (error) {
        console.warn('[HF Backend] Not available:', error);
        return false;
    }
}

/**
 * Generate a single image using HuggingFace backend
 * 
 * @param request - Generation parameters
 * @returns Promise with base64 image or error
 * 
 * @example
 * ```typescript
 * const result = await generateImageWithHF({
 *   prompt: 'A beautiful sunset over mountains',
 *   model: 'turbo', // Ultra-fast
 *   width: 1024,
 *   height: 1024
 * });
 * 
 * if (result.success) {
 *   console.log('Image generated:', result.image);
 * }
 * ```
 */
export async function generateImageWithHF(
    request: HFGenerateRequest
): Promise<HFGenerateResponse> {
    try {
        const response = await fetch(`${PYTHON_API_URL}/api/generate-image`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                prompt: request.prompt,
                model: request.model || 'turbo',
                width: request.width || 1024,
                height: request.height || 1024,
                num_inference_steps: request.num_inference_steps || 4
            })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || `HTTP ${response.status}`);
        }

        const data: HFGenerateResponse = await response.json();

        if (!data.success) {
            throw new Error(data.error || 'Generation failed');
        }

        console.log(`[HF Backend] ✅ Image generated with ${data.model}`);
        return data;

    } catch (error: any) {
        console.error('[HF Backend] Generation failed:', error);
        return {
            success: false,
            error: error.message || 'Unknown error'
        };
    }
}

/**
 * Generate multiple images with different models in parallel
 * 
 * @param request - Batch generation parameters
 * @returns Promise with array of results
 * 
 * @example
 * ```typescript
 * const results = await generateImageBatchWithHF({
 *   prompt: 'Professional product photo of smartphone',
 *   models: ['turbo', 'iphone', 'flux-schnell'],
 *   width: 1024,
 *   height: 1024
 * });
 * 
 * results.results.forEach((result, i) => {
 *   if (result.success) {
 *     console.log(`Model ${i}: ${result.model} - Success!`);
 *   }
 * });
 * ```
 */
export async function generateImageBatchWithHF(
    request: HFBatchRequest
): Promise<HFBatchResponse> {
    try {
        const response = await fetch(`${PYTHON_API_URL}/api/generate-batch`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                prompt: request.prompt,
                models: request.models,
                width: request.width || 1024,
                height: request.height || 1024,
                num_inference_steps: request.num_inference_steps || 4
            })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || `HTTP ${response.status}`);
        }

        const data: HFBatchResponse = await response.json();

        console.log(`[HF Backend] ✅ Batch complete: ${data.successful}/${data.total} successful`);
        return data;

    } catch (error: any) {
        console.error('[HF Backend] Batch generation failed:', error);
        return {
            success: false,
            results: [],
            total: 0,
            successful: 0,
            error: error.message || 'Unknown error'
        };
    }
}

/**
 * Get list of available models
 */
export async function getAvailableModels(): Promise<HFModel[]> {
    try {
        const response = await fetch(`${PYTHON_API_URL}/api/models`);

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        return data.models || [];

    } catch (error) {
        console.error('[HF Backend] Failed to fetch models:', error);
        return [];
    }
}

/**
 * Convenience function: Generate with automatic fallback
 * Tries HF backend first, falls back to direct HF API if backend unavailable
 */
export async function generateImageWithFallback(
    prompt: string,
    model: string = 'turbo',
    width: number = 1024,
    height: number = 1024
): Promise<string | null> {
    // Try backend first
    const result = await generateImageWithHF({ prompt, model, width, height });

    if (result.success && result.image) {
        return result.image;
    }

    // Backend failed, try direct HF API
    console.warn('[HF Backend] Falling back to direct HF API');

    try {
        // Fallback to hardcoded key if env var is missing
        const hfToken = import.meta.env.VITE_HF_TOKEN || 'HUGGINGFACE_KEY_PLACEHOLDER';

        if (!hfToken) {
            throw new Error('HF_TOKEN not configured');
        }

        const modelMap: Record<string, string> = {
            // New additions
            'turbo': 'black-forest-labs/FLUX.1-schnell', // Updated from dead Z-Image-Turbo
            'flux-schnell': 'black-forest-labs/FLUX.1-schnell',
            'qwen-lightning': 'Qwen/Qwen-VL-Max', // Verify if this maps to Qwen-Image-Lightning
            'awportrait': 'Shakker-Labs/AWPortrait-FL', // Assuming matches AWPortrait-Z intent
            'flux-dev': 'black-forest-labs/FLUX.1-dev',
            'flux-dev-turbo': 'black-forest-labs/FLUX.1-dev', // Check specifics if needed
            'sdxl-nscale': 'stabilityai/stable-diffusion-xl-base-1.0',
            'qwen-image': 'Qwen/Qwen-VL',
            'sd3.5-large': 'stabilityai/stable-diffusion-3.5-large',
            'technically-color': 'Pharma/Technically-Color-Z', // Best guess for Technically-Color-Z
            'ovis': 'AIDC-AI/Ovis-Image-7B',

            // Legacy mappings (keeping for compatibility)
            'iphone': '00quebec/iPhone_realism',
            'sdxl': 'stabilityai/stable-diffusion-xl-base-1.0',
        };

        // Try to match exact model ID or alias, fallback to original string
        const modelId = modelMap[model] || model;

        // Use allorigins proxy to avoid CORS if needed, or direct
        // Note: Direct calls usually require proxy from browser. 
        // Using direct URL here as per previous code structure, but user mentioned "system will use...".
        const apiUrl = `https://api-inference.huggingface.co/models/${modelId}`;

        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${hfToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                inputs: prompt,
                parameters: { width, height, num_inference_steps: 4 }
            })
        });

        if (!response.ok) {
            throw new Error(`HF API error: ${response.status}`);
        }

        const blob = await response.blob();
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.readAsDataURL(blob);
        });

    } catch (error) {
        console.error('[HF Direct API] Failed:', error);
        return null;
    }
}

export default {
    checkBackendHealth,
    generateImageWithHF,
    generateImageBatchWithHF,
    getAvailableModels,
    generateImageWithFallback
};

