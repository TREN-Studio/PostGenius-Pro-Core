/**
 * Client-Side Upload Handler for Hostinger PHP API
 * 
 * This module sends image data to the PHP upload script on Hostinger
 */

// Your Hostinger API endpoint
const UPLOAD_API_ENDPOINT = 'https://www.postgeniuspro.com/api/upload.php';

const HOSTINGER_UPLOAD_PREFIX = 'https://www.postgeniuspro.com/api/uploads/';
const HOSTINGER_UPLOAD_PREFIX_RELATIVE = '/api/uploads/';

const normalizeSourceUrl = (value) => {
    if (!value || typeof value !== 'string') return '';

    const trimmed = value.trim();
    if (!trimmed) return '';

    if (trimmed.startsWith(HOSTINGER_UPLOAD_PREFIX)) {
        return trimmed;
    }

    if (trimmed.startsWith(HOSTINGER_UPLOAD_PREFIX_RELATIVE)) {
        return `https://www.postgeniuspro.com${trimmed}`;
    }

    const unescaped = trimmed
        .replace(/\\u002F/gi, '/')
        .replace(/\\\//g, '/');

    const imageUrlMatch = unescaped.match(
        /https?:\/\/[^\s"'<>\\]+?\.(?:png|jpe?g|webp|gif|avif)(?:\?[^"'<>\\\s]*)?/i
    );
    if (imageUrlMatch?.[0]) {
        return imageUrlMatch[0].replace(/[),\]}]+$/g, '');
    }

    if (/^https?:\/\/[^\s"'<>]+$/i.test(unescaped)) {
        return unescaped;
    }

    const absoluteMatch = unescaped.match(/https?:\/\/[^\s"'<>\\]+/i);
    if (absoluteMatch?.[0]) {
        return absoluteMatch[0].replace(/[),\]}]+$/g, '');
    }

    if (unescaped.startsWith(HOSTINGER_UPLOAD_PREFIX_RELATIVE)) {
        return `https://www.postgeniuspro.com${unescaped}`;
    }

    return unescaped;
};

const buildProxyCandidates = (sourceUrl) => {
    const normalizedUrl = normalizeSourceUrl(sourceUrl);
    if (!normalizedUrl) return [];

    const encoded = encodeURIComponent(normalizedUrl);
    const baseCandidates = [
        `/api/proxy.php?url=${encoded}`,
        `https://www.postgeniuspro.com/api/proxy.php?url=${encoded}`
    ];

    if (typeof window !== 'undefined' && window.location?.origin) {
        baseCandidates.unshift(`${window.location.origin}/api/proxy.php?url=${encoded}`);
    }

    return Array.from(new Set(baseCandidates));
};

const isValidImageBlob = (blob, contentType) => {
    if (!blob || blob.size <= 0) return false;
    const type = (contentType || blob.type || '').toLowerCase();
    if (!type) return true;
    if (type.startsWith('image/')) return true;
    if (type.includes('application/octet-stream')) return true;
    if (type.includes('text/html')) return false;
    return false;
};

const fetchRemoteImageBlob = async (sourceUrl) => {
    const normalizedUrl = normalizeSourceUrl(sourceUrl);
    if (!normalizedUrl || !/^https?:\/\//i.test(normalizedUrl)) {
        throw new Error('Invalid external image URL.');
    }

    const attemptErrors = [];
    const attempts = [
        { label: 'direct', url: normalizedUrl },
        ...buildProxyCandidates(normalizedUrl).map((url, index) => ({ label: `proxy-${index + 1}`, url }))
    ];

    for (const attempt of attempts) {
        try {
            const response = await fetch(attempt.url, {
                method: 'GET',
                headers: { 'Accept': 'image/*,*/*;q=0.8' },
                cache: 'no-store'
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const contentType = (response.headers.get('content-type') || '').toLowerCase();
            const blob = await response.blob();

            if (!isValidImageBlob(blob, contentType)) {
                throw new Error(`Non-image response (${contentType || blob.type || 'unknown'})`);
            }

            return blob;
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            attemptErrors.push(`${attempt.label}: ${message}`);
        }
    }

    throw new Error(`Could not fetch external image. Attempts failed -> ${attemptErrors.join(' | ')}`);
};

function isPlaceholderDataImage(value) {
    if (!value || typeof value !== 'string') return false;
    const normalized = value.trim().toLowerCase();
    if (!normalized.startsWith('data:image/')) return false;
    if (normalized.startsWith('data:image/svg+xml')) return true;
    if (normalized.includes('generation failed')) return true;
    if (normalized.includes('image fallback')) return true;
    if (normalized.includes('step image fallback')) return true;
    return false;
}

/**
 * Uploads an article image via the Hostinger PHP API
 * 
 * @param {File} file - The image file to upload
 * @param {string} articleId - The article ID for organizing files
 * @param {string} [authToken] - Optional authentication token
 * @returns {Promise<string>} The permanent public URL of the uploaded image
 */
export async function uploadArticleImage(file, articleId, authToken = null) {
    // Validation
    if (!file) {
        throw new Error("File is required for upload.");
    }

    if (!articleId) {
        throw new Error("Article ID is required for upload.");
    }

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
        throw new Error(`Invalid file type: ${file.type}. Only JPEG, PNG, GIF, and WebP are allowed.`);
    }

    // Validate file size (10MB max)
    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
        throw new Error(`File too large: ${(file.size / 1024 / 1024).toFixed(2)}MB. Maximum size is 10MB.`);
    }

    console.log(`[Upload] Uploading to Hostinger: ${file.name} (${(file.size / 1024).toFixed(2)}KB)`);

    // Prepare form data
    const formData = new FormData();
    formData.append('image', file);
    formData.append('articleId', articleId);

    // Prepare headers
    const headers = {};
    if (authToken) {
        headers['Authorization'] = authToken;
    }

    try {
        const response = await fetch(UPLOAD_API_ENDPOINT, {
            method: 'POST',
            body: formData,
            headers: headers
        });

        if (!response.ok) {
            let errorMessage = `Upload failed: ${response.status}`;
            try {
                const errorBody = await response.json();
                errorMessage = errorBody.message || errorMessage;
            } catch (e) {
                // Response not JSON
            }
            throw new Error(errorMessage);
        }

        const result = await response.json();

        if (!result.success) {
            throw new Error(result.message || 'Upload failed');
        }

        const publicUrl = result.url;

        if (!publicUrl) {
            throw new Error("Upload succeeded but no URL returned");
        }

        console.log(`[Upload] ✅ Success: ${publicUrl}`);
        return publicUrl;

    } catch (error) {
        console.error("[Upload] ❌ Failed:", error);

        if (error.message.includes('Failed to fetch')) {
            throw new Error('Network error: Could not connect to server');
        }

        throw new Error(`Upload failed: ${error.message}`);
    }
}

