

import { GoogleGenAI, GenerateContentResponse, Type, HarmCategory, HarmBlockThreshold } from '@google/genai';
import type { BlogPostData, AmazonProduct, CombinedPostResponse, ExtractedRecipeData, Blueprint, ScoreFeedback } from '../types';
import { getLinksForNiche, formatLinksForPrompt } from './linkRepository';
import { validateAndParseBlogPost, validateAndParseCombinedPost, validateAndParseExtractedRecipe, extractedRecipeDataSchema, combinedPostResponseSchema } from './validationService';
import { searchRelatedArticles, extractTopicForSearch } from './webSearchService';
import { getSeedLinksForBlueprint } from './externalLinkVault';
import { generateTextWithHuggingFaceFallback } from './huggingfaceService';
import { generateTextWithOpenRouter } from './openRouterService';
import { generateTextWithGroq } from './groqService';
import { generateTextWithCerebras } from './cerebrasService';
import { generateTextWithTogether } from './togetherService';
import { generateTextWithMistral } from './mistralService';
import { generateTextWithSiliconFlow } from './siliconFlowService';
import { generateTextWithCloudflare } from './cloudflareTextService';
import { generateTextWithBeastMode } from './beastModeService';
import { generateImage as generateFreeImage } from './freeImageService';



export class QuotaError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'QuotaError';
    }
}

export class BillingQuotaError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'BillingQuotaError';
    }
}

export class ModelOverloadedError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ModelOverloadedError';
    }
}

export class TimeoutError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'TimeoutError';
    }
}

const getAiClient = (apiKey: string): GoogleGenAI => {
    if (!apiKey) {
        throw new Error("A Gemini API key is required. Please provide one in the API Configuration section.");
    }
    return new GoogleGenAI({ apiKey });
};



// --- END: Response Schemas ---

const timeoutPromise = (ms: number) => new Promise((_, reject) => setTimeout(() => reject(new TimeoutError(`Operation timed out after ${ms} ms`)), ms));

const makeGeminiRequest = async (
    apiKey: string,
    prompt: string,
    modelName: 'gemini-2.5-pro' | 'gemini-2.5-flash' | 'gemini-flash-latest' = 'gemini-2.5-flash',
    jsonSchema?: object
): Promise<GenerateContentResponse> => {
    const ai = getAiClient(apiKey);
    const MAX_RETRIES = 5;
    const INITIAL_BACKOFF_MS = 4000;

    // Explicitly loosen safety settings to prevent blocking content from valid URLs
    const safetySettings = [
        { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
    ];

    let lastError: any;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
            // Race the API call against a timeout to prevent infinite hanging
            const apiCall = ai.models.generateContent({
                model: modelName,
                contents: prompt,
                config: {
                    temperature: 0.7,
                    safetySettings: safetySettings,
                    ...(jsonSchema ? {
                        responseMimeType: 'application/json',
                        responseSchema: jsonSchema,
                    } : {})
                }
            });

            const response = await Promise.race([apiCall, timeoutPromise(180000)]) as GenerateContentResponse;

            if (!response.text) {
                throw new Error("The AI model returned an empty response. This might be due to a safety policy violation or an internal model error.");
            }

            return response;

        } catch (error: any) {
            lastError = error;
            const errorMessage = error.toString().toLowerCase();

            // Check if error is worth retrying (Overloaded or Rate Limit)
            const isOverloaded = errorMessage.includes('503') || errorMessage.includes('model is overloaded');
            const isRateLimit = errorMessage.includes('429');

            if ((isOverloaded || isRateLimit) && attempt < MAX_RETRIES) {
                const backoffTime = INITIAL_BACKOFF_MS * Math.pow(2, attempt);
                console.warn(`[Gemini API] Attempt ${attempt + 1}/${MAX_RETRIES + 1} failed (${isOverloaded ? 'Overloaded' : 'Rate Limit'}). Retrying in ${backoffTime}ms...`);
                await new Promise(resolve => setTimeout(resolve, backoffTime));
                continue;
            }

            // If we've run out of retries or it's a non-retriable error, break and throw
            break;
        }
    }

    // Process the final error if we couldn't succeed
    console.error('Gemini API Final Error:', lastError);

    if (lastError instanceof TimeoutError) {
        throw new Error("The AI generation request timed out. The model might be overloaded or the input context is too large. Please try again.");
    }

    const errorMessage = lastError.toString();
    if (errorMessage.includes('429') && errorMessage.toLowerCase().includes('quota')) {
        if (errorMessage.toLowerCase().includes('billing')) {
            throw new BillingQuotaError("Your Gemini API key has exceeded its billing quota. Please check your Google Cloud project billing status.");
        }
        throw new QuotaError("You have exceeded your Gemini API quota. Please check your usage and limits in your Google AI Studio dashboard.");
    }

    // Explicitly handle overloaded error after retries fail
    if (errorMessage.includes('503') || errorMessage.toLowerCase().includes('model is overloaded')) {
        throw new ModelOverloadedError("The Gemini model is currently seeing very high traffic. Please try again in 1-2 minutes.");
    }

    throw new Error(`Gemini API request failed: ${errorMessage} `);
};

export const generateTextWithGemini = async (prompt: string, apiKey: string): Promise<string> => {
    const response = await makeGeminiRequest(apiKey, prompt);
    return response.text();
};

const cleanHtml = (html: string): string => {
    return html
        .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
        .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
        .replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, "")
        .replace(/<footer\b[^>]*>[\s\S]*?<\/footer>/gi, "")
        .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, "")
        .replace(/<!--[\s\S]*?-->/g, "")
        .replace(/\s+/g, " ")
        .trim();
};

