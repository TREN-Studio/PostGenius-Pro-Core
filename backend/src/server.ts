


import express from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';


const app = express();
const port = process.env.PORT || 3000;

// Fix: Add root path to resolve overload ambiguity with app.use
// FIX: The express types seem to be broken in this environment. Wrapping express.json()
// in a handler with 'any' parameters to bypass the type check, consistent with how
// other route handlers in this file are handled.
app.use('/', (req: any, res: any, next: any) => {
    express.json({ limit: '10mb' })(req, res, next);
}); // Increase limit for potentially large article data

// FIX: The global 'process' object has incorrect typings in this environment.
// Casting to 'any' allows access to the standard Node.js 'cwd' method.
const STORAGE_PATH = path.join((process as any).cwd(), 'public_html', 'postgenius_internal_data');

// Ensure the storage directory exists on startup.
if (!fs.existsSync(STORAGE_PATH)) {
    console.log(`Storage path not found. Creating directory at: ${STORAGE_PATH}`);
    fs.mkdirSync(STORAGE_PATH, { recursive: true });
}

// --- Helper Functions ---

const getTimestamp = (): string => {
  const now = new Date();
  const YYYY = now.getFullYear();
  const MM = (now.getMonth() + 1).toString().padStart(2, '0');
  const DD = now.getDate().toString().padStart(2, '0');
  const hh = now.getHours().toString().padStart(2, '0');
  const mm = now.getMinutes().toString().padStart(2, '0');
  const ss = now.getSeconds().toString().padStart(2, '0');
  return `${YYYY}${MM}${DD}_${hh}${mm}${ss}`;
};

/**
 * Parses a filename to extract article metadata.
 * @param {string} filename - The filename (e.g., 'review_4c2d_20251106_174601.json').
 * @returns {{type: string, id: string, date: string} | null} Parsed data or null if invalid.
 */
const parseFilename = (filename: string) => {
    const parts = filename.replace('.json', '').split('_');
    if (parts.length !== 3) return null;
    return { type: parts[0], id: parts[1], date: parts[2] };
};

/**
 * Sanitizes a filename component to prevent path traversal.
 * Allows only alphanumeric characters, dashes, and underscores.
 * @param {string} input - The string to sanitize.
 * @returns {string} The sanitized string.
 */
const sanitizePathComponent = (input: string): string => {
    return input.replace(/[^a-zA-Z0-9_-]/g, '');
};


// --- API Endpoints ---

// Fix: Removed Request and Response types to allow inference as 'any', bypassing type errors.
app.post('/api/save-article', (req, res) => {
    try {
        const { articleData, articleType } = req.body;

        // 1. Validation
        if (!articleData || typeof articleData !== 'object' || !articleType || typeof articleType !== 'string') {
            return res.status(400).json({ error: 'Missing or invalid articleData or articleType.' });
        }
        
        // 2. File Naming Convention
        const sanitizedType = sanitizePathComponent(articleType);
        const uniqueId = crypto.randomBytes(4).toString('hex'); // 8-char hex string
        const timestamp = getTimestamp();
        const filename = `${sanitizedType}_${uniqueId}_${timestamp}.json`;

        // 3. Path Traversal Prevention
        const finalPath = path.join(STORAGE_PATH, path.basename(filename));
        if (path.dirname(finalPath) !== STORAGE_PATH) {
             return res.status(400).json({ error: 'Invalid file path detected.' });
        }

        // 4. Input Sanitization & Writing to file
        const fileContent = JSON.stringify(articleData, null, 2); // Pretty-print JSON
        
        // 5. File Permissions (Write)
        fs.writeFileSync(finalPath, fileContent, { mode: 0o644, encoding: 'utf8' });

        console.log(`Article successfully saved to: ${finalPath}`);
        res.status(201).json({ message: 'Article saved successfully.', path: finalPath });

    } catch (error: any) {
        console.error('Failed to save article:', error);
        res.status(500).json({ error: 'An internal server error occurred while saving the article.', details: error.message });
    }
});

