/**
 * ========================================
 * WordPress Media Sideloading Module
 * ========================================
 * Handles automatic upload of images to client's WordPress Media Library
 * during publishing, replacing local/Amazon URLs with client-hosted URLs
 * 
 * @author PostGenius Pro
 * @version 1.0.0
 */

export interface WordPressCredentials {
    siteUrl: string;      // e.g., "https://client-site.com"
    username: string;     // WordPress username or Application Password username
    password: string;     // WordPress Application Password
}

export interface WPMediaUploadResult {
    id: number;
    source_url: string;
    alt_text?: string;
}

/**
 * Extracts all image URLs from HTML content
 * Supports both local uploads and Amazon images
 */
export const extractAllImageUrls = (htmlContent: string): string[] => {
    const imgRegex = /<img[^>]+src="([^">]+)"/g;
    const urls: string[] = [];
    let match;

    while ((match = imgRegex.exec(htmlContent)) !== null) {
        urls.push(match[1]);
    }

    return urls;
};

/**
 * Downloads an image from URL and converts to Blob
 * Works for both local uploads and external URLs (Amazon, etc.)
 */
export const downloadImage = async (imageUrl: string): Promise<Blob> => {
    try {
        // Handle data URIs (base64 images)
        if (imageUrl.startsWith('data:')) {
            const base64Data = imageUrl.split(',')[1];
            const mimeMatch = imageUrl.match(/data:([^;]+);/);
            const mimeType = mimeMatch ? mimeMatch[1] : 'image/png';

            const binaryData = atob(base64Data);
            const bytes = new Uint8Array(binaryData.length);
            for (let i = 0; i < binaryData.length; i++) {
                bytes[i] = binaryData.charCodeAt(i);
            }

            return new Blob([bytes], { type: mimeType });
        }

        // Handle regular URLs (local or external)
        const response = await fetch(imageUrl);

        if (!response.ok) {
            throw new Error(`Failed to download image: ${response.status} ${response.statusText}`);
        }

        return await response.blob();
    } catch (error: any) {
        console.error('[WP Sideloader] Failed to download image:', imageUrl, error);
        throw new Error(`Image download failed: ${error.message}`);
    }
};

/**
 * Uploads an image blob to WordPress Media Library via REST API
 * Returns the new WordPress media URL
 */
export const uploadToWordPressMedia = async (
    imageBlob: Blob,
    originalUrl: string,
    wpCredentials: WordPressCredentials,
    altText?: string
): Promise<WPMediaUploadResult> => {
    try {
        // Extract filename from original URL or generate one
        let filename = 'image.jpg';
        try {
            const urlObj = new URL(originalUrl);
            const pathParts = urlObj.pathname.split('/');
            filename = pathParts[pathParts.length - 1] || 'image.jpg';
        } catch {
            // If URL parsing fails, use timestamp-based filename
            filename = `image_${Date.now()}.jpg`;
        }

        // Ensure filename has extension
        if (!filename.match(/\.(jpg|jpeg|png|gif|webp)$/i)) {
            const mimeType = imageBlob.type;
            const ext = mimeType.split('/')[1] || 'jpg';
            filename = `${filename}.${ext}`;
        }

        // Create FormData for multipart upload
        const formData = new FormData();
        formData.append('file', imageBlob, filename);

        if (altText) {
            formData.append('alt_text', altText);
        }

        // WordPress REST API endpoint
        const endpoint = `${wpCredentials.siteUrl.replace(/\/$/, '')}/wp-json/wp/v2/media`;

        // Create Basic Auth header
        const authString = btoa(`${wpCredentials.username}:${wpCredentials.password}`);

        console.log('[WP Sideloader] Uploading to WordPress:', filename);

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Authorization': `Basic ${authString}`,
            },
            body: formData,
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('[WP Sideloader] Upload failed:', response.status, errorText);
            throw new Error(`WordPress upload failed: ${response.status} - ${errorText}`);
        }

        const result = await response.json();

        console.log('[WP Sideloader] ✅ Upload successful:', result.source_url);

        return {
            id: result.id,
            source_url: result.source_url,
            alt_text: result.alt_text,
        };
    } catch (error: any) {
        console.error('[WP Sideloader] Upload error:', error);
        throw new Error(`Failed to upload to WordPress: ${error.message}`);
    }
};

