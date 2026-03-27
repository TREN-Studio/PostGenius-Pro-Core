
import { api } from './apiClient';
import { uploadDataURIOrUrlImage } from './uploadHandler'; // Assuming this is available
import type { Article, BlogPostData, ScoreFeedback, ArticleStatus, Blueprint, ImageSource, ArticleContent, UserProfile, StyleConfig } from '../types';
import { isAmazonHostedImage, isPlatformHostedImage } from './styleService';

export const ARTICLE_IMAGES_BUCKET_NAME = 'article_images'; // Kept for compatibility if needed, though unused now
export const AVATARS_BUCKET_NAME = 'avatars';

const createSlug = (name: string): string => {
    const a = 'àáâäæãåāăąçćčđďèéêëēėęěğǵḧîïíīįìłḿñńǹňôöòóœøōõőṕŕřßśšşșťțûüùúūǘůűųẃẍÿýžźż·/_,:;'
    const b = 'aaaaaaaaaacccddeeeeeeeegghiiiiiilmnnnnoooooooooprrsssssttuuuuuuuuuwxyyzzz------'
    const p = new RegExp(a.split('').join('|'), 'g')

    const slug = name.toString().toLowerCase()
        .replace(/\s+/g, '-') // Replace spaces with -
        .replace(p, c => b.charAt(a.indexOf(c))) // Replace special characters
        .replace(/&/g, '-and-') // Replace & with 'and'
        .replace(/[^\w\-]+/g, '') // Remove all non-word chars
        .replace(/\-\-+/g, '-') // Replace multiple - with single -
        .replace(/^-+/, '') // Trim - from start of text
        .replace(/-+$/, ''); // Trim - from end of text

    if (slug.length > 50) {
        return slug.substring(0, 50).replace(/-+$/, '');
    }

    return slug;
}

// Helper to batch upload images
const persistImages = async (
    images: Record<string, string>,
    userId: string,
    articleId: string
): Promise<Record<string, string>> => {
    const newImages = { ...images };
    const uploads = Object.entries(images).map(async ([key, url]) => {
        if (isPlatformHostedImage(url)) {
            newImages[key] = url;
            return;
        }
        if (url && (url.startsWith('data:image') || url.startsWith('http'))) {
            try {
                // Use the Hostinger upload handler
                // We use the key as the filename prefix
                const filename = `${key}_${Date.now()}.png`; // Defaulting to png, handler handles conversion
                const token = typeof localStorage !== 'undefined' ? localStorage.getItem('auth_token') : null;
                const publicUrl = await uploadDataURIOrUrlImage(url, articleId, filename, token);
                newImages[key] = publicUrl;
            } catch (e) {
                console.error(`Failed to upload image for key ${key}:`, e);
            }
        }
    });
    await Promise.all(uploads);
    return newImages;
};

const persistImageVariantGroups = async (
    variants: Record<string, string[]>,
    userId: string,
    articleId: string
): Promise<Record<string, string[]>> => {
    const nextVariants: Record<string, string[]> = {};
    const uploads = Object.entries(variants || {}).map(async ([productId, urls]) => {
        if (!Array.isArray(urls) || !urls.length) {
            nextVariants[productId] = [];
            return;
        }

        const persistedUrls = await Promise.all(
            urls.map(async (url, index) => {
                const normalizedUrl = String(url || '').trim();
                if (!normalizedUrl) return '';
                if (isPlatformHostedImage(normalizedUrl)) return normalizedUrl;
                if (normalizedUrl.startsWith('data:image') || normalizedUrl.startsWith('http')) {
                    try {
                        const filename = `product_${productId}_variant_${index}_${Date.now()}.png`;
                        const token = typeof localStorage !== 'undefined' ? localStorage.getItem('auth_token') : null;
                        return await uploadDataURIOrUrlImage(normalizedUrl, articleId, filename, token);
                    } catch (error) {
                        console.error(`Failed to upload variant image ${index} for product ${productId}:`, error);
                    }
                }
                return '';
            })
        );

        nextVariants[productId] = persistedUrls.filter(Boolean);
    });

    await Promise.all(uploads);
    return nextVariants;
};

// --- Article Database Functions (Custom API) ---

