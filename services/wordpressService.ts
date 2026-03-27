
import type { WordPressConfig, BlogPostData, ArticleStatus, ImagePayload, UploadedProductImages } from '../types';
import { updateArticleStatus } from './articleService';

// This service is now fully client-side and makes direct requests to the user's WordPress site.
// It discovers the correct permalink structure and relies on the user to configure CORS on their site if needed.
// The UI will guide the user on how to do this if a CORS error is detected.

type TaskResult =
    | { type: 'hero'; result: { id: number; source_url: string } }
    | { type: 'step'; result: string; placeholder: RegExp; stepNumber: number }
    | { type: 'section'; result: string; placeholder: RegExp; sectionId: number }
    | { type: 'product'; result: string; placeholder: RegExp }
    | { type: 'product_variant'; result: { id: number; source_url: string }; productId: number; variantIndex: number }
    | { type: 'category'; result: number }
    | { type: 'tag'; result: number };

const UPLOAD_TIMEOUT_MS = 120000;
const GENERAL_API_TIMEOUT_MS = 60000;

const FOOD_JOT_CATEGORIES_MAP: Record<string, string> = {
    "Desserts & Sweets": "desserts-sweets",
    "Plant-Based & Veggie Dishes": "plant-based-veggie-dishes",
    "Fondues & Specialty Dishes": "fondues-specialty-dishes",
    "Fritters & Specialty Snacks": "fritters-specialty-snacks",
    "Meat, Poultry & Seafood": "meat-poultry-seafood",
    "Soups & Stews": "soups-stews",
};

/**
 * A robust JSON response parser that provides helpful error messages for common WordPress issues.
 */
const parseWpJsonResponse = async <T>(response: Response, allowErrorCodes: string[] = []): Promise<T> => {
    const responseText = await response.text();
    let responseData;

    try {
        responseData = JSON.parse(responseText);
    } catch (e) {
        if (responseText.trim().toLowerCase().startsWith('<!doctype html')) {
            // It's an HTML page, let's provide a more detailed error.
            let detailedError = `The server returned an HTML page instead of a valid JSON response. This often indicates an authentication failure, a security plugin blocking the request, or a server misconfiguration.`;

            if (responseText.includes('id="loginform"') || responseText.includes('wp-login.php')) {
                detailedError = `Authentication failed. The WordPress server returned a login page. Please ensure you are using a generated 'Application Password', not your main WordPress account password.`;
            } else {
                // Try to get more clues from the HTML
                const titleMatch = responseText.match(/<title>(.*?)<\/title>/i);
                const title = titleMatch ? titleMatch[1].trim().toLowerCase() : '';

                const clues: string[] = [];
                if (title.length > 0) clues.push(`HTML Page Title: "${titleMatch[1].trim()}"`);

                // Security plugins
                if (responseText.toLowerCase().includes('wordfence')) clues.push("Security plugin detected: 'Wordfence'. Please check its firewall rules.");
                if (responseText.toLowerCase().includes('mod_security') || responseText.toLowerCase().includes('modsecurity')) clues.push("Server firewall detected: 'ModSecurity'. You may need to contact your host to whitelist API requests.");

                // Common error indicators
                if (response.status === 403 || title.includes('403 forbidden') || title.includes('access denied')) clues.push("A '403 Forbidden' error was received, suggesting a permissions or security block.");
                if (response.status === 404 || title.includes('404 not found') || title.includes('page not found')) clues.push("A '404 Not Found' error was received. Please double-check your WordPress Site URL in the API Configuration.");
                if (response.status >= 500 || title.includes('500 internal server error') || title.includes('server error')) clues.push(`A '${response.status}' server error occurred. Please check your WordPress server's error logs for more details.`);

                // CDN block pages
                if (responseText.includes('Cloudflare') && (title.includes('attention required') || title.includes('checking your browser'))) clues.push("A Cloudflare security challenge is blocking the request. Please check your Cloudflare firewall settings.");

                if (clues.length > 0) {
                    detailedError += "\n\nDiagnostic Details:\n- " + clues.join('\n- ');
                }
            }

            throw new Error(detailedError);
        }
        const originalError = e instanceof Error ? e.message : String(e);
        throw new Error(`Failed to parse server response as JSON. Details: ${originalError}`);
    }

    if (!response.ok) {
        if (responseData.code && allowErrorCodes.includes(responseData.code)) {
            return responseData as T;
        }
        const errorMessage = responseData.message || `The server responded with an error (status ${response.status}).`;
        console.error("WordPress API Error Response:", responseData);
        throw new Error(errorMessage);
    }

    return responseData as T;
};

const getWpApiHeaders = (config: WordPressConfig) => {
    const { username, password } = config;
    if (!config.url || !username || !password) {
        throw new Error("WordPress Site URL, username, and application password are required for publishing.");
    }
    return {
        'Authorization': `Basic ${btoa(`${username}:${password}`)}`,
    };
};

const toPreferredFetchUrl = (url: string): string => {
    let fetchUrl = url;
    try {
        const urlObj = new URL(url);
        if (urlObj.hostname.includes('postgeniuspro.com') || urlObj.hostname === window.location.hostname) {
            fetchUrl = urlObj.pathname + urlObj.search;
        }
    } catch {
        // Keep as-is if URL parsing fails
    }
    return fetchUrl;
};

// Helper to convert URL to Base64 while preserving detected mime type.
const getBase64FromUrl = async (url: string): Promise<{ base64: string; mimeType: string }> => {
    const response = await fetch(toPreferredFetchUrl(url));
    if (!response.ok) throw new Error(`Failed to fetch image: ${response.statusText}`);
    const blob = await response.blob();
    const mimeType = blob.type || 'application/octet-stream';

    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            const result = reader.result as string;
            resolve({
                base64: result.split(',')[1] || result,
                mimeType,
            });
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
};

const urlToBlob = async (url: string): Promise<Blob> => {
    try {
        // First path: direct fetch preserves original binary and mime type (best for full-size quality).
        const directResponse = await fetch(toPreferredFetchUrl(url));
        if (!directResponse.ok) {
            throw new Error(`Direct fetch failed: ${directResponse.status}`);
        }
        return await directResponse.blob();
    } catch (directError: any) {
        console.warn(`[WP Service] Direct image fetch failed, attempting Base64 strategy. URL: ${url}`, directError);

        try {
            const { base64, mimeType } = await getBase64FromUrl(url);
            const byteCharacters = atob(base64);
            const byteNumbers = new Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) {
                byteNumbers[i] = byteCharacters.charCodeAt(i);
            }
            const byteArray = new Uint8Array(byteNumbers);
            return new Blob([byteArray], { type: mimeType || 'application/octet-stream' });
        } catch (base64Error: any) {
            console.warn(`[WP Service] Base64 strategy failed, attempting proxy fallback. URL: ${url}`, base64Error);

            try {
                const proxyUrl = `/api/proxy.php?url=${encodeURIComponent(url)}`;
                const response = await fetch(proxyUrl);
                if (!response.ok) throw new Error(`Proxy status: ${response.status}`);
                return await response.blob();
            } catch (proxyError: any) {
                throw new Error(`Failed to fetch image data via direct/Base64/proxy. Details: ${directError.message} | ${base64Error.message} | ${proxyError.message}`);
            }
        }
    }
}