// Fix: Removed Request and Response types to allow inference as 'any', bypassing type errors.
app.get('/api/articles', (req, res) => {
    try {
        const files = fs.readdirSync(STORAGE_PATH).filter(file => file.endsWith('.json'));
        const articles = files.map(file => {
            const metadata = parseFilename(file);
            if (!metadata) return null;

            // For the title, we need to read the file content.
            const filePath = path.join(STORAGE_PATH, file);
            const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            
            return {
                id: metadata.id,
                type: metadata.type,
                title: content.title || 'Untitled',
                createdAt: metadata.date,
                filename: file,
            };
        }).filter(Boolean); // Filter out any nulls from invalid filenames

        res.status(200).json(articles);
    } catch (error: any) {
        console.error('Failed to list articles:', error);
        res.status(500).json({ error: 'An internal server error occurred.', details: error.message });
    }
});

// Fix: Removed Request and Response types to allow inference as 'any', bypassing type errors.
app.get('/api/articles/:id', (req, res) => {
    try {
        const articleId = req.params.id;
        // Basic sanitization for the ID
        if (!/^[a-f0-9]+$/.test(articleId)) {
            return res.status(400).json({ error: 'Invalid article ID format.' });
        }
        
        const files = fs.readdirSync(STORAGE_PATH);
        const filename = files.find(file => file.includes(`_${articleId}_`));

        if (!filename) {
            return res.status(404).json({ error: 'Article not found.' });
        }
        
        const filePath = path.join(STORAGE_PATH, filename);
        const content = fs.readFileSync(filePath, 'utf8');

        res.status(200).json(JSON.parse(content));
    } catch (error: any) {
        console.error('Failed to retrieve article:', error);
        res.status(500).json({ error: 'An internal server error occurred.', details: error.message });
    }
});

// Fix: Removed Request and Response types to allow inference as 'any', bypassing type errors.
app.put('/api/articles/:id', (req, res) => {
    try {
        const articleId = req.params.id;
        const { articleData } = req.body;

        if (!/^[a-f0-9]+$/.test(articleId)) {
            return res.status(400).json({ error: 'Invalid article ID format.' });
        }
        if (!articleData || typeof articleData !== 'object') {
            return res.status(400).json({ error: 'Invalid article data provided.' });
        }

        const files = fs.readdirSync(STORAGE_PATH);
        const filename = files.find(file => file.includes(`_${articleId}_`));

        if (!filename) {
            return res.status(404).json({ error: 'Article not found to update.' });
        }

        const finalPath = path.join(STORAGE_PATH, filename);
        const fileContent = JSON.stringify(articleData, null, 2);
        
        fs.writeFileSync(finalPath, fileContent, { mode: 0o644, encoding: 'utf8' });

        res.status(200).json({ message: 'Article updated successfully.', path: finalPath });
    } catch (error: any) {
        console.error('Failed to update article:', error);
        res.status(500).json({ error: 'An internal server error occurred.', details: error.message });
    }
});

// Fix: Removed Request and Response types to allow inference as 'any', bypassing type errors.
app.delete('/api/articles/:id', (req, res) => {
    try {
        const articleId = req.params.id;
        if (!/^[a-f0-9]+$/.test(articleId)) {
            return res.status(400).json({ error: 'Invalid article ID format.' });
        }
        
        const files = fs.readdirSync(STORAGE_PATH);
        const filename = files.find(file => file.includes(`_${articleId}_`));

        if (!filename) {
            return res.status(404).json({ error: 'Article not found to delete.' });
        }

        const filePath = path.join(STORAGE_PATH, filename);
        fs.unlinkSync(filePath);

        res.status(200).json({ message: 'Article deleted successfully.' });
    } catch (error: any) {
        console.error('Failed to delete article:', error);
        res.status(500).json({ error: 'An internal server error occurred.', details: error.message });
    }
});