// Strip markdown formatting from HTML content
const stripMarkdownFormatting = (html: string): string => {
    return html
        // Remove bold markdown (**text** or __text__)
        // But preserve placeholders like [CONTENT_SECTION_IMAGE_1]
        .replace(/\*\*(.+?)\*\*/g, '$1')
        // Only remove __ when NOT inside square brackets
        .replace(/(?<!\[)__(?![^\[]*\])(.+?)(?<!\[)__(?![^\[]*\])/g, '$1')
        // Remove italic markdown (*text*) - but preserve list asterisks and placeholders
        .replace(/(?<!\s|\[)\*(?!\s|\*)(.+?)(?<!\s)\*(?!\s|\])/g, '$1')
        // Only remove single _ when NOT inside square brackets
        .replace(/(?<!\[|\\s)_(?![^\[]*\])(.+?)(?<!\[)_(?![^\[]*\]|\s)/g, '$1')
        // Remove strikethrough (~~text~~)
        .replace(/~~(.+?)~~/g, '$1')
        // Clean up any remaining double asterisks (but not inside brackets)
        .replace(/(?<!\[)\*\*(?![^\[]*\])/g, '');
};

export const extractDataFromUrl = async (htmlContent: string, apiKey: string): Promise<ExtractedRecipeData> => {
    // 0. Structural Integrity & CAPTCHA Check (Fail Fast)
    // Prevent AI hallucinations by ensuring we have enough content and no CAPTCHAs before paying for tokens.
    if (!htmlContent || htmlContent.length < 1000) {
        throw new Error(`HTML content is too short (${htmlContent?.length || 0} chars). Scraping likely failed.`);
    }

    if (htmlContent.includes("Type the characters you see below") || htmlContent.includes("captchacharacters")) {
        throw new Error("Amazon CAPTCHA detected. Parsing aborted.");
    }

    // Ensure we have at least a title tag (H1 or Amazon's productTitle) or a general title to verify it's a valid page
    // Relaxed check: Case-insensitive, checks for h1, title tag, or specific Amazon IDs
    // ALSO: Support Markdown format from Jina Reader (# Title or ## Title)
    const lowerHtml = htmlContent.toLowerCase();
    const hasHtmlTitle = lowerHtml.includes('<h1') || lowerHtml.includes('producttitle') || lowerHtml.includes('id="title"') || lowerHtml.includes('<title');
    const hasMarkdownTitle = /^#{1,3}\s+.{10,}/m.test(htmlContent); // Markdown heading with substantial text

    if (!hasHtmlTitle && !hasMarkdownTitle) {
        throw new Error("Missing critical title tags (H1, title, or productTitle). HTML structure is invalid.");
    }

    // Clean HTML first to remove noise (scripts, styles, footers) which confuses the AI
    const cleanedHtml = cleanHtml(htmlContent);

    // Truncate HTML to prevent payload too large errors, but keep enough for Amazon pages
    // Increased from 50k to 500k to ensure we capture the main product title and description
    const truncatedHtml = cleanedHtml.length > 500000 ? cleanedHtml.substring(0, 500000) + "...[TRUNCATED]" : cleanedHtml;

    const prompt = `
        **[FRAMEWORK: ICDF - DATA EXTRACTION]**
        
        **1. INSTRUCTION (I):**
        Analyze the provided web content and extract structured data. Your goal is to ground all text in reality based ONLY on the source provided. Do not hallucinate.
        
        **2. CONTEXT (C):**
        Source Type: Webpage Content (HTML/Markdown)
        Blueprint Mode: ${truncatedHtml.length > 10000 ? 'Deep Analysis' : 'Standard Extraction'}
        
        **3. DATA (D) - TARGET FIELDS:**
        - **Niche**: Identify (tech, food, home, etc.)
        - **Main Title**: 
            * Amazon: Use 'productTitle' or 'h1#title'. 
            * Recipe: Use the recipe name.
            * Article: Use the main header.
        - **Product Specs/Ingredients**: 
            * Products: Extract technical specs (RAM, Storage, Size).
            * Food: Extract ingredients list.
        - **Features/Instructions**: 
            * Products: Extract bullet points of features.
            * Food: Extract cooking steps.
        - **Commerce**: Identify the primary product and up to 4 related products/accessories.
        
        **4. FORMAT (F):**
        Respond strictly in valid JSON format matching the provided schema.
        
        **CONTENT TO PROCESS:**
        """
        ${truncatedHtml}
        """
    `;

    // Use Flash for extraction as it is faster and supports large context well
    const response = await makeGeminiRequest(apiKey, prompt, 'gemini-2.5-flash', extractedRecipeDataSchema);
    const data = JSON.parse(response.text);

    // CRITICAL FIX: Fallback Title Extraction
    // If AI returns a generic title, try to extract it directly from HTML via Regex
    if (data.title && (
        data.title.toLowerCase().includes('amazon product') ||
        data.title.toLowerCase().includes('asin') ||
        data.title.toLowerCase().includes('unknown product') ||
        data.title.trim().length < 5
    )) {
        console.warn(`[Gemini Extraction] Generic title detected: "${data.title}". Attempting Regex fallback...`);
        const fallbackTitle = extractTitleFromHtml(htmlContent);
        if (fallbackTitle) {
            console.log(`[Gemini Extraction] Regex fallback successful. New title: "${fallbackTitle}"`);
            data.title = fallbackTitle;
        }
    }

    return validateAndParseExtractedRecipe(data);
};

// Helper: Extract title directly from HTML as a fallback
export const extractTitleFromHtml = (html: string): string | null => {
    try {
        // 1. Try Amazon-specific ID (Standard & Mobile)
        const amazonTitleMatch = html.match(/<span[^>]*id="productTitle"[^>]*>([\s\S]*?)<\/span>/i) ||
            html.match(/<h1[^>]*id="title"[^>]*>([\s\S]*?)<\/h1>/i) ||
            html.match(/<div[^>]*id="title_feature_div"[^>]*>[\s\S]*?<span[^>]*>([\s\S]*?)<\/span>/i);

        if (amazonTitleMatch && amazonTitleMatch[1]) {
            return amazonTitleMatch[1].trim();
        }

        // 2. Try OpenGraph Title (Reliable fallback for social shares)
        const ogTitleMatch = html.match(/<meta\s+property="og:title"\s+content="([^"]*)"/i) ||
            html.match(/<meta\s+name="title"\s+content="([^"]*)"/i);
        if (ogTitleMatch && ogTitleMatch[1]) {
            const cleaned = ogTitleMatch[1].replace(/^Amazon\.com\s*:\s*/i, '').trim();
            if (cleaned && cleaned.toLowerCase() !== 'amazon.com') return cleaned;
        }

        // 3. Try Standard H1
        const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
        if (h1Match && h1Match[1]) {
            return h1Match[1].trim();
        }

        // 4. Try <title> tag
        const titleTagMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
        if (titleTagMatch && titleTagMatch[1]) {
            // Clean up title tag (often has "Amazon.com: " prefix)
            const cleaned = titleTagMatch[1]
                .replace(/^Amazon\.com\s*:\s*/i, '')
                .replace(/\s*:\s*Electronics$/i, '')
                .replace(/\s*:\s*Garden & Outdoor$/i, '')
                .replace(/\s*:\s*Home & Kitchen$/i, '')
                .trim();
            // Reject if it's just "Amazon.com" or empty
            if (cleaned.toLowerCase() === 'amazon.com' || !cleaned) return null;
            return cleaned;
        }
    } catch (e) {
        console.warn('Regex title extraction failed', e);
    }
    return null;
};

// Helper: Normalize JSON structure to match expected schema
const normalizeJsonStructure = (data: any, blueprint: Blueprint): any => {
    // If already has correct structure, return as-is
    if (data.blogPostData) {
        if (!data.productData) data.productData = [];
        return data;
    }

    // If root object looks like blogPostData content, wrap it
    if (data.title || data.htmlContent || data.niche) {
        console.log('[Normalize] Wrapping malformed JSON with blogPostData');
        return {
            blogPostData: {
                niche: data.niche || 'lifestyle',
                title: data.title || 'Untitled Post',
                category: data.category || 'Uncategorized',
                heroImage: data.heroImage || 'modern lifestyle product photography',
                ingredients: data.ingredients || [],
                steps: data.steps || [],
                htmlContent: data.htmlContent || '<p>Content generation in progress...</p>',
                seo: data.seo || {
                    metaTitle: data.title || 'Blog Post',
                    metaDescription: 'Generated content',
                    focusKeyphrase: ''
                },
                ...data
            },
            productData: data.productData || []
        };
    }

    // Unknown structure - return with warning
    console.warn('[Normalize] Unknown JSON structure, returning as-is');
    return data;
};

const blueprintToCanonicalNiche = (blueprint: Blueprint): string => {
    return blueprint === 'recipe' ? 'food' : blueprint;
};

const deriveFallbackProductData = (
    sourceInput: ExtractedRecipeData | string | undefined,
    existingProductData: AmazonProduct[] | undefined,
    blueprint: Blueprint
): AmazonProduct[] => {
    if (blueprint !== 'recipe') {
        return existingProductData || [];
    }

    if (Array.isArray(existingProductData) && existingProductData.length > 0) {
        return existingProductData;
    }

    if (!sourceInput || typeof sourceInput === 'string' || !Array.isArray(sourceInput.products)) {
        return existingProductData || [];
    }

    return sourceInput.products
        .filter(Boolean)
        .map((product, index) => ({
            id: typeof product?.id === 'number' ? product.id : index + 1,
            productName: String(product?.productName || `Product ${index + 1}`).trim(),
            isPrimary: Boolean(product?.isPrimary || index === 0),
            price: product?.price,
            specs: product?.specs,
            imageUrl: product?.imageUrl,
            url: product?.url,
        }))
        .filter(product => product.productName.length > 0);
};

const finalizeCombinedPostForBlueprint = (
    data: any,
    blueprint: Blueprint,
    sourceInput?: ExtractedRecipeData | string
): CombinedPostResponse => {
    const normalized = normalizeJsonStructure(data, blueprint);
    normalized.productData = deriveFallbackProductData(sourceInput, normalized.productData, blueprint);
    const parsed = validateAndParseCombinedPost(normalized);
    parsed.productData = deriveFallbackProductData(sourceInput, parsed.productData, blueprint);

    if (parsed.blogPostData) {
        parsed.blogPostData.niche = blueprintToCanonicalNiche(blueprint);

        if (blueprint !== 'recipe') {
            parsed.blogPostData.htmlContent = String(parsed.blogPostData.htmlContent || '')
                .replace(/\[RECIPE_CARD_CONTENT\]/gi, '')
                .trim();
        }
    }

    return parsed;
};

// Helper: Create minimal valid post as last resort fallback
const createMinimalPost = (input: ExtractedRecipeData | string, blueprint: Blueprint): CombinedPostResponse => {
    console.warn('[Fallback] Creating minimal post structure');

    let title = 'Blog Post';
    let niche = 'lifestyle';

    if (typeof input === 'string') {
        title = input.slice(0, 100);
    } else {
        title = input.title || 'Product Review';
        niche = input.niche || 'lifestyle';
    }

    return {
        blogPostData: {
            niche,
            title,
            category: 'Uncategorized',
            heroImage: 'professional lifestyle photography, modern aesthetic',
            heroImageMetadata: {
                alt: title,
                title: title,
                caption: '',
                description: ''
            },
            ingredients: [],
            steps: [],
            prepTime: '',
            cookTime: '',
            servings: '',
            difficulty: '',
            calories: '',
            tags: {
                course: [],
                cuisine: [],
                keywords: []
            },
            seo: {
                metaTitle: title,
                metaDescription: `Learn more about ${title}`,
                focusKeyphrase: title.split(' ')[0]
            },
            tips: [],
            nutritionalInfo: [],
            faq: [],
            htmlContent: `
                [AFFILIATE_DISCLOSURE_BLOCK]
                <p>Welcome to this ${blueprint} post about ${title}.</p>
                [MAIN_CTA_BUTTON]
                <h2>Overview</h2>
                <p>This content is being generated. Please refresh to see updated content.</p>
                <h2>Conclusion</h2>
                <p>Thank you for reading!</p>
            `,
            whyYoullLoveThis: '',
            productReviews: []
        },
            productData: deriveFallbackProductData(input, [], blueprint)
    };
};

const getBlueprintSystemPrompt = (blueprint: Blueprint): string => {
    switch (blueprint) {
        case 'recipe': return "You are an expert food blogger. Generate a complete, SEO-optimized recipe post. Output valid JSON matching the schema. Use placeholders like [STEP_IMAGE_1] for images in HTML.";
        case 'roundup': return "You are an expert product reviewer. Generate a 'Best Of' listicle. Output valid JSON matching the schema. CRITICAL: Include 3-5 contentSections (e.g., 'Best Overall', 'Best Budget', 'Best Premium') with detailed image prompts for each section. The final image will be in a 16:9 landscape aspect ratio. Ensure the main subject is centered to allow for aggressive vertical cropping (panoramic 2.8:1). Use placeholders like [CONTENT_SECTION_IMAGE_1] for images in HTML. **CRITICAL IMAGE RULE**: ALL image prompts MUST be for STILL LIFE photography only. DO NOT describe people, hands, holding, or using the product. Describe the product resting on a surface.";
        case 'review': return "You are an expert tech/product reviewer. Generate an in-depth review. Output valid JSON matching the schema. CRITICAL: Include 3-5 contentSections (e.g., 'Unboxing', 'Design & Build', 'Performance', 'Battery Life', 'Verdict') with detailed image prompts for each section. The final image will be a 16:9 landscape aspect ratio. Ensure the main subject is centered to allow for aggressive vertical cropping (panoramic 2.8:1). Use placeholders like [CONTENT_SECTION_IMAGE_1] for images in HTML. **CRITICAL IMAGE RULE**: ALL image prompts MUST be for STILL LIFE photography only. DO NOT describe people, hands, holding, or using the product. Describe the product resting on a surface.";
        case 'howto': return "You are an expert DIY writer. Generate a 'How-To' guide. Output valid JSON matching the schema. CRITICAL: Include 3-5 contentSections for major phases/steps (e.g., 'Preparation', 'Assembly', 'Finishing Touches') with detailed image prompts for each section. Use placeholders like [CONTENT_SECTION_IMAGE_1] for images in HTML. **CRITICAL IMAGE RULE**: ALL image prompts MUST be for STILL LIFE photography only. DO NOT describe people, hands, holding, or using the product. Describe the tools or result resting on a surface.";
        default: return "Generate a blog post in valid JSON format.";
    }
};

export const generatePostFromExtractedData = async (
    input: ExtractedRecipeData | string,
    blueprint: Blueprint,
    config: AiConfig, // UPDATED: Accepts full config
    existingCategories?: string[]
): Promise<CombinedPostResponse> => {
    // 0. BEAST MODE OVERRIDE (Free Forever Tier / Keyless)
    // If flag is set OR if no Gemini Key is provided, use Beast Mode.
    if (config.useBeastMode || !config.geminiApiKey) {
        console.log('[GeminiService] 🦁 Force Beast Mode enabled. Bypassing Gemini.');
        const systemPrompt = getBlueprintSystemPrompt(blueprint);

        let userInputDescription = "";
        if (typeof input === 'string') userInputDescription = `Topic: ${input}`;
        else userInputDescription = `Extracted Data: ${JSON.stringify(input).slice(0, 10000)}`;

        // ENHANCED PROMPT: Explicitly request structure
        const prompt = `
            ${systemPrompt}
            ${userInputDescription}
            
            CRITICAL: Return EXACTLY this JSON structure (no extra text):
            {
              "blogPostData": {
                "niche": "string",
                "title": "string",
                "category": "string",
                "heroImage": "description for image",
                "ingredients": [],
                "steps": [],
                "htmlContent": "<p>Full HTML content here</p>",
                "seo": { "metaTitle": "", "metaDescription": "", "focusKeyphrase": "" }
              },
              "productData": []
            }
        `;

        try {
            const beastResponse = await generateTextWithBeastMode(prompt, "You are a professional blog writer. Output ONLY valid JSON.");
            const jsonData = extractJsonFromText(beastResponse);

            if (jsonData) {
                // CRITICAL FIX: Normalize structure if malformed
                const normalizedData = normalizeJsonStructure(jsonData, blueprint);
                console.log('[Beast Mode] JSON normalized successfully');
                return finalizeCombinedPostForBlueprint(normalizedData, blueprint, input);
            }
            throw new Error("Beast Mode returned empty or invalid JSON.");
        } catch (beastError: any) {
            console.error('[Beast Mode] Failed:', beastError.message);
            // Create minimal valid structure as last resort
            return createMinimalPost(input, blueprint);
        }
    }

    const apiKey = config.geminiApiKey;

    const systemPrompt = getBlueprintSystemPrompt(blueprint);

    let userInputDescription = "";
    if (typeof input === 'string') {
        if (input.length > 1000 || input.trim().startsWith('<')) {
            userInputDescription = `The user provided the following raw content / context to base the article on: \n\n"${input.slice(0, 30000)}"`;
        } else {
            userInputDescription = `The user's topic or keyword is: "${input}"`;
        }
    } else {
        userInputDescription = `The user provided extracted data from a URL: ${JSON.stringify(input, null, 2)}`;

        // Clarify data mapping for product-focused blueprints
        if (blueprint === 'review' || blueprint === 'roundup') {
            userInputDescription += "\n\n**NOTE:** The input data uses a generic schema. For reviews/roundups, please interpret 'ingredients' as 'Product Specifications' and 'steps' as 'Key Features/Selling Points'.";

            // CRITICAL: Handle ASIN Fallback Titles
            userInputDescription += "\n\n**CRITICAL TITLE RULE:** If the input 'title' is generic or a placeholder (e.g., 'Amazon Product', 'ASIN: B0...', 'Unknown Product'), you MUST identify the REAL product name from the 'Web Search Results' section below or the description. \n- **LOOK** at the 'Web Search Results' list for the ASIN to find the actual product name.\n- DO NOT title the post 'Amazon Product (ASIN:...)'. \n- DO NOT use the placeholder title.\n- EXAMPLE: If ASIN is 'B0D2Y5KYBF' (Glass Air Fryer), the post title MUST be 'Fritaire Glass Air Fryer Review', NOT 'Amazon Product Review'.";
        }
    }

    // Determine niche from input
    let niche = 'lifestyle'; // default
    if (typeof input === 'object' && input.niche) {
        niche = input.niche;
    } else if (blueprint === 'recipe') {
        niche = 'food';
    }



    // ... (existing imports)

    // Inside generateBlogPost function:

    // Get relevant internal links based on niche
    const relevantLinks = getLinksForNiche(niche);
    const formattedLinks = formatLinksForPrompt(relevantLinks);

    // Search the web for additional external links related to the topic
    const searchTopic = extractTopicForSearch(input);
    console.log(`[Web Search] Searching for external links on: "${searchTopic}"`);
    const externalLinks = await searchRelatedArticles(searchTopic, blueprint);
    console.log(`[Web Search] Found ${externalLinks.length} external links`);

    // Get high-authority seed links from the vault
    const seedLinks = getSeedLinksForBlueprint(blueprint, 5);
    const formattedSeedLinks = seedLinks.map(url => `- ${url} (Authority Source)`).join('\n');

    // Format external links for the AI prompt
    const formattedExternalLinks = externalLinks.length > 0
        ? externalLinks.map(link => `- ${link.title}: ${link.url}`).join('\n')
        : 'No specific web search results found.';

    // CRITICAL: Safety Halt REMOVED
    // We are trusting the enhanced extraction in App.tsx to provide valid data.
    // Even if web search fails (due to API limits), we should try to generate with what we have
    // rather than throwing a hard error. The 'hallucination' risk is mitigated by better scraping.
    // if ((input as any).title?.includes('Amazon Product (ASIN:') && externalLinks.length === 0) {
    //    throw new Error(`Automatic product identification failed for ASIN...`);
    // }

    // Format existing categories for the prompt
    const categoryInstruction = existingCategories && existingCategories.length > 0
        ? `
        **CATEGORY SELECTION (CRITICAL - READ CAREFULLY):**
        - You MUST select a category from the following existing categories ONLY
        - DO NOT create new categories or make up category names
        - Choose the MOST RELEVANT category from this list:
          ${existingCategories.map(cat => `• ${cat}`).join('\n          ')}
        - If none fit perfectly, choose the closest match
        - VIOLATION OF THIS RULE WILL CAUSE ARTICLE REJECTION
        `
        : `
        **CATEGORY SELECTION:**
        - Create an appropriate category name for this content
        `;

    const prompt = `
        **[FRAMEWORK: MICRO - LONG-FORM ARTICLE GENERATION]**

        **1. MISSION (M):**
        You are a world-class professional blogger and SEO expert specializing in the "${niche}" niche. 
        Your goal is to write a comprehensive, helpful, and high-converting ${blueprint} article that dominates search rankings.

        **2. INFORMATION (I):**
        - **Source Content:** ${userInputDescription}
        - **Verified Search Context:** ${formattedExternalLinks}
        - **Authority Seed Links:** ${formattedSeedLinks}
        - **Internal Link Pool:** ${formattedLinks}

        **3. CONSTRAINTS (C):**
        - **HTML-Only:** Use <strong>, <em>, <h2>, <h3>. NEVER use Markdown (** or _).
        - **Strict Linking:** 
            * 5-7 External Links from "Information" section (Verbatim URLs).
            * 2-3 Internal Links from "Internal Link Pool".
            * MINIMUM 5 Amazon Affiliate Links using \`[PRODUCT_AFFILIATE_LINK_X]\`.
        - **Visual Grounding:** Use \`[STEP_IMAGE_X]\` or \`[CONTENT_SECTION_IMAGE_X]\` placeholders. NO <img> tags.
        - **No Placeholders:** Never use [Insert Text Here]. If data is missing, use search context to fill it or omit gracefully.
        - **Tone:** Engaging, authoritative, and helpful.

        **4. RESPONSE STRUCTURE (R):**
        ${blueprint === 'recipe' ? `
        - [AFFILIATE_DISCLOSURE_BLOCK]
        - Engaging Introduction (2-3 paragraphs)
        - <h2>Ingredients</h2> (Detailed list)
        - [MAIN_CTA_BUTTON]
        - <h2>Instructions</h2> (Step-by-step with [STEP_IMAGE_X] after each paragraph)
        - [RECIPE_CARD_CONTENT]
        - <h2>Conclusion</h2>` : `
        - [AFFILIATE_DISCLOSURE_BLOCK]
        - Hook Introduction
        - [MAIN_CTA_BUTTON]
        - In-depth Body Sections (H2/H3) with [CONTENT_SECTION_IMAGE_X]
        - Pro-Tips & Buyer Advice
        - <h2>Conclusion</h2>`}

        **5. OUTPUT FORMAT (O):**
        Respond with a single JSON object matching the schema. Ensure all image prompts are 30+ words, descriptive, and photorealistic.

        ${categoryInstruction}
    `;

    // Use Gemini Flash for faster, more reliable generation
    const response = await makeGeminiRequest(apiKey, prompt, 'gemini-2.5-flash', combinedPostResponseSchema);
    const data = JSON.parse(response.text);

    // Strip markdown formatting from HTML content
    if (data.blogPostData && data.blogPostData.htmlContent) {
        data.blogPostData.htmlContent = stripMarkdownFormatting(data.blogPostData.htmlContent);
        console.log('[Gemini] Stripped markdown formatting from HTML content');
    }

    return finalizeCombinedPostForBlueprint(data, blueprint, input);
};

const cropBase64Image = (base64: string, targetAspectRatio: number): Promise<string> => {
    return new Promise((resolve, reject) => {
        // In a Node.js environment (like during SSR or testing), we can't use Image/Canvas.
        // However, this service is primarily used on the client-side.
        if (typeof window === 'undefined') {
            resolve(base64); // Return original if not in browser
            return;
        }

        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');

            if (!ctx) {
                resolve(base64);
                return;
            }

            const sourceWidth = img.width;
            const sourceHeight = img.height;
            const sourceAspectRatio = sourceWidth / sourceHeight;

            let drawWidth = sourceWidth;
            let drawHeight = sourceHeight;
            let offsetX = 0;
            let offsetY = 0;

            if (sourceAspectRatio > targetAspectRatio) {
                // Source is wider than target, crop width
                drawWidth = sourceHeight * targetAspectRatio;
                offsetX = (sourceWidth - drawWidth) / 2;
            } else {
                // Source is taller than target, crop height (This is our expected case: 16:9 -> 21:9)
                drawHeight = sourceWidth / targetAspectRatio;
                offsetY = (sourceHeight - drawHeight) / 2;
            }

            canvas.width = drawWidth;
            canvas.height = drawHeight;

            // Draw the cropped portion
            ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight, 0, 0, drawWidth, drawHeight);

            resolve(canvas.toDataURL('image/webp', 0.95));
        };
        img.onerror = (e) => reject(e);
        img.src = base64;
    });
};


export const generateImage = async (prompt: string, type: 'hero' | 'step' | 'product', niche: string, config: any, apiKey: string): Promise<string> => {
    const ai = getAiClient(apiKey);

    // Detect content type from prompt to apply appropriate styling
    const isTechnical = /pc|computer|motherboard|gpu|cpu|hardware|electronics|cable|component|installation|assembly|circuit|chip|processor|memory|storage|power supply|cooling|fan|build|setup|mount/i.test(prompt);
    const isFood = niche === 'food' || /food|recipe|cook|ingredient|dish|meal|bake|prepare/i.test(prompt);

    // SANITIZE PROMPT: Remove action verbs that imply hands/humans
    let sanitizedPrompt = prompt
        .replace(/\b(holding|held|hand|hands|finger|fingers|touching|lifting|grabbing|using|human|person|people|man|woman)\b/gi, "")
        .replace(/unboxing/gi, "product box sitting on a table");

    let engineeredPrompt = sanitizedPrompt;

    if (type === 'hero') {
        if (isFood) {
            engineeredPrompt = `Masterpiece food photography, 8k Resolution, RAW color, extreme detail. ${prompt}. Shot on 35mm lens, f/1.8, cinematic lighting, shallow depth of field, focus on textures, steam rising, vibrant natural colors. Professional studio setup, photorealistic, incredible detail. Wide angle 16:9 panoramic. NO hands, NO people.`;
        } else if (isTechnical) {
            engineeredPrompt = `Professional tech photography for a blog header, 8k Resolution, minimalist workspace. ${prompt}. Hyperrealistic, sharp focus on hardware, circuit boards, clean design. Modern studio lighting, crystal clear. Wide angle 16:9 panoramic. NO hands, NO people.`;
        } else {
            engineeredPrompt = `Masterpiece commercial photography, 8k Resolution, RAW color, sharp focus. ${prompt}. Cinematic lighting, expensive studio look, detailed textures, high-end production value. Shot with Sony A7R IV, clean and crisp. Wide angle 16:9 panoramic. NO hands, NO people.`;
        }
    } else if (type === 'step') {
        if (isFood) {
            engineeredPrompt = `Macro food photography, HIGH RESOLUTION close-up. ${prompt}. Hyperrealistic 8k quality, sharp focus on appetizing textures, glistening surfaces. Natural lighting, shallow depth of field. 16:9 widescreen. NO hands, NO people.`;
        } else if (isTechnical) {
            engineeredPrompt = `Extreme close-up of hardware components, HIGH RESOLUTION. ${prompt}. Hyperrealistic 8k, perfect focus on technical details. Studio lighting, clean composition. 16:9 widescreen. NO hands, NO people.`;
        } else {
            engineeredPrompt = `Detailed instructional photograph, 8k resolution, technical focus. ${prompt}. Crisp textures, natural lighting, high clarity, photorealistic. 16:9 widescreen. NO hands, NO people.`;
        }
    } else { // product
        engineeredPrompt = `Ultra-realistic product photography of ${prompt} on a light gray studio background. Professional studio lighting, pure clean background, 8k resolution, razor sharp detail, commercial quality. Centered, flawless shadow, photorealistic masterpiece. 1:1 square. NO hands, NO people.`;
    }

    const MAX_RETRIES = 5;
    const INITIAL_BACKOFF_MS = 4000;
    let lastError: any;

    try {
        // Enforce 16:9 for generation (supported by API).
        // We will crop to 2.2:1 (Ultrawide) client-side for 'hero' images to satisfy Kale Pro theme.
        const aspectRatio = (type === 'hero' || type === 'step') ? '16:9' : '1:1';

        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
            try {
                let response;
                try {
                    // Try Imagen 4.0 first - prompts now request high resolution
                    const apiCall = ai.models.generateImages({
                        model: 'imagen-4.0-generate-001',
                        prompt: engineeredPrompt,
                        config: {
                            numberOfImages: 1,
                            outputMimeType: 'image/webp',
                            aspectRatio: aspectRatio,
                        },
                    });
                    response = await Promise.race([apiCall, timeoutPromise(90000)]) as any;
                } catch (e: any) {
                    console.warn('Imagen 4.0 failed, falling back to Imagen 3.0:', e.message);
                    // Fallback to Imagen 3.0 - prompts now request high resolution
                    const apiCall = ai.models.generateImages({
                        model: 'imagen-3.0-generate-001',
                        prompt: engineeredPrompt,
                        config: {
                            numberOfImages: 1,
                            outputMimeType: 'image/webp',
                            aspectRatio: aspectRatio,
                        },
                    });
                    response = await Promise.race([apiCall, timeoutPromise(90000)]) as any;
                }

                if (!response.generatedImages || response.generatedImages.length === 0 || !response.generatedImages[0].image.imageBytes) {
                    throw new Error('Image generation succeeded but returned no image data.');
                }

                const base64Image = response.generatedImages[0].image.imageBytes;
                const fullImage = `data:image/webp;base64,${base64Image}`;

                return fullImage;

            } catch (error: any) {
                lastError = error;
                const errorMessage = error.toString().toLowerCase();

                // Check if error is worth retrying (Overloaded or Rate Limit)
                const isOverloaded = errorMessage.includes('503') || errorMessage.includes('model is overloaded');
                const isRateLimit = errorMessage.includes('429');

                if ((isOverloaded || isRateLimit) && attempt < MAX_RETRIES) {
                    const backoffTime = INITIAL_BACKOFF_MS * Math.pow(2, attempt);
                    console.warn(`[Gemini Image] Attempt ${attempt + 1}/${MAX_RETRIES + 1} failed (${isOverloaded ? 'Overloaded' : 'Rate Limit'}). Retrying in ${backoffTime}ms...`);
                    await new Promise(resolve => setTimeout(resolve, backoffTime));
                    continue;
                }

                // If we've run out of retries or it's a non-retriable error, break and throw
                break;
            }
        }

        // Process the final error if loop finishes without returning
        throw lastError;

    } catch (error: any) {
        const errorMsg = error?.message || error?.toString() || 'Unknown error';
        console.warn(`Gemini image generation failed for ${type}, falling back to free tier:`, errorMsg);

        // FALLBACK: Use Free Image Service (Beast Mode)
        try {
            console.log(`[Gemini Fallback] Attempting free image generation for ${type}...`);
            // We pass the full config here so it can use other keys if available
            return await generateFreeImage(prompt, type, niche, config);
        } catch (fallbackError: any) {
            console.error(`[Gemini Fallback] Free image generation also failed:`, fallbackError);

            // If everything fails, rethrow original error to let UI separate logic, 
            // OR return a placeholder if critical not to crash. 
            // For now, rethrow consistent error.

            if (error instanceof Error && (error.message.includes('503') || error.message.toLowerCase().includes('overloaded'))) {
                throw new ModelOverloadedError("The Gemini image generation model is temporarily overloaded. Please try again in 1-2 minutes.");
            }
            if (error instanceof TimeoutError) {
                throw new Error("Image generation timed out after 90 seconds.");
            }
            if (errorMsg.includes('quota') || errorMsg.includes('429')) {
                throw new QuotaError("Gemini API quota exceeded. Please check your API usage limits.");
            }

            throw new Error(`All image generation methods failed. Main Error: ${errorMsg} | Fallback Error: ${fallbackError.message}`);
        }
    }
};

