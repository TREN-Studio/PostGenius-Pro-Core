/**
 * NVIDIA Qwen 3.5 VLM Image Validation Service
 * Validates generated product images for quality and relevance
 */

interface ValidationRequest {
    imageBase64: string;
    productName: string;
    productDescription: string;
}

interface ValidationResponse {
    success: boolean;
    isValid: boolean;
    confidence: number;
    feedback: string;
    issues?: string[];
}

interface QwenAnalysis {
    matchesProduct: boolean;
    visualQuality: 'excellent' | 'good' | 'poor';
    professionalLevel: 'high' | 'medium' | 'low';
    defects: string[];
    recommendations: string[];
}

/**
 * Validates a generated image using Qwen 3.5 VLM
 * Checks for: product relevance, visual quality, professional standards, defects
 */
export async function validateProductImage(
    imageBase64: string,
    productName: string,
    productDescription: string,
): Promise<ValidationResponse> {
    try {
        // Validate inputs
        if (!imageBase64 || !productName) {
            return {
                success: false,
                isValid: false,
                confidence: 0,
                feedback: 'Image and product name are required',
            };
        }

        const apiKey = process.env.NVIDIA_API_KEY;
        if (!apiKey) {
            console.error('NVIDIA_API_KEY not configured');
            return {
                success: false,
                isValid: false,
                confidence: 0,
                feedback: 'NVIDIA API key not configured',
            };
        }

        // Build the vision check prompt
        const visionPrompt = `Analyze this product image and provide quality assessment.
        
Product Name: ${productName}
Product Description: ${productDescription}

Please evaluate:
1. Does the image clearly show a product relevant to "${productName}"?
2. Is the image professionally shot with good lighting and composition?
3. Are there any visible defects, blurriness, or artifacts?
4. Is the background appropriate for a lifestyle product photo?
5. Would this be acceptable for e-commerce/blog publication?

Respond in JSON format with these fields:
{
  "matchesProduct": boolean,
  "visualQuality": "excellent|good|poor",
  "professionalLevel": "high|medium|low",
  "defects": [list of any visual defects],
  "recommendations": [improvement suggestions],
  "overallScore": number between 0-100
}`;

        // NVIDIA NIM API endpoint for Qwen VLM
        const nimEndpoint = 'https://integrate.api.nvidia.com/v1/chat/completions';

        const requestBody = {
            model: 'qwen3.5-397b-a17b',
            messages: [
                {
                    role: 'user',
                    content: [
                        {
                            type: 'image',
                            image_url: {
                                url: `data:image/png;base64,${imageBase64}`,
                            },
                        },
                        {
                            type: 'text',
                            text: visionPrompt,
                        },
                    ],
                },
            ],
            temperature: 0.5,
            top_p: 0.7,
            max_tokens: 500,
        };

        console.log('👁️  Validating image with Qwen 3.5 VLM...');

        const response = await fetch(nimEndpoint, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json',
            },
            body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
            const errorData = await response.text();
            console.error('Qwen VLM API Error:', response.status, errorData);
            return {
                success: false,
                isValid: false,
                confidence: 0,
                feedback: `Validation API error: ${response.status}`,
            };
        }

        const data = await response.json() as any;
        const responseText = data.choices?.[0]?.message?.content || '';

        // Parse the JSON response from Qwen
        let analysis: QwenAnalysis;
        try {
            // Extract JSON from the response
            const jsonMatch = responseText.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
                throw new Error('No JSON found in response');
            }
            analysis = JSON.parse(jsonMatch[0]);
        } catch (parseError) {
            console.error('Failed to parse Qwen response:', responseText);
            return {
                success: true,
                isValid: false,
                confidence: 0.5,
                feedback: 'Could not fully validate image. Manual review recommended.',
            };
        }

        // Determine if image passes validation
        const isValid =
            analysis.matchesProduct &&
            (analysis.visualQuality === 'excellent' || analysis.visualQuality === 'good') &&
            (analysis.professionalLevel === 'high' || analysis.professionalLevel === 'medium') &&
            analysis.defects.length === 0;

        const confidence = (analysis as any).overallScore ? (analysis as any).overallScore / 100 : 0.7;

        const feedback = isValid
            ? '✅ Image passes quality validation and is ready for publication'
            : `⚠️ Image requires review: ${analysis.defects.join(', ') || 'Quality concerns detected'}`;

        console.log(`Vision Check: ${feedback}`);

        return {
            success: true,
            isValid,
            confidence,
            feedback,
            issues: analysis.defects,
        };
    } catch (error) {
        console.error('Image validation error:', error);
        return {
            success: false,
            isValid: false,
            confidence: 0,
            feedback: error instanceof Error ? error.message : 'Unknown error during validation',
        };
    }
}

/**
 * Validates multiple images and returns detailed report
 */
export async function validateMultipleImages(
    images: { base64: string; filename?: string }[],
    productName: string,
    productDescription: string,
): Promise<{ validImages: typeof images; invalidImages: { image: (typeof images)[0]; reason: string }[] }> {
    const validImages: typeof images = [];
    const invalidImages: { image: (typeof images)[0]; reason: string }[] = [];

    for (const img of images) {
        const result = await validateProductImage(img.base64, productName, productDescription);
        if (result.isValid && result.confidence > 0.7) {
            validImages.push(img);
        } else {
            invalidImages.push({
                image: img,
                reason: result.feedback,
            });
        }
    }

    return { validImages, invalidImages };
}

export default {
    validateProductImage,
    validateMultipleImages,
};