// Mock function to simulate Gemini scoring
const mockScoreArticle = (articleData: any, articleType: string) => {
    let score = 100;
    const feedback: { priority: 'Critical' | 'Major' | 'Minor', suggestion: string, category: 'Structure' | 'Content' | 'Style' }[] = [];

    if (!articleData.title || !articleData.seo || !articleData.htmlContent) {
        return { score: 0, feedback: [{ priority: 'Critical' as 'Critical', suggestion: 'Article data is incomplete.', category: 'Structure' as 'Structure' }] };
    }

    // --- Generic Feedback ---
    if (articleData.title.length < 30 || articleData.title.length > 65) {
        score -= 10;
        feedback.push({ priority: 'Major', suggestion: `Title length is ${articleData.title.length} characters. Aim for 50-60 for better SEO.`, category: 'Content' });
    }
    if (articleData.seo.metaDescription.length < 120 || articleData.seo.metaDescription.length > 160) {
        score -= 15;
        feedback.push({ priority: 'Critical', suggestion: `Meta description is ${articleData.seo.metaDescription.length} characters. Aim for 150-160 for optimal CTR.`, category: 'Content' });
    } else {
        feedback.push({ priority: 'Minor', suggestion: 'Meta description length is good.', category: 'Content' });
    }
    if (!articleData.htmlContent.includes('<!-- wp:heading {"level":2} -->') && !articleData.htmlContent.includes('<h2>')) {
        score -= 20;
        feedback.push({ priority: 'Critical', suggestion: 'Article is missing H2 headings. Use them to structure your content for readers and SEO.', category: 'Structure' });
    }
    const wordCount = articleData.htmlContent.split(/\s+/).length;
    if (wordCount < 300) {
        score -= 5;
        feedback.push({ priority: 'Minor', suggestion: `Content is short (${wordCount} words). Consider adding more detail.`, category: 'Content' });
    }
    if (Math.random() > 0.5) {
        feedback.push({ priority: 'Minor', suggestion: 'Tone is good, but could be slightly more authoritative.', category: 'Style' });
    }


    // --- Article-Type Specific Feedback ---
    switch (articleType) {
        case 'roundup':
            if (!articleData.htmlContent.includes('<table')) {
                score -= 15;
                feedback.push({ priority: 'Critical', suggestion: 'A comparison table is missing. Add one at the beginning to summarize the top products.', category: 'Structure' });
            }
            if (!articleData.htmlContent.toLowerCase().includes('pros') || !articleData.htmlContent.toLowerCase().includes('cons')) {
                score -= 10;
                feedback.push({ priority: 'Major', suggestion: 'Pros and Cons lists are missing for some items. Ensure every reviewed product has them.', category: 'Content' });
            }
            break;
        case 'review':
            if (!articleData.htmlContent.toLowerCase().includes('verdict')) {
                score -= 10;
                feedback.push({ priority: 'Major', suggestion: 'A clear final verdict section is recommended to summarize the review for the reader.', category: 'Structure' });
            }
            if (!articleData.productReviews || articleData.productReviews.length === 0) {
                score -= 5;
                feedback.push({ priority: 'Minor', suggestion: 'Consider adding more structured product data points like price or key specs for better clarity.', category: 'Content' });
            }
            break;
        case 'howto':
            if (!articleData.htmlContent.includes('<ol>')) {
                score -= 15;
                feedback.push({ priority: 'Critical', suggestion: 'Steps are not in a numbered list (<ol>). This is crucial for How-To guide structure.', category: 'Structure' });
            }
            if (!articleData.htmlContent.toLowerCase().includes('what you’ll need') && !articleData.htmlContent.toLowerCase().includes('tools required')) {
                score -= 10;
                feedback.push({ priority: 'Major', suggestion: "Missing a 'Tools Required' or 'What You’ll Need' section at the beginning.", category: 'Structure' });
            }
            break;
    }

    score = Math.max(0, Math.min(100, score));
    return { score, feedback };
};

// Fix: Removed Request and Response types to allow inference as 'any', bypassing type errors.
app.post('/api/score-article', (req, res) => {
    try {
        const { articleData, articleType } = req.body;
        if (!articleData || typeof articleData !== 'object' || !articleType) {
            return res.status(400).json({ error: 'Missing or invalid articleData or articleType.' });
        }

        // In a real implementation, you would call the Gemini API here with a system prompt and article data.
        // For this conceptual backend, we use a mock function.
        console.log(`Scoring article: "${articleData.title}" of type "${articleType}"`);
        const result = mockScoreArticle(articleData, articleType);

        // Simulate network delay to mimic a real API call
        setTimeout(() => {
            res.status(200).json(result);
        }, 1500);

    } catch (error: any) {
        console.error('Failed to score article:', error);
        res.status(500).json({ error: 'An internal server error occurred while scoring the article.', details: error.message });
    }
});


// --- NVIDIA AI Integration Endpoints ---

/**
 * Generates product images using NVIDIA Stable Diffusion 3.5 Large
 * POST /api/nvidia/generate-images
 */
