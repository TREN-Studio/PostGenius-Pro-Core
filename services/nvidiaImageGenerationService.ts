/**
 * NVIDIA Stable Diffusion 3.5 Large Image Generation Service
 * Generates professional lifestyle product images for blog articles.
 */

interface ImageSpec {
    role?: string;
    aspectRatio?: string;
}

interface GenerationOptions {
    imageCount?: number;
    imageSpecs?: ImageSpec[];
    aspectRatio?: string;
}

interface GeneratedImage {
    base64: string;
    url?: string;
    prompt: string;
    role?: string;
    aspectRatio?: string;
    timestamp: number;
}

interface GenerationResponse {
    success: boolean;
    images?: GeneratedImage[];
    error?: string;
    prompt?: string;
}

/**
 * Constructs a professional lifestyle photography prompt.
 */
function buildProductPrompt(productName: string, description: string, context?: string): string {
    const basePrompt = `Professional lifestyle photography of ${productName}`;
    const contextPart = context ? `, ${context}` : '';
    return `${basePrompt}${contextPart}, cinematic lighting, professional product photography, 8k resolution, studio quality, clean background, well-lit, magazine-quality`;
}

const normalizeAspectRatio = (value?: string): string => {
    const normalized = String(value || '1:1').trim().toLowerCase().replace(/x/g, ':').replace(/\s+/g, '');
    return ['1:1', '16:9', '9:16', '4:3', '3:4', '21:9'].includes(normalized) ? normalized : '1:1';
};

const mapAspectRatioToImageSize = (aspectRatio: string): string => {
    if (aspectRatio === '16:9') return '1344x768';
    if (aspectRatio === '9:16') return '768x1344';
    if (aspectRatio === '4:3') return '1152x864';
    if (aspectRatio === '3:4') return '864x1152';
    if (aspectRatio === '21:9') return '1536x640';
    return '1024x1024';
};

/**
 * Generates images using NVIDIA's Stable Diffusion model via NIM API.
 * Supports per-image aspect ratio through imageSpecs.
 */
export async function generateProductImages(
    productName: string,
    productDescription: string,
    usageContext?: string,
    options: GenerationOptions = {},
): Promise<GenerationResponse> {
    try {
        if (!productName || !productDescription) {
            return {
                success: false,
                error: 'Product name and description are required',
            };
        }

        const apiKey = process.env.NVIDIA_API_KEY;
        if (!apiKey) {
            return {
                success: false,
                error: 'NVIDIA API key not configured',
            };
        }

        const prompt = buildProductPrompt(productName, productDescription, usageContext);
        const requestedImageCount = Math.min(6, Math.max(1, Number(options.imageCount) || 3));
        const fallbackAspectRatio = normalizeAspectRatio(options.aspectRatio);
        const finalSpecs = Array.isArray(options.imageSpecs) && options.imageSpecs.length > 0
            ? options.imageSpecs.slice(0, 6).map((spec, index) => ({
                role: String(spec.role || `image_${index + 1}`),
                aspectRatio: normalizeAspectRatio(spec.aspectRatio || fallbackAspectRatio),
            }))
            : Array.from({ length: requestedImageCount }, (_, index) => ({
                role: `image_${index + 1}`,
                aspectRatio: fallbackAspectRatio,
            }));

        const nimEndpoint = 'https://integrate.api.nvidia.com/v1/images/generations';
        const images: GeneratedImage[] = [];

        for (const spec of finalSpecs) {
            const requestBody = {
                model: 'stable-diffusion-3.5-large',
                prompt,
                negative_prompt: 'low quality, blurry, distorted, poorly lit, watermark, text, logo, amateur',
                num_images: 1,
                image_size: mapAspectRatioToImageSize(spec.aspectRatio),
                steps: 30,
                guidance_scale: 7.5,
                seed: Math.floor(Math.random() * 1000000),
            };

            const response = await fetch(nimEndpoint, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                    Accept: 'application/json',
                },
                body: JSON.stringify(requestBody),
            });

            if (!response.ok) {
                const errorData = await response.text();
                return {
                    success: false,
                    error: `NVIDIA API error: ${response.status} - ${errorData}`,
                };
            }

            const data = await response.json() as any;
            const first = (data.data || [])[0];
            if (!first) {
                continue;
            }

            images.push({
                base64: first.b64_json || '',
                url: first.url || '',
                prompt,
                role: spec.role,
                aspectRatio: spec.aspectRatio,
                timestamp: Date.now(),
            });
        }

        if (images.length === 0) {
            return {
                success: false,
                error: 'No images generated from NVIDIA API',
            };
        }

        return {
            success: true,
            images,
            prompt,
        };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error during image generation',
        };
    }
}

export function generatePromptTemplate(productName: string): string {
    return `Professional lifestyle photography of ${productName}, [CONTEXT], cinematic lighting, 8k resolution`;
}

export default {
    generateProductImages,
    generatePromptTemplate,
};