export const saveArticle = async (
    content: ArticleContent,
    userId: string,
    articleId: string | null,
    styleConfig: StyleConfig,
    blueprint: Blueprint,
    initialGeneratedHtml: string,
    status: ArticleStatus = 'Draft',
    slug?: string
): Promise<Article> => {
    const { blogPostData } = content;
    let finalHeroImageUrl = content.heroImageUrl;

    // Use existing ID or temporary 'temp' folder
    const pathId = articleId || `draft_${Date.now()}`;

    // 1. Persist Hero Image
    if (finalHeroImageUrl && (finalHeroImageUrl.startsWith('data:image') || finalHeroImageUrl.startsWith('http'))) {
        try {
            // Check if it's already a Hostinger URL to avoid re-uploading
            if (!finalHeroImageUrl.includes('/api/uploads/')) {
                const filename = `hero_${Date.now()}.png`;
                const token = typeof localStorage !== 'undefined' ? localStorage.getItem('auth_token') : null;
                finalHeroImageUrl = await uploadDataURIOrUrlImage(finalHeroImageUrl, pathId, filename, token);
                content.heroImageUrl = finalHeroImageUrl;
            }
        } catch (uploadError) {
            console.error("Auto-upload of hero image failed:", uploadError);
        }
    }

    // 2. Persist Step Images
    if (content.stepImageUrls) {
        content.stepImageUrls = await persistImages(content.stepImageUrls, userId, pathId);
    }

    // 3. Persist Product Images
    if (content.productImageUrls) {
        content.productImageUrls = await persistImages(content.productImageUrls, userId, pathId);
    }

    // 3b. Persist Product Variant Images
    if (content.productImageVariants) {
        content.productImageVariants = await persistImageVariantGroups(content.productImageVariants, userId, pathId);
    }

    // 4. Regenerate HTML with new permanent URLs
    let finalHtml = initialGeneratedHtml;

    if (content.stepImageUrls) {
        Object.entries(content.stepImageUrls).forEach(([key, url]) => {
            const index = parseInt(key, 10) + 1;
            const imgTag = `<img src="${url}" alt="Step ${index}" class="w-full rounded-lg shadow-md my-4" />`;
            finalHtml = finalHtml.replace(new RegExp(`\\[STEP_IMAGE_${index}\\]`, 'g'), imgTag);
            finalHtml = finalHtml.replace(new RegExp(`<img[^>]*src="[^"]*"[^>]*data-placeholder-id="${index}"[^>]*>`, 'g'), imgTag);
        });
    }

    if (content.productImageUrls) {
        Object.entries(content.productImageUrls).forEach(([id, url]) => {
            if (!url || (!isAmazonHostedImage(url) && !isPlatformHostedImage(url) && !url.startsWith('http') && !url.startsWith('/api/uploads/'))) {
                return;
            }
            const imgTag = `<img src="${url}" alt="Product ${id}" class="w-full rounded-lg shadow-md my-4" />`;
            finalHtml = finalHtml.replace(new RegExp(`\\[PRODUCT_IMAGE_URL_${id}\\]`, 'g'), imgTag);
        });
    }

    // 5. Save to DB via API
    const articleData: any = {
        id: articleId, // Can be null
        user_id: userId,
        title: blogPostData.title,
        blueprint_type: blueprint,
        content: content, // API should handle JSON stringification if needed, or we send object
        generated_html: finalHtml,
        image_url: finalHeroImageUrl && finalHeroImageUrl.startsWith('http') ? finalHeroImageUrl : null,
        image_prompt: blogPostData.heroImage,
        category: blogPostData.category,
        tags: [...(blogPostData.tags.course || []), ...(blogPostData.tags.cuisine || []), ...(blogPostData.tags.keywords || [])],
        seo: blogPostData.seo,
        style_config: styleConfig,
        status: status, // Use provided status
        image_source: 'ai_fallback',
        slug: slug
    };

    if (!articleId) {
        articleData.slug = createSlug(blogPostData.title) + `-${Date.now().toString().slice(-6)}`;
    }

    // SMART SAVE: Check if we are Updating or Inserting
    // If we have an ID and it's NOT a temporary client-side draft ID, we assume the article exists on server.
    // 'draft_' prefix is used by the frontend to prevent race conditions before the first server save.
    const isTempId = articleId && articleId.toString().startsWith('draft_');
    const endpoint = (articleId && !isTempId)
        ? '/articles.php?action=update'
        : '/articles.php';

    console.log(`[saveArticle] Saving to ${endpoint} (ID: ${articleId}, IsTemp: ${isTempId})`);

    let response = await api.post(endpoint, articleData);

    // FIX: Handle cases where apiClient might return string or object
    // Depending on apiClient implementation, 'response' might already be parsed
    if (typeof response === 'string') {
        try {
            response = JSON.parse(response);
        } catch (e) {
            console.error('[saveArticle] Failed to parse JSON response:', response);
            throw new Error('Invalid server response (not JSON)');
        }
    }

    if (response.error) {
        throw new Error(response.error);
    }

    return response as Article; // Assuming API returns the full article object
};