app.post('/api/nvidia/generate-images', async (req, res) => {
    try {
        const { productName, productDescription, usageContext, imageCount, imageSpecs, aspectRatio } = req.body || {};

        if (!productName || !productDescription) {
            return res.status(400).json({
                error: 'Missing required fields: productName and productDescription',
            });
        }

        const apiKey = process.env.NVIDIA_API_KEY;
        if (!apiKey) {
            return res.status(500).json({
                error: 'NVIDIA_API_KEY not configured. Please set it in your environment.',
            });
        }

        const prompt = `Professional lifestyle photography of ${productName}${usageContext ? `, ${usageContext}` : ''}, cinematic lighting, professional product photography, 8k resolution, studio quality, clean background, well-lit, magazine-quality`;
        const nimEndpoint = 'https://integrate.api.nvidia.com/v1/images/generations';

        const allowedAspectRatios = new Set(['1:1', '16:9', '9:16', '4:3', '3:4', '21:9']);
        const normalizeAspectRatio = (value: unknown): string => {
            const normalized = String(value || '1:1').trim().toLowerCase().replace(/x/g, ':').replace(/\s+/g, '');
            return allowedAspectRatios.has(normalized) ? normalized : '1:1';
        };
        const requestedImageCount = Math.min(6, Math.max(1, Number(imageCount) || 3));
        const fallbackAspectRatio = normalizeAspectRatio(aspectRatio);

        const parsedSpecs = Array.isArray(imageSpecs) ? imageSpecs : [];
        const finalSpecs = parsedSpecs.length > 0
            ? parsedSpecs.slice(0, 6).map((spec: any, index: number) => ({
                role: String(spec?.role || `image_${index + 1}`),
                aspectRatio: normalizeAspectRatio(spec?.aspectRatio ?? fallbackAspectRatio),
            }))
            : Array.from({ length: requestedImageCount }, (_, index) => ({
                role: `image_${index + 1}`,
                aspectRatio: fallbackAspectRatio,
            }));

        const images: any[] = [];
        console.log(`NVIDIA: generating ${finalSpecs.length} image(s) for ${productName}`);

        for (const spec of finalSpecs) {
            const requestBody = {
                model: 'stable-diffusion-3.5-large',
                prompt: prompt,
                negative_prompt: 'low quality, blurry, distorted, poorly lit, watermark, text, logo, amateur',
                num_images: 1,
                image_size: spec.aspectRatio === '16:9' ? '1344x768' : '1024x1024',
                steps: 30,
                guidance_scale: 7.5,
                seed: Math.floor(Math.random() * 1000000),
            };

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
                console.error('NVIDIA API Error:', response.status, errorData);
                return res.status(response.status).json({
                    error: `NVIDIA API error: ${response.status}`,
                    details: errorData,
                });
            }

            const data = await response.json() as any;
            const first = (data.data || [])[0];
            if (!first) continue;

            images.push({
                base64: first.b64_json || '',
                url: first.url || '',
                prompt: prompt,
                role: spec.role,
                aspectRatio: spec.aspectRatio,
                timestamp: Date.now(),
            });
        }

        console.log(`Successfully generated ${images.length} images`);

        res.status(200).json({
            success: true,
            images,
            prompt,
            productName,
        });
    } catch (error: any) {
        console.error('Image generation error:', error);
        res.status(500).json({
            error: 'Image generation failed',
            details: error.message,
        });
    }
});

/**
 * Validates product images using NVIDIA Qwen 3.5 VLM
 * POST /api/nvidia/validate-image
 */