/**
 * Upload multiple images sequentially
 */
export async function uploadMultipleImages(files, articleId, authToken = null, onProgress = null) {
    const urls = [];
    const total = files.length;

    for (let i = 0; i < total; i++) {
        const url = await uploadArticleImage(files[i], articleId, authToken);
        urls.push(url);

        if (onProgress) {
            onProgress(i + 1, total, url);
        }
    }

    return urls;
}

/**
 * Upload an image from a data URI or external URL
 * 
 * @param {string} dataUriOrUrl - Data URI (base64) or external URL
 * @param {string} articleId - The article ID for organizing files
 * @param {string} filename - Desired filename for the upload
 * @param {string} [authToken] - Optional authentication token
 * @returns {Promise<string>} The permanent public URL of the uploaded image
 */
export async function uploadDataURIOrUrlImage(dataUriOrUrl, articleId, filename, authToken = null) {
    if (!dataUriOrUrl) {
        throw new Error("Data URI or URL is required for upload.");
    }

    const normalizedInput = typeof dataUriOrUrl === 'string' ? normalizeSourceUrl(dataUriOrUrl) : dataUriOrUrl;

    // If it's already a Hostinger URL, return it as-is
    if (typeof normalizedInput === 'string' && normalizedInput.startsWith(HOSTINGER_UPLOAD_PREFIX)) {
        console.log('[Upload] Image already on Hostinger, skipping upload');
        return normalizedInput;
    }

    let blob;

    try {
        if (typeof normalizedInput === 'string' && normalizedInput.startsWith('data:')) {
            // Convert data URI to blob
            console.log('[Upload] Converting data URI to blob...');
            const response = await fetch(normalizedInput);
            blob = await response.blob();
        } else if (typeof normalizedInput === 'string' && normalizedInput.startsWith('blob:')) {
            console.log('[Upload] Converting blob URL to blob...');
            const response = await fetch(normalizedInput);
            blob = await response.blob();
        } else if (typeof normalizedInput === 'string' && normalizedInput.startsWith('http')) {
            // Fetch external URL as blob (direct first, then proxy fallback)
            console.log(`[Upload] Fetching external URL: ${normalizedInput.substring(0, 80)}...`);
            blob = await fetchRemoteImageBlob(normalizedInput);
        } else {
            throw new Error('Invalid image format. Must be a data URI, blob URL, HTTP URL, or Hostinger URL.');
        }

        // Check if it's an SVG and convert to PNG if necessary
        if (blob.type === 'image/svg+xml') {
            console.log('[Upload] SVG detected, converting to PNG...');
            try {
                blob = await convertSvgToPng(blob);
                // Update filename to end with .png
                filename = filename.replace(/\.[^/.]+$/, "") + ".png";
            } catch (conversionError) {
                console.error('[Upload] Failed to convert SVG to PNG:', conversionError);
                // If conversion fails, we might still try to upload or just let it fail at validation
                // But let's throw a clearer error
                throw new Error(`Failed to convert SVG image: ${conversionError.message}`);
            }
        }

        // Convert blob to File
        const file = new File([blob], filename, { type: blob.type || 'image/webp' });

        // Upload using existing function
        return await uploadArticleImage(file, articleId, authToken);

    } catch (error) {
        console.error('[Upload] Failed to process image:', error);
        throw new Error(`Failed to upload image: ${error.message}`);
    }
}

/**
 * Helper to convert SVG blob to PNG blob
 * @param {Blob} svgBlob 
 * @returns {Promise<Blob>}
 */
async function convertSvgToPng(svgBlob) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        const url = URL.createObjectURL(svgBlob);

        img.onload = () => {
            try {
                const canvas = document.createElement('canvas');
                // Set a default size if SVG doesn't have one, or use natural size
                canvas.width = img.width || 800;
                canvas.height = img.height || 600;

                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

                canvas.toBlob((pngBlob) => {
                    URL.revokeObjectURL(url);
                    if (pngBlob) {
                        resolve(pngBlob);
                    } else {
                        reject(new Error('Canvas toBlob failed'));
                    }
                }, 'image/png');
            } catch (e) {
                URL.revokeObjectURL(url);
                reject(e);
            }
        };

        img.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error('Failed to load SVG image for conversion'));
        };

        img.src = url;
    });
}

export default uploadArticleImage;