/**
 * Main function: Processes article HTML and replaces all image URLs
 * with WordPress-hosted versions
 * 
 * @param htmlContent - Original HTML content with local/Amazon image URLs
 * @param wpCredentials - WordPress site credentials
 * @param onProgress - Optional callback for progress updates
 * @returns Modified HTML with WordPress-hosted image URLs
 */
export const sideloadImagesToWordPress = async (
    htmlContent: string,
    wpCredentials: WordPressCredentials,
    onProgress?: (current: number, total: number, url: string) => void
): Promise<string> => {
    console.log('[WP Sideloader] 🚀 Starting WordPress Media Sideloading...');

    // Extract all image URLs
    const imageUrls = extractAllImageUrls(htmlContent);

    if (imageUrls.length === 0) {
        console.log('[WP Sideloader] No images found in content');
        return htmlContent;
    }

    console.log(`[WP Sideloader] Found ${imageUrls.length} images to process`);

    let processedHtml = htmlContent;
    const urlMap = new Map<string, string>(); // Cache successful uploads

    for (let i = 0; i < imageUrls.length; i++) {
        const originalUrl = imageUrls[i];

        // Skip if already processed (duplicate images)
        if (urlMap.has(originalUrl)) {
            console.log(`[WP Sideloader] Using cached URL for: ${originalUrl}`);
            processedHtml = processedHtml.replace(new RegExp(escapeRegExp(originalUrl), 'g'), urlMap.get(originalUrl)!);
            continue;
        }

        try {
            // Report progress
            if (onProgress) {
                onProgress(i + 1, imageUrls.length, originalUrl);
            }

            console.log(`[WP Sideloader] [${i + 1}/${imageUrls.length}] Processing: ${originalUrl.substring(0, 80)}...`);

            // Step 1: Download image
            const imageBlob = await downloadImage(originalUrl);
            console.log(`[WP Sideloader] Downloaded (${(imageBlob.size / 1024).toFixed(2)} KB)`);

            // Step 2: Upload to WordPress
            const wpImage = await uploadToWordPressMedia(
                imageBlob,
                originalUrl,
                wpCredentials
            );

            // Step 3: Cache and replace URL
            urlMap.set(originalUrl, wpImage.source_url);
            processedHtml = processedHtml.replace(new RegExp(escapeRegExp(originalUrl), 'g'), wpImage.source_url);

            console.log(`[WP Sideloader] ✅ Replaced: ${originalUrl.substring(0, 40)}... → ${wpImage.source_url.substring(0, 40)}...`);

        } catch (error: any) {
            console.error(`[WP Sideloader] ❌ Failed to process image ${i + 1}:`, error.message);
            // Continue with other images instead of failing completely
            console.warn(`[WP Sideloader] ⚠️ Keeping original URL for: ${originalUrl}`);
        }
    }

    console.log('[WP Sideloader] 🎉 Sideloading complete!');
    console.log(`[WP Sideloader] Successfully processed: ${urlMap.size}/${imageUrls.length} images`);

    return processedHtml;
};

/**
 * Escapes special regex characters in a string
 */
const escapeRegExp = (string: string): string => {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

/**
 * Validates WordPress credentials by testing authentication
 */
export const validateWordPressCredentials = async (
    credentials: WordPressCredentials
): Promise<{ valid: boolean; error?: string }> => {
    try {
        const endpoint = `${credentials.siteUrl.replace(/\/$/, '')}/wp-json/wp/v2/media`;
        const authString = btoa(`${credentials.username}:${credentials.password}`);

        const response = await fetch(endpoint, {
            method: 'GET',
            headers: {
                'Authorization': `Basic ${authString}`,
            },
        });

        if (response.status === 401) {
            return { valid: false, error: 'Invalid username or password' };
        }

        if (response.status === 403) {
            return { valid: false, error: 'User does not have permission to upload media' };
        }

        if (!response.ok) {
            return { valid: false, error: `Server returned ${response.status}` };
        }

        return { valid: true };
    } catch (error: any) {
        return { valid: false, error: error.message };
    }
};