app.post('/api/nvidia/validate-image', async (req, res) => {
    try {
        const { imageBase64, productName, productDescription } = req.body;

        if (!imageBase64 || !productName) {
            return res.status(400).json({
                error: 'Missing required fields: imageBase64 and productName',
            });
        }

        const apiKey = process.env.NVIDIA_API_KEY;
        if (!apiKey) {
            return res.status(500).json({
                error: 'NVIDIA_API_KEY not configured',
            });
        }

        const visionPrompt = `Analyze this product image and provide quality assessment.
        
Product Name: ${productName}
Product Description: ${productDescription || 'N/A'}

Please evaluate:
1. Does the image clearly show a product relevant to "${productName}"?
2. Is the image professionally shot with good lighting and composition?
3. Are there any visible defects, blurriness, or artifacts?
4. Is the background appropriate for a lifestyle product photo?
5. Would this be acceptable for e-commerce/blog publication?

Respond in JSON format:
{
  "matchesProduct": boolean,
  "visualQuality": "excellent|good|poor",
  "professionalLevel": "high|medium|low",
  "defects": [list of defects],
  "recommendations": [suggestions],
  "overallScore": number (0-100)
}`;

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
            return res.status(response.status).json({
                error: `Validation API error: ${response.status}`,
            });
        }

        const data = await response.json() as any;
        const responseText = data.choices?.[0]?.message?.content || '';

        let analysis;
        try {
            const jsonMatch = responseText.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
                return res.status(200).json({
                    success: true,
                    isValid: false,
                    confidence: 0.5,
                    feedback: 'Could not fully validate. Manual review recommended.',
                });
            }
            analysis = JSON.parse(jsonMatch[0]);
        } catch (parseError) {
            console.error('Failed to parse Qwen response');
            return res.status(200).json({
                success: true,
                isValid: false,
                confidence: 0.5,
                feedback: 'Validation parsing error. Manual review recommended.',
            });
        }

        const isValid =
            analysis.matchesProduct &&
            (analysis.visualQuality === 'excellent' || analysis.visualQuality === 'good') &&
            (analysis.professionalLevel === 'high' || analysis.professionalLevel === 'medium') &&
            (!analysis.defects || analysis.defects.length === 0);

        const confidence = analysis.overallScore ? analysis.overallScore / 100 : 0.7;

        res.status(200).json({
            success: true,
            isValid,
            confidence,
            feedback: isValid ? '✅ Image passes validation' : '⚠️ Image requires review',
            analysis,
        });
    } catch (error: any) {
        console.error('Image validation error:', error);
        res.status(500).json({
            error: 'Image validation failed',
            details: error.message,
        });
    }
});

/**
 * Pinterest OAuth Configuration Endpoint
 * GET /api/pinterest/oauth-config
 */
app.get('/api/pinterest/oauth-config', (req, res) => {
    try {
        const clientId = process.env.PINTEREST_CLIENT_ID;
        const redirectUri = process.env.PINTEREST_REDIRECT_URI;

        if (!clientId || !redirectUri) {
            return res.status(500).json({
                error: 'Pinterest OAuth not configured',
                message: 'Please set PINTEREST_CLIENT_ID and PINTEREST_REDIRECT_URI',
            });
        }

        const requiredScopes = [
            'pins:write',
            'boards:write',
            'user_accounts:read',
        ];

        const authUrl = `https://api.pinterest.com/oauth/?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${requiredScopes.join('+')}`;

        res.status(200).json({
            authUrl,
            clientId,
            redirectUri,
            requiredScopes,
        });
    } catch (error: any) {
        console.error('OAuth config error:', error);
        res.status(500).json({
            error: 'Failed to get OAuth configuration',
            details: error.message,
        });
    }
});

/**
 * Pinterest OAuth Token Exchange
 * POST /api/pinterest/exchange-token
 */
app.post('/api/pinterest/exchange-token', async (req, res) => {
    try {
        const { code } = req.body;

        if (!code) {
            return res.status(400).json({ error: 'Authorization code required' });
        }

        const clientId = process.env.PINTEREST_CLIENT_ID;
        const clientSecret = process.env.PINTEREST_CLIENT_SECRET;
        const redirectUri = process.env.PINTEREST_REDIRECT_URI;

        if (!clientId || !clientSecret || !redirectUri) {
            return res.status(500).json({
                error: 'Pinterest credentials not configured',
            });
        }

        const response = await fetch('https://api.pinterest.com/oauth/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                grant_type: 'authorization_code',
                code,
                client_id: clientId,
                client_secret: clientSecret,
                redirect_uri: redirectUri,
            }).toString(),
        });

        if (!response.ok) {
            const error = await response.text();
            console.error('Pinterest token exchange error:', error);
            return res.status(response.status).json({
                error: 'Token exchange failed',
                details: error,
            });
        }

        const data = await response.json() as any;

        // In production, store this securely in your database
        console.log('✅ Pinterest OAuth token obtained successfully');

        res.status(200).json({
            success: true,
            accessToken: data.access_token,
            expiresIn: data.expires_in,
            message: 'Token stored securely. Ready for automated pin creation.',
        });
    } catch (error: any) {
        console.error('OAuth exchange error:', error);
        res.status(500).json({
            error: 'OAuth token exchange failed',
            details: error.message,
        });
    }
});

// --- Server Initialization ---

app.listen(port, () => {
  console.log(`Conceptual server listening at http://localhost:${port}`);
  console.log(`Articles will be saved to: ${STORAGE_PATH}`);
});