const dataUriToBlob = async (dataUri: string): Promise<Blob> => {
    const response = await fetch(dataUri);
    if (!response.ok) {
        throw new Error('Failed to convert data URI to Blob.');
    }
    return response.blob();
}

const memoizedEndpoints: Record<string, string> = {};

const stripLargeReviewBlocksForWordPress = (html: string): string => {
    if (!html) return html;

    const source = String(html);

    if (typeof DOMParser !== 'undefined') {
        try {
            const parser = new DOMParser();
            const doc = parser.parseFromString(`<div id="pgp-wp-root">${source}</div>`, 'text/html');
            const root = doc.getElementById('pgp-wp-root');

            if (root) {
                const reviewSectionHeadingPattern = /^(product reviews|top\s+\d+\s+product reviews)$/i;

                root.querySelectorAll('.amazon-reviews-section').forEach((section) => {
                    let previousElement = section.previousElementSibling;
                    while (previousElement && /^(#text|#comment)$/i.test(previousElement.nodeName)) {
                        previousElement = previousElement.previousElementSibling;
                    }
                    if (previousElement && /^H[23]$/i.test(previousElement.tagName) && reviewSectionHeadingPattern.test(previousElement.textContent?.trim() || '')) {
                        previousElement.remove();
                    }
                    section.remove();
                });

                root.querySelectorAll('.amazon-review-card, .amazon-editorial-pick').forEach((node) => node.remove());

                const verdictBoxes = Array.from(root.querySelectorAll('.product-verdict-box'));
                if (verdictBoxes.length > 1) {
                    verdictBoxes.slice(0, -1).forEach((node) => node.remove());
                }

                root.querySelectorAll('h2, h3').forEach((heading) => {
                    const label = (heading.textContent || '').trim();
                    if (!reviewSectionHeadingPattern.test(label)) return;

                    const nextElement = heading.nextElementSibling;
                    const hasReviewSectionAfter =
                        !!nextElement &&
                        (nextElement.classList.contains('amazon-reviews-section')
                            || nextElement.querySelector?.('.amazon-review-card'));

                    if (!hasReviewSectionAfter) {
                        heading.remove();
                    }
                });

                return root.innerHTML
                    .replace(/\n{3,}/g, '\n\n')
                    .trim();
            }
        } catch (error) {
            console.warn('[WP Service] DOM cleanup for large review blocks failed, falling back to regex cleanup.', error);
        }
    }

    return source
        .replace(
            /<h[23][^>]*>[\s\S]*?<\/h[23]>\s*<!-- wp:html -->\s*<section class="amazon-reviews-section"[\s\S]*?<!-- \/wp:html -->/gi,
            ''
        )
        .replace(/<!-- wp:html -->\s*<section class="amazon-reviews-section"[\s\S]*?<!-- \/wp:html -->/gi, '')
        .replace(/<section class="amazon-reviews-section"[\s\S]*?<\/section>/gi, '')
        .replace(/<article class="amazon-review-card"[\s\S]*?<\/article>/gi, '')
        .replace(/<div class="amazon-editorial-pick"[\s\S]*?<\/div>/gi, '')
        .replace(/<h[23][^>]*>\s*product reviews\s*<\/h[23]>/gi, '')
        .replace(/<h[23][^>]*>\s*top\s+\d+\s+product reviews\s*<\/h[23]>/gi, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
};

const diagnoseHtmlError = (html: string, status: number): string => {
    const titleMatch = html.match(/<title>(.*?)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : '';

    // Check if the response is the app's own page by looking for unique identifiers.
    if (html.includes('src="/index.tsx"') || title === 'Postgenius Pro | AI Content Engine for Modern Creators') {
        return `The WordPress Site URL is pointing back to this application.`;
    }

    let detailedError = `The server returned an HTML page instead of a valid JSON response (Status: ${status}). This often indicates an authentication failure, a security plugin blocking the request, or a server misconfiguration.`;

    if (html.includes('id="loginform"') || html.includes('wp-login.php')) {
        detailedError = `Authentication failed. The WordPress server returned a login page. Please ensure you are using a generated 'Application Password', not your main WordPress account password.`;
    } else {
        const clues: string[] = [];
        if (title.length > 0) clues.push(`HTML Page Title: "${titleMatch[1].trim()}"`);
        if (html.toLowerCase().includes('wordfence')) clues.push("Security plugin detected: 'Wordfence'. Please check its firewall rules.");
        if (html.toLowerCase().includes('mod_security') || html.toLowerCase().includes('modsecurity')) clues.push("Server firewall detected: 'ModSecurity'. You may need to contact your host to whitelist API requests.");
        if (status === 403 || title.includes('403 forbidden') || title.includes('access denied')) clues.push("A '403 Forbidden' error was received, suggesting a permissions or security block.");
        if (status === 404 || title.includes('404 not found') || title.includes('page not found')) clues.push("A '404 Not Found' error was received. Please double-check your WordPress Site URL in the API Configuration.");
        if (status >= 500 || title.includes('500 internal server error') || title.includes('server error')) clues.push(`A '${status}' server error occurred. Please check your WordPress server's error logs for more details.`);
        if (html.includes('Cloudflare') && (title.includes('attention required') || title.includes('checking your browser'))) clues.push("A Cloudflare security challenge is blocking the request. Please check your Cloudflare firewall settings.");

        if (clues.length > 0) {
            detailedError += "\n\nDiagnostic Details:\n- " + clues.join('\n- ');
        }
    }
    return detailedError;
}

const determineApiEndpoint = async (config: WordPressConfig): Promise<string> => {
    const { url, username } = config;
    const cacheKey = `${url}-${username}`;
    if (memoizedEndpoints[cacheKey]) {
        return memoizedEndpoints[cacheKey];
    }

    const headers = getWpApiHeaders(config);
    const prettyBase = `${url.replace(/\/$/, '')}/wp-json/wp/v2/`;
    const plainBase = `${url.replace(/\/$/, '')}/?rest_route=/wp/v2/`;
    const endpointToTest = 'types/post';

    const errorLogs: string[] = [];

    // Attempt 1: Pretty Permalinks
    try {
        const res = await fetch(`${prettyBase}${endpointToTest}`, { headers });
        const text = await res.text();
        if (res.ok) {
            try {
                JSON.parse(text); // Check if it's valid JSON
                console.log('[WP Service] Detected pretty permalink support.');
                memoizedEndpoints[cacheKey] = prettyBase;
                return prettyBase;
            } catch (e) {
                // It's not JSON, it's probably HTML
                errorLogs.push(`Attempt with Pretty Permalinks (${prettyBase}) failed:\n${diagnoseHtmlError(text, res.status)}`);
            }
        } else {
            // Even if not res.ok, it might be HTML with useful info
            if (text.trim().toLowerCase().startsWith('<!doctype html')) {
                errorLogs.push(`Attempt with Pretty Permalinks (${prettyBase}) failed:\n${diagnoseHtmlError(text, res.status)}`);
            } else {
                errorLogs.push(`Attempt with Pretty Permalinks (${prettyBase}) failed with HTTP status ${res.status}.`);
            }
        }
    } catch (e: any) {
        errorLogs.push(`Network error when trying Pretty Permalinks (${prettyBase}): ${e.message}`);
    }

    // Attempt 2: Plain Permalinks
    try {
        const res = await fetch(`${plainBase}${endpointToTest}`, { headers });
        const text = await res.text();
        if (res.ok) {
            try {
                JSON.parse(text); // Check if it's valid JSON
                console.log('[WP Service] Detected plain permalink support.');
                memoizedEndpoints[cacheKey] = plainBase;
                return plainBase;
            } catch (e) {
                errorLogs.push(`Attempt with Plain Permalinks (${plainBase}) failed:\n${diagnoseHtmlError(text, res.status)}`);
            }
        } else {
            // Even if not res.ok, it might be HTML with useful info
            if (text.trim().toLowerCase().startsWith('<!doctype html')) {
                errorLogs.push(`Attempt with Plain Permalinks (${plainBase}) failed:\n${diagnoseHtmlError(text, res.status)}`);
            } else {
                errorLogs.push(`Attempt with Plain Permalinks (${plainBase}) failed with HTTP status ${res.status}.`);
            }
        }
    } catch (e: any) {
        errorLogs.push(`Network error when trying Plain Permalinks (${plainBase}): ${e.message}`);
    }

    // Check if any error indicates the URL is pointing to the app itself.
    const isSelfReferentialError = errorLogs.length > 0 && errorLogs.some(log => log.includes("pointing back to this application"));
    if (isSelfReferentialError) {
        throw new Error("Connection failed: The 'WordPress Site URL' you've entered appears to be this application's own address. Please enter the URL for your separate WordPress installation.");
    }

    // If both failed, throw a comprehensive error
    const finalErrorMessage = `Could not connect to the WordPress REST API. Both connection methods failed. Please check your Site URL, Application Password, and any security plugins.\n\n--- Diagnostic Report ---\n\n${errorLogs.join('\n\n')}`;
    throw new Error(finalErrorMessage);
};

export const validateWpConnection = async (config: WordPressConfig): Promise<void> => {
    // This will throw an error if the connection fails, which will be caught in the UI.
    await determineApiEndpoint(config);
};

const uploadImage = async (config: WordPressConfig, apiBase: string, imageData: string | Blob, filename: string, metadata?: BlogPostData['heroImageMetadata']): Promise<{ id: number; source_url: string; }> => {
    let imageBlob: Blob;

    if (typeof imageData === 'string') {
        if (imageData.startsWith('data:')) {
            imageBlob = await dataUriToBlob(imageData);
        } else if (imageData.startsWith('http')) {
            imageBlob = await urlToBlob(imageData);
        } else if (imageData.startsWith('blob:')) {
            imageBlob = await fetch(imageData).then(res => res.blob());
        } else {
            throw new Error('Unsupported image data format. Must be a data URI, blob URI, or public URL.');
        }
    } else {
        imageBlob = imageData;
    }

    const headers = getWpApiHeaders(config);

    const formData = new FormData();
    formData.append('file', imageBlob, filename);
    if (metadata) {
        formData.append('title', metadata.title);
        formData.append('alt_text', metadata.alt);
        formData.append('caption', metadata.caption);
        formData.append('description', metadata.description);
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);

    try {
        const uploadResponse = await fetch(`${apiBase}media`, {
            method: 'POST',
            headers,
            body: formData,
            signal: controller.signal,
        });

        const mediaDetails = await parseWpJsonResponse<{ id: number; source_url: string }>(uploadResponse);

        if (!mediaDetails.id || !mediaDetails.source_url) {
            throw new Error(`WordPress media upload for "${filename}" did not return the expected 'id' and 'source_url' fields.`);
        }

        return { id: mediaDetails.id, source_url: mediaDetails.source_url };

    } catch (error: any) {
        if (error.name === 'AbortError') {
            throw new Error(`Upload for "${filename}" timed out after ${UPLOAD_TIMEOUT_MS / 1000}s. Your server might be slow or have strict upload limits.`);
        }

        // Detect likely CORS error
        if (error instanceof TypeError && (error.message === 'Failed to fetch' || error.message.includes('NetworkError'))) {
            throw new Error(`Network request blocked. This is likely a CORS issue on your WordPress site. 
             
             To fix this:
             1. Install the "Basic Auth with Application Passwords" plugin (if not already).
             2. Install a CORS plugin (like "WP REST API CORS") OR add this to your functions.php:
                
                add_action( 'init', function() {
                    header( "Access-Control-Allow-Origin: *" );
                    header( "Access-Control-Allow-Methods: POST, GET, OPTIONS, PUT, DELETE" );
                    header( "Access-Control-Allow-Credentials: true" );
                    header( "Access-Control-Allow-Headers: Authorization, Content-Type" );
                });
             `);
        }

        throw error;
    } finally {
        clearTimeout(timeoutId);
    }
};


const decodeHtmlEntities = (text: string): string => {
    return text
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#039;/g, "'")
        .replace(/&#39;/g, "'")
        .replace(/&#038;/g, "&"); // Handle WordPress ampersand code
};

const createSlug = (name: string): string => {
    // Check map first
    if (FOOD_JOT_CATEGORIES_MAP[name]) {
        return FOOD_JOT_CATEGORIES_MAP[name];
    }

    return name
        .toLowerCase()
        .replace(/&/g, '-') // Replace ampersand with dash for standard WP-like slugs, instead of 'and'
        .replace(/[^\w\s-]/g, '')
        .replace(/[\s_]+/g, '-')
        .replace(/--+/g, '-')
        .trim();
};

const robustWpFetch = async <T>(apiBase: string, endpoint: string, options: RequestInit = {}): Promise<T> => {
    const url = `${apiBase}${endpoint}`;
    const response = await fetch(url, options);
    // Allow 400 bad request for 'term_exists' handling
    return parseWpJsonResponse<T>(response, ['term_exists']);
};

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const normalizeHostname = (hostname: string): string => hostname.toLowerCase().replace(/^www\./, '');

const getConfigWpHostname = (config: WordPressConfig): string | null => {
    try {
        return normalizeHostname(new URL(config.url).hostname);
    } catch {
        return null;
    }
};

const extractImageSrcValues = (html: string): Array<{ raw: string; normalized: string }> => {
    const srcValues: Array<{ raw: string; normalized: string }> = [];
    const imgSrcRegex = /<img\b[^>]*\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;
    let match: RegExpExecArray | null = null;

    while ((match = imgSrcRegex.exec(html)) !== null) {
        const raw = (match[1] ?? match[2] ?? '').trim();
        if (!raw) continue;
        srcValues.push({ raw, normalized: decodeHtmlEntities(raw) });
    }

    return srcValues;
};

const extractFirstHttpUrl = (value: string): string | null => {
    const normalized = decodeHtmlEntities(String(value || '')).trim();
    if (!normalized) return null;
    const match = normalized.match(/https?:\/\/[^\s"'<>\\]+/i);
    if (!match) return null;
    return match[0].replace(/[,\]}]+$/g, '');
};

const resolveImageUrlForUpload = (url: string): string => {
    let normalized = String(url || '').trim();
    if (!normalized) return normalized;

    // Some upstream image fields may contain serialized URL maps or concatenated values.
    // For upload/sideload we only need one valid URL, so extract the first clean HTTP URL.
    const looksSerialized =
        normalized.includes('":') ||
        normalized.includes('},') ||
        /\bhttps?:\/\/.*\bhttps?:\/\//i.test(normalized);
    if (looksSerialized) {
        const extracted = extractFirstHttpUrl(normalized);
        if (extracted) normalized = extracted;
    }

    if (normalized.startsWith('data:') || normalized.startsWith('blob:')) return normalized;
    if (normalized.startsWith('//')) return `https:${normalized}`;
    if (normalized.startsWith('/')) return `${window.location.origin}${normalized}`;
    if (normalized.startsWith('./')) return `${window.location.origin}/${normalized.slice(2)}`;
    if (/^https?:\/\//i.test(normalized)) return normalized;
    return `${window.location.origin}/${normalized.replace(/^\/+/, '')}`;
};

const buildSideloadFilename = (imageUrl: string, index: number): string => {
    try {
        const parsed = new URL(imageUrl, window.location.origin);
        const lastSegment = parsed.pathname.split('/').pop() || '';
        if (/\.[a-z0-9]{2,5}$/i.test(lastSegment)) return lastSegment;
    } catch {
        // no-op
    }
    return `sideloaded-image-${index + 1}.jpg`;
};

const shouldSideloadContentImage = (imageUrl: string, wpHostname: string | null): boolean => {
    const normalizedUrl = imageUrl.trim();
    if (!normalizedUrl) return false;
    if (normalizedUrl.startsWith('data:') || normalizedUrl.startsWith('blob:')) return true;
    if (isHostingerImage(normalizedUrl)) return true;

    try {
        const parsed = new URL(resolveImageUrlForUpload(normalizedUrl), window.location.origin);
        // Already hosted on the destination WordPress domain => no need to sideload.
        if (wpHostname && normalizeHostname(parsed.hostname) === wpHostname) return false;

        // Any external HTTP(S) image should be sideloaded so WordPress stores it locally.
        return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
        return false;
    }
};

const sideloadInlineImagesInHtml = async (
    config: WordPressConfig,
    apiBase: string,
    html: string,
    onProgress: (progress: { message: string; current?: number; total?: number; log?: string }) => void,
): Promise<{ content: string; uploaded: number; failed: number }> => {
    const wpHostname = getConfigWpHostname(config);
    const extractedImages = extractImageSrcValues(html).filter(({ normalized }) => shouldSideloadContentImage(normalized, wpHostname));
    if (extractedImages.length === 0) {
        return { content: html, uploaded: 0, failed: 0 };
    }

    const uniqueImageMap = new Map<string, Set<string>>();
    for (const src of extractedImages) {
        const key = src.normalized;
        if (!uniqueImageMap.has(key)) {
            uniqueImageMap.set(key, new Set<string>());
        }
        uniqueImageMap.get(key)!.add(src.raw);
    }

    const uniqueUrls = Array.from(uniqueImageMap.keys());
    let nextContent = html;
    let uploaded = 0;
    let failed = 0;

    onProgress({
        message: 'Sideloading inline images to WordPress media library...',
        log: `Found ${uniqueUrls.length} inline image URL(s) that need sideloading.`,
    });

    for (let i = 0; i < uniqueUrls.length; i++) {
        const sourceUrl = uniqueUrls[i];
        try {
            onProgress({
                message: `Sideloading inline image ${i + 1}/${uniqueUrls.length}...`,
                log: `[Inline ${i + 1}/${uniqueUrls.length}] Uploading: ${sourceUrl}`,
            });

            const resolvedSourceUrl = resolveImageUrlForUpload(sourceUrl);
            const filename = buildSideloadFilename(resolvedSourceUrl, i);
            const uploadResult = await uploadImage(config, apiBase, resolvedSourceUrl, filename);

            const rawVariants = uniqueImageMap.get(sourceUrl) || new Set<string>();
            for (const rawUrl of rawVariants) {
                nextContent = nextContent.replace(new RegExp(escapeRegExp(rawUrl), 'g'), uploadResult.source_url);
            }

            uploaded++;
            onProgress({
                message: `Inline image sideloaded ${i + 1}/${uniqueUrls.length}`,
                log: `[Inline ${i + 1}/${uniqueUrls.length}] Uploaded -> ${uploadResult.source_url}`,
            });
        } catch (error: any) {
            failed++;
            onProgress({
                message: `Inline image sideload failed ${i + 1}/${uniqueUrls.length}`,
                log: `[Inline ${i + 1}/${uniqueUrls.length}] FAILED: ${sourceUrl} - ${error.message}`,
            });
        }
    }

    return { content: nextContent, uploaded, failed };
};

/**
 * Fetches all existing categories from WordPress site
 * Returns an array of category objects with id, name, and slug
 */
export const fetchExistingCategories = async (config: WordPressConfig): Promise<{ id: number; name: string; slug: string }[]> => {
    const apiBase = await determineApiEndpoint(config);
    const headers = getWpApiHeaders(config);

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), GENERAL_API_TIMEOUT_MS);

        try {
            // Fetch all categories (100 per page, which should be enough for most sites)
            const categoriesUrl = `${apiBase}categories?per_page=100&orderby=name&order=asc`;
            const response = await fetch(categoriesUrl, { headers, signal: controller.signal });
            const categories = await parseWpJsonResponse<Array<{ id: number; name: string; slug: string }>>(response);

            console.log(`[WP Service] Fetched ${categories.length} existing categories from WordPress.`);
            return categories.map(cat => ({
                id: cat.id,
                name: decodeHtmlEntities(cat.name),
                slug: cat.slug
            }));
        } finally {
            clearTimeout(timeoutId);
        }
    } catch (error: any) {
        console.error('Error fetching WordPress categories:', error);
        // Return empty array on error - system will fall back to existing behavior
        return [];
    }
};

const getTermId = async (config: WordPressConfig, apiBase: string, termType: 'categories' | 'tags', name: string): Promise<number> => {
    const headers = getWpApiHeaders(config);
    const slug = createSlug(name);

    const normalizedTargetName = name.toLowerCase().trim();

    // Optimized Category Check: Fetch list directly to avoid Search API issues
    if (termType === 'categories') {
        try {
            let page = 1;
            let foundRunning = false;
            let idFound: number | null = null;

            // Fetch pages until found or custom limit (e.g. 5 pages = 500 categories)
            while (!foundRunning && page <= 5) {
                const results = await robustWpFetch<any[]>(apiBase, `categories?per_page=100&page=${page}&hide_empty=false`, { headers });
                if (!results || results.length === 0) break;

                const existingByName = results.find(cat =>
                    decodeHtmlEntities(cat.name).toLowerCase().trim() === normalizedTargetName
                );

                if (existingByName) {
                    console.log(`[WP Service] Found existing category '${name}' in list (Page ${page}, ID: ${existingByName.id})`);
                    idFound = existingByName.id;
                    foundRunning = true;
                    break;
                }

                const existingBySlug = results.find(cat => cat.slug === slug);
                if (existingBySlug) {
                    console.log(`[WP Service] Found existing category '${name}' via slug in list (Page ${page}, ID: ${existingBySlug.id})`);
                    idFound = existingBySlug.id;
                    foundRunning = true;
                    break;
                }

                page++;
            }

            if (idFound) return idFound;

        } catch (e) {
            console.warn('[WP Service] Category list scan failed or completed with no match.', e);
        }
    }

    try {
        // Step 1: Search by exact name match first (case-insensitive)
        const nameSearchResults = await robustWpFetch<any[]>(apiBase, `${termType}?search=${encodeURIComponent(name)}&per_page=100`, { headers });
        const exactMatch = nameSearchResults.find(term =>
            decodeHtmlEntities(term.name).toLowerCase().trim() === normalizedTargetName
        );

        if (exactMatch) {
            console.log(`[WP Service] Found existing ${termType} '${name}' by name (ID: ${exactMatch.id})`);
            return exactMatch.id;
        }

        // Step 2: Fallback to slug search
        const slugSearchResults = await robustWpFetch<any[]>(apiBase, `${termType}?slug=${slug}`, { headers });
        if (slugSearchResults.length > 0) {
            console.log(`[WP Service] Found existing ${termType} '${name}' by slug (ID: ${slugSearchResults[0].id})`);
            return slugSearchResults[0].id;
        }

        // Step 3: Create new term
        console.log(`[WP Service] Creating new ${termType} '${name}'`);
        const createHeaders = { ...headers, 'Content-Type': 'application/json' };

        // We use parseWpJsonResponse which handles the 'term_exists' check if we pass the right options,
        // but robustWpFetch wraps it. We modified robustWpFetch to allow 'term_exists' code.
        const newTerm = await robustWpFetch<any>(apiBase, termType, {
            method: 'POST',
            headers: createHeaders,
            body: JSON.stringify({ name, slug }),
        });

        // Handle possible "term_exists" error response that is returned as a valid object due to allowErrorCodes
        if (newTerm.code === 'term_exists' && newTerm.data && newTerm.data.term_id) {
            console.log(`[WP Service] Term '${name}' already exists (caught by API). ID: ${newTerm.data.term_id}`);
            return newTerm.data.term_id;
        }

        if (!newTerm.id) {
            throw new Error(`Term creation for '${name}' did not return a valid ID.`);
        }

        console.log(`[WP Service] Created new ${termType} '${name}' (ID: ${newTerm.id})`);
        return newTerm.id;

    } catch (error: any) {
        // Double check for 400 Term Exists in the error object if it wasn't caught above
        // Sometimes the error comes as a thrown object from robustWpFetch if not handled
        console.error(`Error handling term '${name}':`, error);

        // Final fallback: If error message contains "Term already exists" try searching one last time or assume failure
        // But the logic above should catch most cases.

        const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred.';
        throw new Error(`Error with ${termType} '${name}': ${errorMessage}`);
    }
};


const isHostingerImage = (url: string): boolean => {
    if (!url) return false;
    const normalizedUrl = url.trim().toLowerCase();
    if (
        normalizedUrl.startsWith('/api/uploads/') ||
        normalizedUrl.startsWith('api/uploads/') ||
        normalizedUrl.startsWith('./api/uploads/')
    ) {
        return true;
    }

    try {
        const urlObj = new URL(url);
        return (urlObj.hostname === 'postgeniuspro.com' || urlObj.hostname === 'www.postgeniuspro.com') && urlObj.pathname.includes('/api/uploads/');
    } catch (e) {
        return false;
    }
};

export const publishPost = async (
    config: WordPressConfig,
    blogPostData: BlogPostData,
    content: string,
    images: ImagePayload,
    onProgress: (progress: { message: string; current?: number; total?: number; log?: string }) => void,
    statusToSet: ArticleStatus,
    userId?: string,
    articleId?: string | null,
): Promise<{ link: string; id: number }> => {
    try {
        let finalContent = content;
        let featuredMediaId: number | null = null;
        let featuredMediaUrl: string | null = null;

        onProgress({ message: 'Connecting to WordPress...', log: '[1/1] Determining API endpoint...' });
        const apiBase = await determineApiEndpoint(config);
        onProgress({ message: 'Connected!', log: '✔️ API endpoint determined.' });

        const imageUploadTasks: { id: string; fn: () => Promise<TaskResult> }[] = [];
        let scheduledSectionImagesCount = 0;

        // Check if hero image exists
        if (images.hero) {
            const imageData = images.hero;

            // ALWAYS upload featured image to WrodPress to ensure we get an ID for 'featured_media'
            // This is required because the WP REST API 'featured_media' field expects an attachment ID, not a URL.
            const filename = imageData instanceof File ? imageData.name : 'featured-image.jpg';
            imageUploadTasks.push({
                id: 'featured image',
                fn: async () => {
                    const uploadResult = await uploadImage(config, apiBase, imageData, filename, blogPostData.heroImageMetadata);
                    return { type: 'hero', result: uploadResult };
                }
            });
        }
        if (blogPostData.steps) {
            images.steps.forEach((imageUrl, i) => {
                const stepNumber = i + 1;
                // Canonical placeholder is 1-based ([STEP_IMAGE_1], [STEP_IMAGE_2], ...).
                // Keep legacy zero-based support defensively.
                const placeholder = new RegExp(`\\[\\s*STEP_IMAGE_\\s*(?:${stepNumber}|${i})\\s*\\]`, 'gi');

                // Upload to WordPress to ensure local storage (Sideloading)
                imageUploadTasks.push({
                    id: `step image ${stepNumber}`,
                    fn: async () => ({ type: 'step', result: (await uploadImage(config, apiBase, imageUrl, `step-image-${stepNumber}.jpg`, blogPostData.steps![i].imageMetadata)).source_url, placeholder, stepNumber })
                });
            });
        }

        // Lifestyle / content section images (e.g. [CONTENT_SECTION_IMAGE_2])
        // Blueprint-safe mapping:
        // - supports canonical keys: section_{id}
        // - supports legacy numeric keys: "{id}" or "{id-1}"
        // - supports explicit placeholder IDs already present in HTML
        if (images.stepsMap) {
            const sectionIds = new Set<number>();

            // A) IDs from placeholders in generated HTML
            const placeholderRegex = /\[\s*CONTENT_SECTION_IMAGE_\s*(\d+)\s*\]/gi;
            let placeholderMatch: RegExpExecArray | null = null;
            while ((placeholderMatch = placeholderRegex.exec(finalContent)) !== null) {
                const id = parseInt(placeholderMatch[1], 10);
                if (Number.isFinite(id)) sectionIds.add(id);
            }

            // B) IDs from structured content sections
            (blogPostData.contentSections || []).forEach(section => {
                const id = Number(section.id);
                if (Number.isFinite(id)) sectionIds.add(id);
            });

            // C) IDs from step map canonical keys
            Object.keys(images.stepsMap).forEach((key) => {
                const match = key.match(/^section_(\d+)$/i);
                if (!match) return;
                const id = parseInt(match[1], 10);
                if (Number.isFinite(id)) sectionIds.add(id);
            });

            const resolveSectionImageUrl = (sectionId: number): string => {
                const candidates = [
                    images.stepsMap[`section_${sectionId}`],            // canonical
                    images.stepsMap[`content_section_${sectionId}`],    // defensive legacy
                    images.stepsMap[String(sectionId)],                 // legacy same index
                    images.stepsMap[String(sectionId - 1)],             // legacy zero-based
                    images.stepsMap[`step_${sectionId}`],               // defensive
                    images.stepsMap[`step_${sectionId - 1}`],           // defensive zero-based
                ];
                return candidates.find(v => !!v && String(v).trim().length > 0) || '';
            };

            Array.from(sectionIds)
                .sort((a, b) => a - b)
                .forEach((sectionId) => {
                    const imageUrl = resolveSectionImageUrl(sectionId);
                    if (!imageUrl) return;

                    const placeholder = new RegExp(`\\[\\s*CONTENT_SECTION_IMAGE_\\s*${sectionId}\\s*\\]`, 'gi');
                    const sectionMeta = blogPostData.contentSections?.find(s => s.id === sectionId)?.imageMetadata;
                    scheduledSectionImagesCount += 1;

                    imageUploadTasks.push({
                        id: `content section image ${sectionId}`,
                        fn: async () => ({
                            type: 'section',
                            result: (await uploadImage(
                                config,
                                apiBase,
                                imageUrl,
                                `content-section-image-${sectionId}.jpg`,
                                sectionMeta
                            )).source_url,
                            placeholder,
                            sectionId
                        })
                    });
                });
        }

        // Track uploaded product images for reporting
        const uploadedProductImages: UploadedProductImages[] = [];

        images.products.filter(p => p.url).forEach(p => {
            const placeholder = new RegExp(`\\[PRODUCT_IMAGE_URL_${p.id}\\]`, 'g');
            const productName = p.productName || `Product ${p.id}`;

            // 1. Upload Primary Product Image to WordPress Media Library
            imageUploadTasks.push({
                id: `product ${productName} (primary image)`,
                fn: async () => {
                    const uploadResult = await uploadImage(
                        config, 
                        apiBase, 
                        p.url, 
                        `product-${p.id}-primary.jpg`,
                        {
                            title: `${productName} - Primary Image`,
                            alt: productName,
                            caption: `Main product image for ${productName}`,
                            description: `Primary product image uploaded from Amazon for ${productName}`
                        }
                    );
                    
                    // Track uploaded image
                    uploadedProductImages.push({
                        productId: p.id,
                        primaryImageId: uploadResult.id,
                        primaryImageUrl: uploadResult.source_url,
                        variantImages: []
                    });
                    
                    return { 
                        type: 'product', 
                        result: uploadResult.source_url, 
                        placeholder 
                    };
                }
            });

            // 2. Upload Variant Images (if available from Amazon)
            if (p.variants && p.variants.length > 0) {
                p.variants.forEach((variantUrl, variantIndex) => {
                    imageUploadTasks.push({
                        id: `product ${productName} (variant ${variantIndex + 1})`,
                        fn: async () => {
                            const uploadResult = await uploadImage(
                                config, 
                                apiBase, 
                                variantUrl, 
                                `product-${p.id}-variant-${variantIndex + 1}.jpg`,
                                {
                                    title: `${productName} - Variant ${variantIndex + 1}`,
                                    alt: `${productName} - Alternative view ${variantIndex + 1}`,
                                    caption: `Variant image ${variantIndex + 1} for ${productName}`,
                                    description: `Variant product image ${variantIndex + 1} uploaded from Amazon for ${productName}`
                                }
                            );
                            
                            return { 
                                type: 'product_variant', 
                                result: uploadResult,
                                productId: p.id,
                                variantIndex: variantIndex
                            };
                        }
                    });
                });
            }
        });

        const allTags = [...blogPostData.tags.course, ...blogPostData.tags.cuisine, ...blogPostData.tags.keywords];
        const taxonomyTasks: { id: string; fn: () => Promise<TaskResult> }[] = [];
        taxonomyTasks.push({
            id: `category '${blogPostData.category}'`,
            fn: async () => ({ type: 'category', result: await getTermId(config, apiBase, 'categories', blogPostData.category) })
        });
        allTags.forEach(tagName => {
            taxonomyTasks.push({
                id: `tag '${tagName}'`,
                fn: async () => ({ type: 'tag', result: await getTermId(config, apiBase, 'tags', tagName) })
            });
        });

        const executionQueue = [...imageUploadTasks, ...taxonomyTasks];
        const totalTasks = executionQueue.length + 1;
        let completedTasks = 0;

        onProgress({ message: 'Starting publish process...', current: completedTasks, total: totalTasks, log: `Found ${totalTasks} tasks to complete.` });

        const categoryResult: { id: number } = { id: 0 };
        const tagResults: { id: number }[] = [];

        for (const task of executionQueue) {
            const taskType = imageUploadTasks.some(t => t.id === task.id) ? 'Uploading' : 'Processing';
            onProgress({ message: `${taskType} ${task.id}...`, current: completedTasks, total: totalTasks, log: `[${completedTasks + 1}/${totalTasks}] Starting: ${task.id}...` });
            try {
                const result = await task.fn();
                completedTasks++;

                if (result.type === 'hero') {
                    featuredMediaId = result.result.id;
                    featuredMediaUrl = result.result.source_url;
                    if (typeof images.hero === 'string' && images.hero.trim()) {
                        const heroSource = decodeHtmlEntities(images.hero.trim());
                        const replacementCandidates = new Set<string>([images.hero.trim(), heroSource]);
                        try {
                            const resolved = new URL(resolveImageUrlForUpload(heroSource), window.location.origin);
                            replacementCandidates.add(resolved.toString());
                            replacementCandidates.add(`${resolved.pathname}${resolved.search}`);
                            replacementCandidates.add(`//${resolved.host}${resolved.pathname}${resolved.search}`);
                        } catch {
                            // Keep only raw candidates
                        }

                        for (const candidate of replacementCandidates) {
                            if (!candidate) continue;
                            finalContent = finalContent.replace(new RegExp(escapeRegExp(candidate), 'g'), featuredMediaUrl);
                        }
                    }
                } else if (result.type === 'step') {
                    const before = finalContent;
                    finalContent = finalContent.replace(result.placeholder, result.result);
                    // Fallback path: if placeholder was already expanded to <img alt="Step X"...>,
                    // force its src to the uploaded WordPress URL.
                    if (before === finalContent && Number.isFinite(result.stepNumber)) {
                        const stepAltPatternDouble = new RegExp(
                            `(<img\\b(?=[^>]*\\balt="Step\\s*${result.stepNumber}\\b")[^>]*\\bsrc=")([^"]*)(")`,
                            'gi'
                        );
                        const stepAltPatternSingle = new RegExp(
                            `(<img\\b(?=[^>]*\\balt='Step\\s*${result.stepNumber}\\b')[^>]*\\bsrc=')([^']*)(')`,
                            'gi'
                        );
                        const stepPlaceholderIdPattern = new RegExp(
                            `(<img\\b[^>]*\\bdata-placeholder-id="${result.stepNumber}"[^>]*\\bsrc=")([^"]*)(")`,
                            'gi'
                        );
                        const stepPlaceholderIdPatternSingle = new RegExp(
                            `(<img\\b[^>]*\\bdata-placeholder-id='${result.stepNumber}'[^>]*\\bsrc=')([^']*)(')`,
                            'gi'
                        );
                        finalContent = finalContent
                            .replace(stepAltPatternDouble, `$1${result.result}$3`)
                            .replace(stepAltPatternSingle, `$1${result.result}$3`)
                            .replace(stepPlaceholderIdPattern, `$1${result.result}$3`)
                            .replace(stepPlaceholderIdPatternSingle, `$1${result.result}$3`);
                    }
                } else if (result.type === 'product') {
                    finalContent = finalContent.replace(result.placeholder, result.result);
                } else if (result.type === 'section') {
                    // Primary path: replace explicit placeholder token.
                    const before = finalContent;
                    finalContent = finalContent.replace(result.placeholder, result.result);

                    // Fallback path: if placeholder was already expanded to <img alt="Content section X"...>,
                    // force its src to the uploaded WordPress URL so lifestyle images never break.
                    if (before === finalContent && Number.isFinite(result.sectionId)) {
                        const sectionAltPattern = new RegExp(
                            `(<img\\b(?=[^>]*\\balt="Content section\\s*${result.sectionId}\\b")[^>]*\\bsrc=")([^"]*)(")`,
                            'gi'
                        );
                        finalContent = finalContent.replace(sectionAltPattern, `$1${result.result}$3`);
                    }
                } else if (result.type === 'product_variant') {
                    // Track variant image upload
                    const trackedProduct = uploadedProductImages.find(up => up.productId === result.productId);
                    if (trackedProduct && trackedProduct.variantImages) {
                        trackedProduct.variantImages.push({
                            id: result.result.id,
                            url: result.result.source_url
                        });
                    }
                } else if (result.type === 'category') {
                    categoryResult.id = result.result;
                } else if (result.type === 'tag') {
                    tagResults.push({ id: result.result });
                }

                onProgress({ message: `Completed ${task.id}`, current: completedTasks, total: totalTasks, log: `✔️ [${completedTasks}/${totalTasks}] Success: ${task.id}` });
            } catch (error: any) {
                completedTasks++;
                onProgress({ message: `Failed task: ${task.id}`, current: completedTasks, total: totalTasks, log: `❌ [${completedTasks}/${totalTasks}] FAILED: ${task.id} - ${error.message}` });
                if (task.id === 'featured image') {
                    throw new Error(`Critical failure: Could not upload the featured image. Aborting publish. Details: ${error.message}`);
                }
            }
        }

        onProgress({ message: 'Finalizing: Creating post draft...', current: completedTasks, total: totalTasks, log: `[${completedTasks + 1}/${totalTasks}] Sending post data to WordPress...` });

        // Handle featured image based on configuration
        const featuredImageMode = config.featuredImageHandling || 'theme_default';

        // If gutenberg_cover mode and we have a featured image, inject wp:cover block at the start
        if (featuredImageMode === 'gutenberg_cover' && featuredMediaId && featuredMediaUrl) {
            // Fix: Inject explicit CSS to ensure cover block is truly full-width without gaps (fixes "thin line" issue)
            const styleCheckBlock = `<!-- wp:html -->
<style>
body {
    overflow-x: hidden !important;
}
.featured-hero-cover {
    width: 102vw !important;
    max-width: 102vw !important;
    margin-left: calc(50% - 51vw) !important;
    margin-right: calc(50% - 51vw) !important;
    padding: 0 !important;
    box-sizing: border-box !important;
    left: 50% !important;
    right: auto !important;
    position: relative !important;
    border: none !important;
}
.featured-hero-cover img {
    width: 100% !important;
    min-width: 100% !important;
    height: auto !important;
    min-height: 400px !important;
    object-fit: cover !important;
    display: block !important;
}
</style>
<!-- /wp:html -->
`;

            const coverBlock = `${styleCheckBlock}
<!-- wp:cover {"url":"${featuredMediaUrl}","id":${featuredMediaId},"dimRatio":0,"overlayColor":"black","focalPoint":{"x":0.5,"y":0.5},"minHeight":400,"minHeightUnit":"px","contentPosition":"center center","isDark":false,"align":"full","className":"featured-hero-cover"} -->
<div class="wp-block-cover alignfull is-light featured-hero-cover" style="min-height:400px"><span aria-hidden="true" class="wp-block-cover__background has-black-background-color has-background-dim-0 has-background-dim"></span><img class="wp-block-cover__image-background wp-image-${featuredMediaId}" alt="${blogPostData.heroImageMetadata?.alt || blogPostData.title}" src="${featuredMediaUrl}" style="object-position:50% 50%" data-object-fit="cover" data-object-position="50% 50%"/>
<div class="wp-block-cover__inner-container"><!-- wp:paragraph {"align":"center","placeholder":"Write title…","fontSize":"large"} -->
<p class="has-text-align-center has-large-font-size"></p>
<!-- /wp:paragraph --></div></div>
<!-- /wp:cover -->

`;
            finalContent = coverBlock + finalContent;
            onProgress({ message: 'Added featured image as Gutenberg cover block', current: completedTasks, total: totalTasks, log: '✔️ Featured image added to content as wp:cover block' });
        }

        finalContent = stripLargeReviewBlocksForWordPress(finalContent);

        const sideloadResult = await sideloadInlineImagesInHtml(config, apiBase, finalContent, onProgress);
        finalContent = sideloadResult.content;
        if (sideloadResult.uploaded > 0 || sideloadResult.failed > 0) {
            onProgress({
                message: 'Inline image sideload pass completed',
                current: completedTasks,
                total: totalTasks,
                log: `Inline sideload summary: ${sideloadResult.uploaded} uploaded, ${sideloadResult.failed} failed.`,
            });
        }

        const headers = { ...getWpApiHeaders(config), 'Content-Type': 'application/json' };
        const postData: any = {
            title: blogPostData.title,
            content: finalContent,
            status: 'draft',
            categories: [categoryResult.id],
            tags: tagResults.map(t => t.id).filter(Boolean),
            meta: {
                _yoast_wpseo_title: blogPostData.seo.metaTitle,
                _yoast_wpseo_metadesc: blogPostData.seo.metaDescription,
                _yoast_wpseo_focuskw: blogPostData.seo.focusKeyphrase,
            }
        };

        // Always set featured_media when hero upload succeeds.
        // This guarantees theme/archive thumbnails are consistent across WordPress installs.
        if (featuredMediaId) {
            postData.featured_media = featuredMediaId;
            onProgress({ message: 'Set featured image in WordPress metadata', current: completedTasks, total: totalTasks, log: `✔️ Featured image set (Attachment ID: ${featuredMediaId}, Mode: ${featuredImageMode})` });
        }

        const postController = new AbortController();
        const postTimeoutId = setTimeout(() => postController.abort(), GENERAL_API_TIMEOUT_MS);
        let newPost;
        try {
            const response = await fetch(`${apiBase}posts`, {
                method: 'POST',
                headers,
                body: JSON.stringify(postData),
                signal: postController.signal,
            });
            newPost = await parseWpJsonResponse<any>(response);
        } finally {
            clearTimeout(postTimeoutId);
        }

        completedTasks++;
        onProgress({ message: 'Success!', current: completedTasks, total: totalTasks, log: '✔️ Post draft created successfully!' });

        // Generate detailed upload summary report
        const totalVariantImages = uploadedProductImages.reduce((sum, up) => 
            sum + (up.variantImages?.length || 0), 0
        );
        const totalImages = (featuredMediaId ? 1 : 0) + images.steps.length + scheduledSectionImagesCount +
            uploadedProductImages.length + totalVariantImages;

        const productImagesSummary = uploadedProductImages.length > 0 
            ? uploadedProductImages.map(up => 
                `   • Product ${up.productId}: Primary + ${up.variantImages?.length || 0} variant(s)`
              ).join('\n')
            : '   • No product images';

        onProgress({ 
            message: 'Upload Complete', 
            current: completedTasks, 
            total: totalTasks, 
            log: `
📊 Media Library Upload Summary
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ Featured Image: ${featuredMediaId ? 'Uploaded (ID: ' + featuredMediaId + ')' : 'N/A'}
✅ Step Images: ${images.steps.length} uploaded
✅ Content Section Images: ${scheduledSectionImagesCount} uploaded
✅ Product Images: ${uploadedProductImages.length} product(s)
${productImagesSummary}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📸 Total Images in Media Library: ${totalImages}
   - Featured: ${featuredMediaId ? 1 : 0}
   - Steps: ${images.steps.length}
   - Content Sections: ${scheduledSectionImagesCount}
   - Products (Primary): ${uploadedProductImages.length}
   - Products (Variants): ${totalVariantImages}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`
        });

        if (userId && articleId) {
            try {
                await updateArticleStatus(articleId, statusToSet);
                onProgress({ message: 'Success!', current: completedTasks, total: totalTasks, log: '✔️ Article status updated in your account.' });
            } catch (e) {
                onProgress({ message: 'Warning!', current: completedTasks, total: totalTasks, log: '⚠️ Could not update article status in your account.' });
            }
        }

        return { link: newPost.link, id: newPost.id };

    } catch (error: any) {
        if (error.name === 'AbortError') {
            throw new Error(`Creating the post timed out after ${GENERAL_API_TIMEOUT_MS / 1000}s. Your WordPress site may be unresponsive.`);
        }
        console.error("Publishing to WordPress failed:", error);
        if (error instanceof TypeError && (error.message.includes('Failed to fetch') || error.message.includes('network error'))) {
            throw new Error("A network error occurred. This could be due to a CORS issue on your WordPress site or an incorrect Site URL. Please verify the URL and your site's CORS policy.");
        }
        throw error;
    }
};