export const updateArticle = async (articleId: string, updates: Partial<Article>): Promise<Article> => {
    // NOTE: The simple PHP API might not support PATCH/PUT yet.
    // You may need to extend articles.php to handle 'action=update' or PUT method.
    // For now, we'll try to POST with the ID and hope the backend handles it, 
    // or throw an error if not implemented.

    // Assuming we can send a partial update
    const response = await api.post('/articles.php?action=update', { id: articleId, ...updates });
    if (response.error) {
        throw new Error(response.error);
    }
    return response as Article;
};

export const updateArticleImages = async (articleId: string, content: ArticleContent): Promise<Article> => {
    return updateArticle(articleId, { content: JSON.stringify(content) as any });
};

export const saveArticleToFileHost = async (articleData: BlogPostData, articleType: string): Promise<any> => {
    return { success: true, message: "Mock file save" };
};

export const getArticleScore = async (articleData: BlogPostData, articleType: string): Promise<{ score: number, feedback: ScoreFeedback[] }> => {
    return new Promise((resolve) => {
        setTimeout(() => resolve({ score: 100, feedback: [] }), 1000);
    });
};

export const submitArticleForReview = async (articleId: string): Promise<Article> => {
    return updateArticle(articleId, { status: 'Awaiting Admin Review' });
};

export const updateArticleStatus = async (articleId: string, status: ArticleStatus): Promise<Article> => {
    return updateArticle(articleId, { status });
}

export const getUserArticles = async (): Promise<Article[]> => {
    const response = await api.get('/articles.php');
    if (response.error) throw new Error(response.error);
    return response as Article[];
};

export const getPublishedArticles = async (): Promise<Article[]> => {
    // NOTE: Requires API update to support filtering
    const response = await api.get('/articles.php?status=Published');
    if (response.error) throw new Error(response.error);
    return response as Article[];
};

export const getPublishedArticlesByBlueprint = async (blueprint: Blueprint): Promise<Article[]> => {
    // NOTE: Requires API update to support filtering
    const response = await api.get(`/articles.php?status=Published&blueprint=${blueprint}`);
    if (response.error) throw new Error(response.error);
    return response as Article[];
};

export const getArticleBySlug = async (slug: string): Promise<Article | null> => {
    // NOTE: Requires API update to support fetching by slug (publicly)
    const response = await api.get(`/articles.php?slug=${slug}`);
    if (!response || response.error) return null;
    return response as Article;
};

export const getAllArticles = async (): Promise<Article[]> => {
    const response = await api.get('/articles.php?all=true'); // Admin only?
    if (response.error) throw new Error(response.error);
    return response as Article[];
};

export const deleteArticle = async (articleId: string): Promise<void> => {
    // NOTE: Requires API update to support DELETE
    await api.post('/articles.php?action=delete', { id: articleId });
};

export const deleteImage = async (bucketName: string, path: string): Promise<void> => {
    // Not implemented in simple API
    console.warn("deleteImage not implemented in Hostinger API yet");
};

export const updateUserProfile = async (userId: string, updates: Partial<UserProfile>): Promise<UserProfile> => {
    const response = await api.post('/auth.php?action=updateProfile', { id: userId, ...updates });
    if (response.error) throw new Error(response.error);
    return response as UserProfile;
};

export const updateUserStyleConfig = async (userId: string, styleConfig: StyleConfig) => {
    await updateUserProfile(userId, { style_config: styleConfig });
};

export const getPublishedArticlesByUserId = async (userId: string): Promise<Article[]> => {
    const response = await api.get(`/articles.php?user_id=${userId}&status=Published`);
    if (response.error) throw new Error(response.error);
    return response as Article[];
};

export const getUserProfileById = async (userId: string): Promise<UserProfile | null> => {
    const response = await api.get(`/auth.php?action=getProfile&id=${userId}`);
    if (response.error) return null;
    return response as UserProfile;
};

// Stub for uploadImage to satisfy imports if any, but we prefer uploadDataURIOrUrlImage
export const uploadImage = async (bucketName: string, file: File | Blob, path: string): Promise<{ path: string }> => {
    // This signature expects a path, but our new handler generates it or takes articleId
    // We'll try to adapt it
    const articleId = path.split('/')[1] || 'temp';
    const filename = 'name' in file ? (file as any).name : 'image.png';
    const url = await uploadDataURIOrUrlImage(URL.createObjectURL(file), articleId, filename);
    return { path: url }; // Return URL as path
};

export const getPublicUrl = async (bucketName: string, path: string): Promise<string> => {
    // If path is already a URL, return it
    if (path.startsWith('http')) return path;
    return path;
};