const extractJsonFromText = (text: string): object | null => {
    const jsonBlockMatch = text.match(/```json\n([\s\S] *?) \n```/);
    if (jsonBlockMatch && jsonBlockMatch[1]) {
        try {
            return JSON.parse(jsonBlockMatch[1]);
        } catch (e) {
            console.error('Failed to parse content of JSON block:', e);
        }
    }

    const firstBrace = text.indexOf('{');
    const lastBrace = text.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
        const potentialJson = text.substring(firstBrace, lastBrace + 1);
        try {
            return JSON.parse(potentialJson);
        } catch (e) {
            console.error('Failed to parse substring as JSON:', e);
        }
    }

    try {
        return JSON.parse(text);
    } catch (e) {
        console.error('Failed to parse entire text as JSON:', e);
    }

    return null;
};


export const generatePostWithOpenSource = async (
    input: ExtractedRecipeData | string,
    blueprint: Blueprint
): Promise<CombinedPostResponse> => {
    console.log('[Fallback] Attempting text generation with Pollinations (Free Tier)...');

    const systemPrompt = getBlueprintSystemPrompt(blueprint);
    const MAX_INPUT_LENGTH = 2000;

    let inputStr = '';
    if (typeof input === 'string') {
        inputStr = input.replace(/\s+/g, ' ').trim();
    } else {
        try {
            const parts = [];
            if (input.title) parts.push(`Title: ${input.title} `);
            if (input.niche) parts.push(`Niche: ${input.niche} `);
            if (input.ingredients && Array.isArray(input.ingredients)) parts.push(`Ingredients: ${input.ingredients.join(', ')} `);
            if (input.instructions && Array.isArray(input.instructions)) parts.push(`Instructions: ${input.instructions.join(' ')} `);

            inputStr = parts.join('\n');
            if (!inputStr.trim()) inputStr = JSON.stringify(input).slice(0, MAX_INPUT_LENGTH);
        } catch (e) {
            inputStr = JSON.stringify(input).slice(0, MAX_INPUT_LENGTH);
        }
    }

    if (inputStr.length > MAX_INPUT_LENGTH) {
        console.warn(`[Fallback] Input too long(${inputStr.length} chars), truncating to ${MAX_INPUT_LENGTH} for Fallback.`);
        inputStr = inputStr.slice(0, MAX_INPUT_LENGTH) + "...";
    }

    const userInput = `Request: "${inputStr}"`;

    const prompt = `
        ${systemPrompt}
        ${userInput}

    IMPORTANT: You MUST return valid, parseable JSON only.Do not include any conversational text before or after the JSON.
        
        Required JSON Schema:
    {
        "blogPostData": {
            "niche": "string", "title": "string", "category": "string",
                "heroImage": "string",
                    "heroImageMetadata": { "alt": "string", "title": "string", "caption": "string", "description": "string" },
            "ingredients": ["string"],
                "steps": [{ "text": "string", "image": "string", "imageMetadata": { "alt": "string", "title": "string", "caption": "string", "description": "string" } }],
                    "prepTime": "string", "cookTime": "string", "servings": "string", "difficulty": "string", "calories": "string",
                        "tags": { "course": ["string"], "cuisine": ["string"], "keywords": ["string"] },
            "seo": { "metaTitle": "string", "metaDescription": "string", "focusKeyphrase": "string" },
            "tips": ["string"], "nutritionalInfo": ["string"],
                "faq": [{ "question": "string", "answer": "string" }],
                    "htmlContent": "string (HTML with placeholders like [STEP_IMAGE_1], [RECIPE_CARD_CONTENT], [MAIN_CTA_BUTTON])",
                        "whyYoullLoveThis": "string",
                            "productReviews": [{ "productId": 1, "reviewText": "string" }]
        },
        "productData": [
            { "id": 1, "productName": "string", "isPrimary": true, "price": "string" }
        ]
    }
    `;

    const config = JSON.parse(localStorage.getItem('postgenius_config') || '{}').aiConfig || {};

    // 1. Priority Fallback: Groq (Ultra-fast, High Limits)
    if (config.groqApiKey) {
        try {
            console.log('[Fallback] Attempting generation with Groq...');
            const groqResponse = await generateTextWithGroq(prompt, config, "You are a professional blog writer. Output strictly JSON.");
            const jsonData = extractJsonFromText(groqResponse);
            if (jsonData) {
                console.log('[Fallback] Groq generation successful.');
                if (!jsonData.productData) jsonData.productData = [];
                return finalizeCombinedPostForBlueprint(jsonData, blueprint, input);
            }
        } catch (groqError: any) {
            console.warn('[Fallback] Groq failed:', groqError.message);
        }
    }

    // 2. High-speed Fallback: Cerebras (Lightning fast Llama models)
    if (config.cerebrasApiKey) {
        try {
            console.log('[Fallback] Attempting generation with Cerebras...');
            const cerebrasResponse = await generateTextWithCerebras(prompt, config, "You are a professional blog writer. Output strictly JSON.");
            const jsonData = extractJsonFromText(cerebrasResponse);
            if (jsonData) {
                console.log('[Fallback] Cerebras generation successful.');
                if (!jsonData.productData) jsonData.productData = [];
                return finalizeCombinedPostForBlueprint(jsonData, blueprint, input);
            }
        } catch (cerebrasError: any) {
            console.warn('[Fallback] Cerebras failed:', cerebrasError.message);
        }
    }

    // 3. Robust Fallback: Together AI
    if (config.togetherApiKey) {
        try {
            console.log('[Fallback] Attempting generation with Together AI...');
            const togetherResponse = await generateTextWithTogether(prompt, config, "You are a professional blog writer. Output strictly JSON.");
            const jsonData = extractJsonFromText(togetherResponse);
            if (jsonData) {
                console.log('[Fallback] Together AI generation successful.');
                if (!jsonData.productData) jsonData.productData = [];
                return finalizeCombinedPostForBlueprint(jsonData, blueprint, input);
            }
        } catch (togetherError: any) {
            console.warn('[Fallback] Together AI failed:', togetherError.message);
        }
    }

    // 4. Foundation Fallback: Mistral AI
    if (config.mistralApiKey) {
        try {
            console.log('[Fallback] Attempting generation with Mistral AI...');
            const mistralResponse = await generateTextWithMistral(prompt, config, "You are a professional blog writer. Output strictly JSON.");
            const jsonData = extractJsonFromText(mistralResponse);
            if (jsonData) {
                console.log('[Fallback] Mistral AI generation successful.');
                if (!jsonData.productData) jsonData.productData = [];
                return finalizeCombinedPostForBlueprint(jsonData, blueprint, input);
            }
        } catch (mistralError: any) {
            console.warn('[Fallback] Mistral AI failed:', mistralError.message);
        }
    }
    // 5. SiliconFlow (Giant Chinese Models: Qwen 2.5/DeepSeek V3) - NEW!
    if (config.siliconFlowApiKey) {
        try {
            console.log('[Fallback] Attempting generation with SiliconFlow (Giant Chinese Models)...');
            const sfResponse = await generateTextWithSiliconFlow(prompt, config, "You are a professional blog writer. Output strictly JSON.");
            const jsonData = extractJsonFromText(sfResponse);
            if (jsonData) {
                console.log('[Fallback] SiliconFlow generation successful.');
                if (!jsonData.productData) jsonData.productData = [];
                return finalizeCombinedPostForBlueprint(jsonData, blueprint, input);
            }
        } catch (sfError: any) {
            console.warn('[Fallback] SiliconFlow failed:', sfError.message);
        }
    }

    // 6. Cloudflare Workers AI (Edge Network)
    if (config.cloudflareAccountId && config.cloudflareApiToken) {
        try {
            console.log('[Fallback] Attempting generation with Cloudflare Workers AI...');
            const cfResponse = await generateTextWithCloudflare(prompt, config, "You are a professional blog writer. Output strictly JSON.");
            const jsonData = extractJsonFromText(cfResponse);
            if (jsonData) {
                console.log('[Fallback] Cloudflare generation successful.');
                if (!jsonData.productData) jsonData.productData = [];
                return finalizeCombinedPostForBlueprint(jsonData, blueprint, input);
            }
        } catch (cfError: any) {
            console.warn('[Fallback] Cloudflare AI failed:', cfError.message);
        }
    }

    // 7. BEAST MODE (Zero-Config / Keyless) - The Ultimate Safety Net
    // Activates if users have NO keys or all above failed.
    // Uses Pollinations.ai (DeepSeek/Qwen/Mistral) for free.
    try {
        console.log('[Fallback] 🦁 Enter THE BEAST MODE (Keyless Auto-Pilot)...');
        const beastResponse = await generateTextWithBeastMode(prompt, "You are a professional blog writer. Output strictly JSON.");
        const jsonData = extractJsonFromText(beastResponse);
        if (jsonData) {
            console.log('[Fallback] Beast Mode generation successful.');
            if (!jsonData.productData) jsonData.productData = [];
            return finalizeCombinedPostForBlueprint(jsonData, blueprint, input);
        }
    } catch (beastError: any) {
        console.warn('[Fallback] Beast Mode failed:', beastError.message);
    }

    // 8. Try OpenRouter "Dragon" Models (Last Resort for Giant Models)
    try {
        if (config.openRouterApiKey) {
            console.log('[Fallback] Attempting generation with OpenRouter "Dragon" Models...');
            const dragonResponse = await generateTextWithOpenRouter(prompt, config, "You are a professional blog writer. Output strictly JSON.");
            const jsonData = extractJsonFromText(dragonResponse);
            if (jsonData) {
                console.log('[Fallback] OpenRouter generation successful.');
                if (!jsonData.productData) jsonData.productData = [];
                return finalizeCombinedPostForBlueprint(jsonData, blueprint, input);
            }
        }
    } catch (dragonError: any) {
        console.warn('[Fallback] OpenRouter Models failed:', dragonError.message);
    }

    // 3. Final Fallback: Pollinations.ai (Free Tier)
    console.log('[Fallback] Trying Pollinations.ai (Free Tier)...');
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 90000); // 90s timeout

        const response = await fetch('https://text.pollinations.ai/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                messages: [
                    { role: 'system', content: "You are a helpful AI assistant that outputs strictly JSON." },
                    { role: 'user', content: prompt }
                ],
                model: 'openai',
                seed: Math.floor(Math.random() * 1000),
                jsonMode: true
            }),
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            throw new Error(`Pollinations API error: ${response.statusText} `);
        }

        const text = await response.text();
        let jsonData = extractJsonFromText(text);

        if (!jsonData) {
            console.error("Pollinations returned raw text:", text);
            throw new Error('Fallback generation succeeded but returned invalid JSON.');
        }

        // CRITICAL FIX: Ensure schema compliance
        // The model sometimes omits 'productData' or 'blogPostData', causing validation errors.
        if (!jsonData.blogPostData && jsonData.niche) {
            // It might have returned a flat object instead of nested
            jsonData = { blogPostData: jsonData };
        }

        if (!jsonData.productData) {
            jsonData.productData = []; // Default to empty array
        }

        return finalizeCombinedPostForBlueprint(jsonData, blueprint, input);

    } catch (error: any) {
        console.error("Pollinations Fallback Error:", error);
        if (error.name === 'AbortError') {
            throw new Error('Fallback generation timed out.');
        }
        throw new Error(`All fallback methods failed. Provider Error: ${error.message} `);
    }
};

export const generateArticleFromKeyword = async (keyword: string, apiKey: string): Promise<any> => { throw new Error("Not implemented"); };
export const modifyRecipe = async (data: BlogPostData, modificationPrompt: string, apiKey: string): Promise<BlogPostData> => { throw new Error("Not implemented"); };
export const analyzeContentWithGemini = async (content: string, apiKey: string): Promise<any> => { throw new Error("Not implemented"); };
