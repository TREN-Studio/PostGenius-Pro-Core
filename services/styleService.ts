

import { RECIPE_CARD_CSS, PRODUCT_VERDICT_BOX_CSS, MAIN_CTA_BUTTON_CSS, FAQ_SECTION_CSS } from '../styles/postStyles';
import type { BlogPostData, AmazonProduct, AmazonConfig, UserProfile, StyleConfig, Blueprint } from '../types';

export const defaultStyleConfig: StyleConfig = {
    custom_primary_color: '#F91880', // Default Pink
    custom_secondary_color: '#22d3ee', // Default Cyan
    custom_background_style: 'White',
    custom_font_family: "'Inter', sans-serif",
};

// Helper to clean ingredient strings for better Amazon Search results
const cleanIngredientForSearch = (ing: string): string => {
    return ing
        .toLowerCase()
        // Remove content in parentheses e.g. (16 oz)
        .replace(/\([^)]*\)/g, '')
        // Remove numbers
        .replace(/\d+/g, '')
        // Remove common units (singular and plural) and measuring words
        .replace(/\b(cup|cups|tablespoon|tablespoons|teaspoon|teaspoons|tsp|tbsp|oz|ounce|ounces|lb|lbs|pound|pounds|jar|cans?|container|pkg|package|bag|box|bunch|clove|cloves|pinch|dash|slice|slices|piece|pieces|g|kg|ml|l|gram|grams|liter|liters|bottle|bottles)\b/gi, '')
        // Remove common prep/filler words
        .replace(/\b(of|and|or|with|for|to|in|into|plus|more|about|approx|approximately|optional|garnish|taste|needed|divided|chopped|diced|minced|sliced|peeled|grated|crushed|drained|well|beaten|room|temperature|softened|melted|boiling|hot|cold|warm|large|small|medium|fresh|dried)\b/gi, '')
        // Remove non-word characters (except spaces)
        .replace(/[^\w\s]/g, '')
        // Normalize spaces
        .replace(/\s+/g, ' ')
        .trim();
};

const generateRecipeCardHtml = (data: BlogPostData, amazonConfig: AmazonConfig): string => {
    const affiliateTag = amazonConfig.associateTag || 'yourtag-20';
    const ingredientsList = data.ingredients?.map(ing => `<li>${ing.replace(/^-\s*/, '')}</li>`).join('') || '';
    const instructionsList = data.steps?.map(step => `<li>${step.text}</li>`).join('') || '';
    const prepIcon = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="13" r="8" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 13V9m0 4 3 2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M9 3h6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;
    const cookIcon = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 3c2.2 2.3 2.7 4 .9 6 .5-.1 1-.4 1.5-.8 1.1 2.7.4 4.9-2.1 6.6-2.5 1.8-5.5 1.8-7.2-.2-1.8-2.1-1.3-5 1.2-7.2.2 1 .6 1.7 1.2 2.3-.2-2.4.8-4.5 4.5-6.7Z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>`;
    const servingsIcon = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="9" cy="8" r="3" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="16" cy="9" r="2.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M3.5 18c.6-2.7 2.6-4 5.5-4s4.9 1.3 5.5 4M13 18c.3-1.9 1.8-3 3.8-3 1.8 0 3.2.9 3.7 3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;
    const caloriesIcon = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M13 2 6 13h5l-1 9 8-12h-5l0-8Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>`;
    const cartIcon = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="9" cy="20" r="1.6"/><circle cx="18" cy="20" r="1.6"/><path d="M2.5 4h2l2 11h11l2-8H6.2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    const printIcon = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M7 8V3h10v5M6 17h12v4H6zm-2-9h16a2 2 0 0 1 2 2v5h-4m-12 0H2v-5a2 2 0 0 1 2-2Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>`;

    // Construct smart search query from ingredients
    let searchQuery = data.title;

    if (data.ingredients && data.ingredients.length > 0) {
        // Use the first few ingredients (usually the most important) to build a query
        // We limit to 4 to prevent the query from becoming too specific/long for Amazon's search engine
        const relevantIngredients = data.ingredients
            .slice(0, 4)
            .map(cleanIngredientForSearch)
            .filter(s => s.length > 2); // Remove very short words

        if (relevantIngredients.length > 0) {
            searchQuery = relevantIngredients.join(' ');
        }
    }

    // Create Amazon Search Link (General)
    const amazonLink = `https://www.amazon.com/s?k=${encodeURIComponent(searchQuery)}&tag=${affiliateTag}`;

    const html = `
        <div class="postgenius-recipe-card">
            <div class="ac-header">
                <div class="ac-title-header">
                    <h2>${data.title}</h2>
                </div>
                <div class="ac-meta-bar">
                    <div class="ac-meta-item"><span class="ac-meta-icon">${prepIcon}</span><strong>Prep:</strong> <span class="ac-meta-value">${data.prepTime || '10 mins'}</span></div>
                    <div class="ac-meta-item"><span class="ac-meta-icon">${cookIcon}</span><strong>Cook:</strong> <span class="ac-meta-value">${data.cookTime || '20 mins'}</span></div>
                    <div class="ac-meta-item"><span class="ac-meta-icon">${servingsIcon}</span><strong>Servings:</strong> <span class="ac-meta-value">${data.servings || '4'}</span></div>
                    <div class="ac-meta-item"><span class="ac-meta-icon">${caloriesIcon}</span><strong>Calories:</strong> <span class="ac-meta-value">${data.calories || 'N/A'}</span></div>
                </div>
            </div>
            <div class="ac-body">
                <div class="ac-ingredients">
                    <h3>Ingredients</h3>
                    <ul>${ingredientsList}</ul>
                    <div class="ac-shop-container">
                        <a href="${amazonLink}" target="_blank" rel="noopener noreferrer nofollow" class="ac-shop-btn">
                            <span class="ac-btn-icon">${cartIcon}</span>
                            <span>Shop Ingredients on Amazon</span>
                        </a>
                    </div>
                </div>
                <div class="ac-instructions">
                    <h3>Instructions</h3>
                    <ol>${instructionsList}</ol>
                </div>
            </div>
            <div class="ac-footer">
                <div class="ac-footer-content" style="width: 100%; display: flex; justify-content: flex-end;">
                    <button class="ac-print-btn" onclick="window.print()"><span class="ac-print-icon">${printIcon}</span><span>Print Recipe</span></button>
                </div>
            </div>
        </div>
    `;

    // WRAP IN WORDPRESS HTML BLOCK
    return `<!-- wp:html -->${html}<!-- /wp:html -->`;
};

const generateFaqHtml = (faqs: { question: string; answer: string }[]): string => {
    if (!faqs || faqs.length === 0) return '';

    const faqItems = faqs.map(item => `
        <details class="faq-item">
            <summary class="faq-question">${item.question}</summary>
            <div class="faq-answer">${item.answer}</div>
        </details>
    `).join('');

    const html = `
        <div class="postgenius-faq-section">
            <h2>FAQ Section</h2>
            ${faqItems}
        </div>
    `;

    // WRAP IN WORDPRESS HTML BLOCK
    return `<!-- wp:html -->${html}<!-- /wp:html -->`;
};

const escapeHtml = (value: string): string =>
    String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');

const buildReadableAnchorTextFromUrl = (url: string): string => {
    try {
        const parsed = new URL(url);
        const host = parsed.hostname.replace(/^www\./i, '').toLowerCase();
        const parts = parsed.pathname.split('/').filter(Boolean);
        const lastSegment = decodeURIComponent(parts[parts.length - 1] || '')
            .replace(/\.(html?|php|aspx?)$/i, '')
            .replace(/[-_]+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

        if (lastSegment.length >= 4) {
            return lastSegment;
        }

        if (host.includes('foodjot.blog')) {
            return 'related FoodJot guide';
        }

        return 'related guide';
    } catch {
        return 'related guide';
    }
};

const normalizeVisibleLinks = (html: string): string => {
    if (!html) return html;

    // 1) If an anchor text is a raw URL, replace it with readable anchor text.
    let next = html.replace(
        /<a([^>]*\bhref\s*=\s*["'](https?:\/\/[^"']+)["'][^>]*)>\s*(https?:\/\/[^<\s]+)\s*<\/a>/gi,
        (match, attrs, href) => {
            const label = escapeHtml(buildReadableAnchorTextFromUrl(String(href)));
            return `<a${attrs}>${label}</a>`;
        }
    );

    // 2) Convert bare URLs in text nodes into anchors with readable text.
    const urlRegex = /https?:\/\/[^\s<>"']+/gi;
    next = next
        .split(/(<[^>]+>)/g)
        .map(part => {
            if (!part || part.startsWith('<')) return part;

            return part.replace(urlRegex, (rawUrl: string) => {
                let url = rawUrl;
                let trailing = '';
                while (/[),.;!?]$/.test(url)) {
                    trailing = url.slice(-1) + trailing;
                    url = url.slice(0, -1);
                }

                const label = escapeHtml(buildReadableAnchorTextFromUrl(url));
                return `<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>${trailing}`;
            });
        })
        .join('');

    return next;
};

const isExplicitPostgeniusDomainLink = (href: string): boolean => {
    const normalized = String(href || '').trim().toLowerCase();
    if (!normalized) return false;
    if (normalized.startsWith('#') || normalized.startsWith('mailto:') || normalized.startsWith('tel:') || normalized.startsWith('javascript:')) {
        return false;
    }
    return /^https?:\/\/(?:www\.)?postgeniuspro\.com(?:[/?#]|$)/i.test(normalized)
        || /^\/\/(?:www\.)?postgeniuspro\.com(?:[/?#]|$)/i.test(normalized);
};

const stripPlatformDomainLinks = (html: string): string => {
    if (!html) return html;

    let cleaned = html.replace(
        /<a\b([^>]*?)href\s*=\s*(["'])(.*?)\2([^>]*)>([\s\S]*?)<\/a>/gi,
        (match, pre, quote, href, post, inner) => {
            if (isExplicitPostgeniusDomainLink(String(href))) {
                return inner;
            }
            return match;
        }
    );

    // Safety: drop only raw postgenius domain URLs that appear in visible text nodes.
    // Do not touch URLs inside HTML attributes like img src, since article images
    // are intentionally hosted on postgeniuspro.com/api/uploads/...
    cleaned = cleaned
        .split(/(<[^>]+>)/g)
        .map(part => {
            if (!part || part.startsWith('<')) return part;
            return part.replace(/https?:\/\/(?:www\.)?postgeniuspro\.com[^\s<>"']*/gi, '');
        })
        .join('');

    return cleaned;
};

const isStrictAsin = (value: string | undefined): boolean => {
    const normalized = String(value || '').trim().toUpperCase();
    if (!normalized) return false;
    if (!/^(?:B[0-9A-Z]{9}|\d{10})$/.test(normalized)) return false;
    return /\d/.test(normalized);
};

const extractAsinFromText = (value: string | undefined): string | null => {
    if (!value) return null;
    const matches = Array.from(String(value).toUpperCase().matchAll(/(?:^|[^A-Z0-9])((?:B[0-9A-Z]{9}|\d{10}))(?=$|[^A-Z0-9])/g));
    const candidate = matches
        .map(match => match[1])
        .find(item => isStrictAsin(item));
    return candidate || null;
};

const extractAsinFromUrl = (url: string | undefined): string | null => {
    if (!url) return null;
    try {
        const parsed = new URL(url);
        const path = parsed.pathname || '';
        const patterns = [
            /\/dp\/([A-Z0-9]{10})(?:[/?]|$)/i,
            /\/gp\/product\/([A-Z0-9]{10})(?:[/?]|$)/i,
            /\/product\/([A-Z0-9]{10})(?:[/?]|$)/i
        ];
        for (const pattern of patterns) {
            const match = path.match(pattern);
            if (match?.[1]) return match[1].toUpperCase();
        }
        const asinParam = parsed.searchParams.get('ASIN') || parsed.searchParams.get('asin');
        if (asinParam) {
            const normalized = asinParam.trim().toUpperCase();
            if (isStrictAsin(normalized)) return normalized;
        }
    } catch {
        // ignore parsing failures and fallback to broad regex
    }
    return extractAsinFromText(url);
};

const resolveProductAsin = (product: AmazonProduct): string | null => {
    const fromUrl = extractAsinFromUrl(product.url);
    if (fromUrl) return fromUrl;

    const fromSpecs = (product.specs || [])
        .filter(spec => /asin/i.test(spec.key))
        .map(spec => extractAsinFromText(spec.value))
        .find(Boolean);
    if (fromSpecs) return fromSpecs;

    return extractAsinFromText(product.productName);
};

export const isAmazonHostedImage = (url: string | undefined): boolean => {
    if (!url) return false;
    try {
        const hostname = new URL(url).hostname.toLowerCase();
        return hostname.includes('media-amazon.com')
            || hostname.includes('ssl-images-amazon.com')
            || hostname.includes('images-amazon.com')
            || hostname.includes('amazonaws.com');
    } catch {
        return false;
    }
};

const isRejectedLegacyAmazonProductImageUrl = (url: string | undefined): boolean => {
    if (!url) return false;
    const normalized = String(url).trim().toLowerCase();
    if (!normalized) return false;
    return (
        normalized.includes('images-na.ssl-images-amazon.com/images/p/')
        || normalized.includes('fls-na.amazon.com/1/batch/')
        || normalized.includes('/images/g/01/gno/sprites/')
        || normalized.includes('/nav-sprite')
    );
};

export const isPlatformHostedImage = (url: string | undefined): boolean => {
    if (!url) return false;
    const normalized = String(url).trim();
    if (!normalized) return false;

    if (normalized.startsWith('/api/uploads/')) return true;
    if (normalized.startsWith('api/uploads/')) return true;
    if (normalized.startsWith('./api/uploads/')) return true;

    try {
        const parsed = new URL(normalized, 'https://www.postgeniuspro.com');
        const hostname = parsed.hostname.toLowerCase();
        return (
            (hostname === 'postgeniuspro.com' || hostname === 'www.postgeniuspro.com')
            && parsed.pathname.includes('/api/uploads/')
        );
    } catch {
        return false;
    }
};

const extractAmazonImageDimensionHint = (url: string | undefined): number => {
    if (!url) return 0;
    const normalized = String(url).trim();
    if (!normalized) return 0;
    if (isRejectedLegacyAmazonProductImageUrl(normalized)) return 0;
    if (/LZZZZZZZ/i.test(normalized)) return 0;

    const matches = Array.from(
        normalized.matchAll(/(?:AC_)?(?:UL|UX|UY|US|SL|SX|SY|SS)(\d{2,4})/gi)
    );
    const sizes = matches
        .map(match => Number(match[1]))
        .filter(value => Number.isFinite(value) && value > 0);

    if (sizes.length > 0) {
        return Math.max(...sizes);
    }

    return isAmazonHostedImage(normalized) ? 480 : 0;
};

export const isUsableAmazonProductImageUrl = (url: string | undefined, minimumSize = 220): boolean => {
    if (!isAmazonHostedImage(url)) return false;
    if (isRejectedLegacyAmazonProductImageUrl(url)) return false;
    return extractAmazonImageDimensionHint(url) >= minimumSize;
};

const pickBestAmazonProductImageUrl = (urls: Array<string | undefined>, minimumSize = 220): string => {
    const ranked = urls
        .map(url => upgradeLegacyAsinHostedImageUrl(url))
        .filter((url): url is string => !!url)
        .filter(isAmazonHostedImage)
        .filter((url, index, array) => array.indexOf(url) === index)
        .sort((a, b) => extractAmazonImageDimensionHint(b) - extractAmazonImageDimensionHint(a));

    const usable = ranked.find(url => isUsableAmazonProductImageUrl(url, minimumSize));
    return usable || '';
};

const isPlaceholderProductImageUrl = (url: string | undefined): boolean => {
    if (!url) return true;
    const normalized = String(url).trim().toLowerCase();
    if (!normalized) return true;
    if (normalized.startsWith('data:image/svg+xml')) return true;
    if (normalized.includes('placehold.co/')) return true;
    if (normalized.includes('image fallback')) return true;
    if (normalized.includes('step image fallback')) return true;
    if (normalized.includes('generation failed')) return true;
    return false;
};

const buildAsinHostedImageCandidates = (_product: AmazonProduct): string[] => [];

const buildAsinHostedImageFallback = (product: AmazonProduct): string | null => {
    return buildAsinHostedImageCandidates(product)[0] || null;
};

const upgradeLegacyAsinHostedImageUrl = (url: string | undefined): string | undefined => {
    if (!url) return url;
    const normalized = String(url).trim();
    if (!normalized) return undefined;
    const match = normalized.match(
        /^(https?:\/\/images-na\.ssl-images-amazon\.com\/images\/P\/([A-Z0-9]{10})\.(\d{2}))\.[^/?]+(\?.*)?$/i
    );
    if (!match) return normalized;
    return undefined;
};

const buildInlineProductFallbackImage = (label: string, fallbackSize: string): string => {
    const [wRaw, hRaw] = String(fallbackSize || '320x320').split('x');
    const width = Number(wRaw) || 320;
    const height = Number(hRaw) || width;
    const text = escapeHtml((label || 'Product Image').slice(0, 48));
    const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="pgpProductFallback" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#e5e7eb"/>
      <stop offset="100%" stop-color="#cbd5e1"/>
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" rx="12" fill="url(#pgpProductFallback)"/>
  <text x="50%" y="50%" text-anchor="middle" dominant-baseline="middle" fill="#334155" font-family="Arial, sans-serif" font-size="16">${text}</text>
</svg>`.trim();
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
};

const buildProductImageOnErrorAttr = (
    product: AmazonProduct,
    currentUrl: string,
    fallbackSize: string
): string => {
    const normalizedCurrent = upgradeLegacyAsinHostedImageUrl(currentUrl) || currentUrl;
    const productImageCandidate = upgradeLegacyAsinHostedImageUrl(product.imageUrl);
    const inlineFallback = buildInlineProductFallbackImage(product.productName, fallbackSize);
    const queue = [productImageCandidate]
        .filter(Boolean)
        .map(v => String(v))
        .filter(v => v && v !== normalizedCurrent && !isPlaceholderProductImageUrl(v))
        .filter(v => isUsableAmazonProductImageUrl(v))
        .filter((v, idx, arr) => arr.indexOf(v) === idx);

    if (inlineFallback && inlineFallback !== normalizedCurrent && !queue.includes(inlineFallback)) {
        queue.push(inlineFallback);
    }

    if (!queue.length) return '';

    const escapedQueue = queue
        .map(v => v.replace(/\\/g, '\\\\').replace(/'/g, "\\'"))
        .map(v => `'${v}'`)
        .join(',');

    return `onerror="if(!this.dataset.pgpFallbacks){this.dataset.pgpFallbacks=[${escapedQueue}].join('|');}var q=(this.dataset.pgpFallbacks||'').split('|').filter(Boolean);if(q.length){this.src=q.shift();this.dataset.pgpFallbacks=q.join('|');}else{this.onerror=null;}"`;
};

export const resolvePreferredProductImageUrl = (
    product: AmazonProduct,
    productImageUrls: Record<string, string> | undefined,
    fallbackSize: string
): string => {
    const mappedRaw = upgradeLegacyAsinHostedImageUrl(productImageUrls?.[String(product.id)]);
    const mapped = isPlaceholderProductImageUrl(mappedRaw) ? undefined : mappedRaw;
    const mappedPlatform = isPlatformHostedImage(mapped) ? mapped : undefined;
    const mappedAmazon = isAmazonHostedImage(mapped) ? mapped : undefined;
    const productImageRaw = upgradeLegacyAsinHostedImageUrl(product.imageUrl);
    const productImage = isPlaceholderProductImageUrl(productImageRaw) ? undefined : productImageRaw;
    const productPlatform = isPlatformHostedImage(productImage) ? productImage : undefined;
    const productAmazon = isAmazonHostedImage(productImage) ? productImage : undefined;

    if (mappedPlatform) return mappedPlatform;
    if (productPlatform) return productPlatform;

    const bestAmazonImage = pickBestAmazonProductImageUrl([mappedAmazon, productAmazon]);
    if (bestAmazonImage) return bestAmazonImage;

    return buildInlineProductFallbackImage(product.productName, fallbackSize);
};

const resolveProductBoxImageUrl = (
    product: AmazonProduct,
    productImageUrls: Record<string, string> | undefined,
    fallbackSize: string
): string => resolvePreferredProductImageUrl(product, productImageUrls, fallbackSize);

const resolveReviewProductImageUrl = (
    product: AmazonProduct,
    productImageUrls: Record<string, string> | undefined,
    fallbackSize: string
): string => resolvePreferredProductImageUrl(product, productImageUrls, fallbackSize);

const buildProductAffiliateLink = (product: AmazonProduct, affiliateTag: string): string => {
    const fallback = `https://www.amazon.com/s?k=${encodeURIComponent(product.productName)}&tag=${affiliateTag}`;
    const asin = resolveProductAsin(product);
    if (asin) return `https://www.amazon.com/dp/${asin}?tag=${affiliateTag}`;
    if (!product.url) return fallback;

    try {
        const parsed = new URL(product.url);
        if (!parsed.hostname.includes('amazon.')) {
            return fallback;
        }
        // Avoid landing users on search result pages when we can.
        if (/^\/s(\/|$)/i.test(parsed.pathname)) {
            return fallback;
        }
        if (!parsed.searchParams.get('tag')) {
            parsed.searchParams.set('tag', affiliateTag);
        }
        return parsed.toString();
    } catch {
        return fallback;
    }
};

type ProductFeatureLine = {
    key: string;
    value: string;
    line: string;
    priority: number;
};

const normalizeWhitespace = (value: string | undefined): string =>
    String(value || '').replace(/\s+/g, ' ').trim();

const stripUrlFragments = (value: string | undefined): string =>
    normalizeWhitespace(
        String(value || '')
            .replace(/\burl source:\s*/gi, ' ')
            .replace(/https?:\/\/[^\s]+/gi, ' ')
            .replace(/\bwww\.[^\s]+/gi, ' ')
            .replace(/(?:^|\s)\/dp\/[A-Z0-9]{10}(?=$|\s)/gi, ' ')
            .replace(/[|•]+/g, ' ')
    );

const looksLikeRawProductUrlTitle = (value: string | undefined): boolean => {
    const normalized = normalizeWhitespace(value);
    if (!normalized) return true;
    return /^https?:\/\//i.test(normalized)
        || /^www\./i.test(normalized)
        || /^url source:/i.test(normalized)
        || /amazon\.[a-z.]+\/(dp|gp\/product|s\?)/i.test(normalized)
        || /^\/dp\/[A-Z0-9]{10}$/i.test(normalized);
};

const clampProductTitle = (value: string): string => {
    const normalized = normalizeWhitespace(value)
        .replace(/\s+[|:-]\s*$/g, '')
        .replace(/^[|:-]\s+/g, '');
    if (!normalized) return '';

    const words = normalized.split(' ');
    const limitedWords = words.length > 10 ? words.slice(0, 10).join(' ') : normalized;
    if (limitedWords.length <= 72) return limitedWords;

    const clipped = limitedWords.slice(0, 69).replace(/\s+\S*$/, '').trim();
    return clipped ? `${clipped}...` : limitedWords.slice(0, 72).trim();
};

const buildSpecBasedProductTitle = (product: AmazonProduct | null | undefined): string => {
    if (!product) return '';
    const brand = normalizeWhitespace(
        (product.specs || []).find(spec => /^(brand|manufacturer|maker)$/i.test(spec.key))?.value
    );
    const model = normalizeWhitespace(
        (product.specs || []).find(spec => /^(model|series|item model number)$/i.test(spec.key))?.value
    );
    const category = normalizeWhitespace(
        (product.specs || []).find(spec => /^(category|type|product type)$/i.test(spec.key))?.value
    );

    if (brand && model) return clampProductTitle(`${brand} ${model}`);
    if (brand && category) return clampProductTitle(`${brand} ${category}`);
    if (model && category) return clampProductTitle(`${model} ${category}`);
    return '';
};

const buildTitleFromAmazonUrl = (url: string | undefined): string => {
    const raw = normalizeWhitespace(url);
    if (!raw) return '';

    try {
        const parsed = new URL(raw);
        const searchQuery = normalizeWhitespace(
            decodeURIComponent(parsed.searchParams.get('k') || parsed.searchParams.get('keywords') || '')
                .replace(/\+/g, ' ')
        );
        if (searchQuery) return clampProductTitle(searchQuery);

        const pathname = decodeURIComponent(parsed.pathname || '')
            .replace(/\/+$/, '')
            .replace(/^\/+/, '');
        const segments = pathname.split('/').filter(Boolean);
        const slugSegment = segments.find(segment => /[a-z]/i.test(segment) && !/^(dp|gp|product|s)$/i.test(segment));
        if (slugSegment) {
            const cleaned = clampProductTitle(
                slugSegment
                    .replace(/[-_]+/g, ' ')
                    .replace(/\b([A-Z0-9]{10})\b/gi, ' ')
            );
            if (cleaned) return cleaned;
        }
    } catch {
        // Ignore parse failures and fallback below.
    }

    return '';
};

export const getCompactProductDisplayTitle = (
    product: AmazonProduct | null | undefined,
    rawTitle?: string,
    href?: string
): string => {
    const cleanedRawTitle = clampProductTitle(stripUrlFragments(rawTitle));
    if (cleanedRawTitle && !looksLikeRawProductUrlTitle(cleanedRawTitle)) {
        return cleanedRawTitle;
    }

    const cleanedProductName = clampProductTitle(stripUrlFragments(product?.productName));
    if (cleanedProductName && !looksLikeRawProductUrlTitle(cleanedProductName)) {
        return cleanedProductName;
    }

    const fromUrl = clampProductTitle(buildTitleFromAmazonUrl(href || product?.url));
    if (fromUrl && !looksLikeRawProductUrlTitle(fromUrl)) {
        return fromUrl;
    }

    const fromSpecs = buildSpecBasedProductTitle(product);
    if (fromSpecs) return fromSpecs;

    const asin = product ? resolveProductAsin(product) : extractAsinFromUrl(href);
    if (asin) return `Amazon Product ${asin}`;

    return 'Amazon Product';
};

export const sanitizeProductCardTitlesInHtml = (
    html: string,
    productData: AmazonProduct[] = []
): string => {
    if (!html || typeof DOMParser === 'undefined') return html;

    try {
        const doc = new DOMParser().parseFromString(`<div id="pgp-root">${html}</div>`, 'text/html');
        const root = doc.getElementById('pgp-root');
        if (!root) return html;

        const productMap = new Map(productData.map(product => [String(product.id), product]));
        const cards = Array.from(root.querySelectorAll<HTMLElement>('.amazon-compare-card, .product-verdict-box, .amazon-review-card'));

        cards.forEach(card => {
            const productId = card.getAttribute('data-product-id')
                || card.querySelector<HTMLElement>('[data-product-id]')?.getAttribute('data-product-id')
                || '';
            const product = productMap.get(productId) || null;
            const primaryLink = card.querySelector<HTMLAnchorElement>('a[href*="amazon."], a[href*="amzn.to"]');

            const titleTarget = card.querySelector<HTMLElement>(
                '.amazon-compare-title, .product-verdict-content h4 a, .product-verdict-content h4, .amazon-review-title span:last-child'
            );
            if (!titleTarget) return;

            const displayTitle = getCompactProductDisplayTitle(product, titleTarget.textContent || '', primaryLink?.href || '');
            if (!displayTitle) return;
            titleTarget.textContent = displayTitle;

            if (card.classList.contains('amazon-compare-card')) {
                const priceNode = card.querySelector<HTMLElement>('.amazon-compare-price');
                const titleNode = card.querySelector<HTMLElement>('.amazon-compare-title');
                let descriptionNode = card.querySelector<HTMLElement>('.amazon-compare-description');
                if (!descriptionNode) {
                    descriptionNode = doc.createElement('p');
                    descriptionNode.className = 'amazon-compare-description';
                }
                descriptionNode.textContent = buildCompactProductDescription(product);

                let featuresNode = card.querySelector<HTMLUListElement>('.amazon-compare-features');
                if (!featuresNode) {
                    featuresNode = doc.createElement('ul');
                    featuresNode.className = 'amazon-compare-features';
                }
                featuresNode.innerHTML = getKeyFeatures(product || { id: 0, productName: displayTitle, isPrimary: false, specs: [] })
                    .slice(0, 2)
                    .map(item => `<li>${escapeHtml(item)}</li>`)
                    .join('');

                let ratingNode = card.querySelector<HTMLElement>('.amazon-compare-rating');
                if (!ratingNode) {
                    ratingNode = doc.createElement('p');
                    ratingNode.className = 'amazon-compare-rating';
                }
                ratingNode.textContent = `Rating: ${getProductRating(product || { id: 0, productName: displayTitle, isPrimary: false, specs: [] })}`;

                const allowed = new Set<HTMLElement>();
                card.querySelectorAll<HTMLElement>('.amazon-compare-badge, .amazon-compare-image-box, .amazon-compare-title, .amazon-compare-price, .amazon-compare-description, .amazon-compare-features, .amazon-compare-rating, .amazon-table-cta-button').forEach(node => allowed.add(node));
                Array.from(card.children).forEach(child => {
                    if (!allowed.has(child as HTMLElement)) {
                        child.remove();
                    }
                });

                if (priceNode) {
                    priceNode.after(descriptionNode);
                    descriptionNode.after(featuresNode);
                    featuresNode.after(ratingNode);
                } else if (titleNode) {
                    titleNode.after(descriptionNode);
                    descriptionNode.after(featuresNode);
                    featuresNode.after(ratingNode);
                }
            }

            if (card.classList.contains('product-verdict-box')) {
                const content = card.querySelector<HTMLElement>('.product-verdict-content');
                if (!content) return;

                const priceNode = content.querySelector<HTMLElement>('.product-verdict-price');
                let descriptionNode = content.querySelector<HTMLElement>('.product-verdict-description');
                if (!descriptionNode) {
                    descriptionNode = doc.createElement('p');
                    descriptionNode.className = 'product-verdict-description';
                }
                descriptionNode.textContent = buildCompactProductDescription(product);

                Array.from(content.querySelectorAll('p')).forEach(node => {
                    if (node === priceNode || node === descriptionNode) return;
                    node.remove();
                });

                if (priceNode) {
                    priceNode.after(descriptionNode);
                } else {
                    content.appendChild(descriptionNode);
                }
            }
        });

        return root.innerHTML;
    } catch {
        return html;
    }
};

const isAsinValue = (value: string): boolean => isStrictAsin(value);

const toDisplayKey = (key: string): string =>
    key
        .replace(/[_-]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/\b\w/g, c => c.toUpperCase());

const getFeaturePriority = (key: string): number => {
    const k = key.toLowerCase();
    if (/(capacity|quart|qt|liter|litre|l\b)/.test(k)) return 1;
    if (/(power|watt|w|voltage|volt)/.test(k)) return 2;
    if (/(function|mode|preset|program)/.test(k)) return 3;
    if (/(control|display|touch|panel)/.test(k)) return 4;
    if (/(temperature|temp)/.test(k)) return 5;
    if (/(dimension|size|footprint)/.test(k)) return 6;
    if (/(material|basket|tray|non-stick|nonstick)/.test(k)) return 7;
    if (/(warranty|guarantee)/.test(k)) return 8;
    if (/(weight)/.test(k)) return 9;
    return 20;
};

const inferTitleFeatureLines = (productName: string): ProductFeatureLine[] => {
    const title = normalizeWhitespace(productName);
    if (!title) return [];

    const lower = title.toLowerCase();
    const inferred: ProductFeatureLine[] = [];

    const capacityMatch = title.match(/(\d+(?:\.\d+)?)\s*(?:qt|quart|quarts|l|liter|liters|litre|litres)\b/i);
    if (capacityMatch) {
        const unit = /l|liter|liters|litre|litres/i.test(capacityMatch[0]) ? 'L' : 'Qt';
        inferred.push({
            key: 'Capacity',
            value: `${capacityMatch[1]} ${unit}`,
            line: `Capacity: ${capacityMatch[1]} ${unit}`,
            priority: 1
        });
    }

    const powerMatch = title.match(/(\d{3,4})\s*w\b/i);
    if (powerMatch) {
        inferred.push({
            key: 'Power',
            value: `${powerMatch[1]}W`,
            line: `Power: ${powerMatch[1]}W`,
            priority: 2
        });
    }

    const modeMatch = title.match(/(\d+)\s*[- ]\s*in\s*[- ]\s*(\d+)/i) || title.match(/(\d+)\s*in\s*1/i);
    if (modeMatch) {
        const modeValue = modeMatch[2] ? `${modeMatch[1]}-in-${modeMatch[2]}` : `${modeMatch[1]}-in-1`;
        inferred.push({
            key: 'Functions',
            value: modeValue,
            line: `Functions: ${modeValue}`,
            priority: 3
        });
    }

    if (/\bdigital\b|\btouch\b|\bsmart\b/.test(lower)) {
        inferred.push({
            key: 'Control Type',
            value: 'Digital Controls',
            line: 'Control Type: Digital Controls',
            priority: 4
        });
    } else if (/\bmanual\b|\bknob\b/.test(lower)) {
        inferred.push({
            key: 'Control Type',
            value: 'Manual Controls',
            line: 'Control Type: Manual Controls',
            priority: 4
        });
    }

    if (/\bstainless\b/.test(lower)) {
        inferred.push({
            key: 'Material',
            value: 'Stainless Steel Finish',
            line: 'Material: Stainless Steel Finish',
            priority: 7
        });
    }

    return inferred;
};

const collectProductFeatureLines = (product: AmazonProduct): ProductFeatureLine[] => {
    const fromSpecs: ProductFeatureLine[] = (product.specs || [])
        .map(spec => ({
            key: normalizeWhitespace(spec.key),
            value: normalizeWhitespace(spec.value),
        }))
        .filter(spec => spec.key.length > 1 && spec.value.length > 1)
        .filter(spec => !/^n\/?a$/i.test(spec.value))
        .filter(spec => !/^unknown$/i.test(spec.value))
        .filter(spec => !/^(asin|sku|item id|product id)$/i.test(spec.key))
        .filter(spec => !isAsinValue(spec.value))
        .map(spec => {
            const displayKey = toDisplayKey(spec.key);
            return {
                key: displayKey,
                value: spec.value,
                line: `${displayKey}: ${spec.value}`,
                priority: getFeaturePriority(spec.key),
            };
        });

    const merged = [...fromSpecs, ...inferTitleFeatureLines(product.productName)];
    const seen = new Set<string>();
    return merged
        .filter(item => {
            const normalized = item.line.toLowerCase();
            if (seen.has(normalized)) return false;
            seen.add(normalized);
            return true;
        })
        .sort((a, b) => a.priority - b.priority || a.line.length - b.line.length);
};

const buildProductSummary = (product: AmazonProduct): string => {
    const top = collectProductFeatureLines(product).slice(0, 2).map(item => item.line);
    if (top.length >= 2) {
        return `Top highlights: ${top[0]} | ${top[1]}.`;
    }
    if (top.length === 1) {
        return `Top highlight: ${top[0]}.`;
    }
    return 'A strong option in this category with a balanced feature set.';
};

const featureLineToPhrase = (line: string): string => {
    const normalized = normalizeWhitespace(line).replace(/\.+$/g, '');
    if (!normalized) return '';

    const [rawKey, ...rest] = normalized.split(':');
    const key = normalizeWhitespace(rawKey).toLowerCase();
    const value = normalizeWhitespace(rest.join(':'));
    if (!value) return normalized;

    if (key.includes('best for')) return `${value} buyers`;
    if (key.includes('use case')) return `${value} use`;
    if (key.includes('capacity')) return `${value} capacity`;
    if (key.includes('control')) return `${value.toLowerCase()} controls`;
    if (key.includes('material')) return `${value} finish`;
    if (key.includes('type') || key.includes('category')) return value;
    if (key.includes('feature')) return value;

    return `${value} ${key}`.trim();
};

const buildCompactProductDescription = (product: AmazonProduct | null | undefined): string => {
    if (!product) {
        return 'A practical Amazon pick with balanced everyday value.';
    }

    const phrases = collectProductFeatureLines(product)
        .slice(0, 2)
        .map(item => featureLineToPhrase(item.line))
        .filter(Boolean);

    if (phrases.length >= 2) {
        return `${toSentenceCase(phrases[0])}. ${toSentenceCase(phrases[1])}.`;
    }
    if (phrases.length === 1) {
        return `${toSentenceCase(phrases[0])}. Built for practical day-to-day use.`;
    }

    return 'A practical Amazon pick for readers who want straightforward daily performance.';
};

const deriveProsCons = (product: AmazonProduct): { pros: string[]; cons: string[] } => {
    const lines = collectProductFeatureLines(product).map(item => item.line);

    const pros = lines.slice(0, 3);
    if (!pros.length) {
        pros.push(
            'Reliable performance for everyday use',
            'Solid value in its category',
            'Suitable for most home setups'
        );
    }

    const fingerprint = `${product.productName} ${(product.specs || []).map(s => `${s.key} ${s.value}`).join(' ')}`.toLowerCase();
    const cons: string[] = [];
    if (!/(warranty|guarantee)/.test(fingerprint)) {
        cons.push('Warranty coverage may vary by seller or region');
    }
    if (!/(capacity|quart|qt|liter|litre)/.test(fingerprint)) {
        cons.push('Verify capacity to match your household size');
    }
    cons.push('Final value depends on current Amazon pricing');

    return { pros, cons: cons.slice(0, 3) };
};

const toSentenceCase = (value: string): string => {
    const normalized = normalizeWhitespace(value).replace(/\.+$/g, '').trim();
    if (!normalized) return '';
    return normalized.charAt(0).toUpperCase() + normalized.slice(1);
};

const buildReviewLead = (product: AmazonProduct, rankLabel: string): string => {
    const features = collectProductFeatureLines(product).slice(0, 2).map(item => item.line);
    if (features.length >= 2) {
        return `The ${product.productName} earns the ${rankLabel.toLowerCase()} spot thanks to ${features[0].toLowerCase()} and ${features[1].toLowerCase()}.`;
    }
    if (features.length === 1) {
        return `The ${product.productName} stands out with ${features[0].toLowerCase()}, making it a strong option for buyers who want dependable daily performance.`;
    }
    return `The ${product.productName} is a practical pick for shoppers who want a balanced mix of value, simplicity, and everyday usability.`;
};

const buildTradeoffLine = (product: AmazonProduct, cons: string[]): string => {
    if (cons.length > 0) {
        return `${toSentenceCase(cons[0])}. This is the main point to weigh before you buy.`;
    }

    const features = collectProductFeatureLines(product).slice(0, 1);
    if (features.length > 0) {
        return `Its biggest advantage is ${features[0].line.toLowerCase()}, but the right fit still depends on your space, budget, and feature priorities.`;
    }

    return 'The best choice comes down to whether you want maximum value, a simpler setup, or the most polished overall finish.';
};

const buildReviewSectionHeading = (products: AmazonProduct[]): string => {
    const count = Math.max(1, Math.min(products.length, 5));
    return `Top ${count} Product Reviews`;
};

const getReviewRankLabel = (index: number): string => {
    if (index === 0) return 'Best Overall';
    if (index === 1) return 'Runner-Up';
    if (index === 2) return 'Best Value';
    return 'Top Pick';
};

const getKeyFeatures = (product: AmazonProduct): string[] => {
    const features = collectProductFeatureLines(product).slice(0, 5).map(item => item.line);
    if (features.length) return features;
    return [
        'Category: Home appliance',
        'Use case: Everyday household usage',
        'Best for: Buyers prioritizing practical value',
    ];
};

const getProductRating = (product: AmazonProduct): string => {
    const spec = (product.specs || []).find(s => /(rating|stars?|score)/i.test(s.key));
    if (spec?.value) return spec.value;
    return 'N/A';
};

const generateAmazonReviewCardsHtml = (
    products: AmazonProduct[],
    productImageUrls: Record<string, string> | undefined,
    affiliateTag: string
): string => {
    if (!products || products.length === 0) return '';

    const cards = products.map((product, index) => {
        const link = buildProductAffiliateLink(product, affiliateTag);
        const imageUrl = resolveReviewProductImageUrl(product, productImageUrls, '1200x675');
        const onErrorAttr = buildProductImageOnErrorAttr(product, imageUrl, '1200x675');
        const displayTitle = getCompactProductDisplayTitle(product, product.productName, link);
        const price = product.price || 'Price unavailable';
        const summary = buildReviewLead(product, getReviewRankLabel(index));
        const keyFeatures = getKeyFeatures(product);
        const rankLabel = getReviewRankLabel(index);
        const { pros, cons } = deriveProsCons(product);
        const tradeoff = buildTradeoffLine(product, cons);

        return `
<article class="amazon-review-card" data-product-id="${product.id}">
    <div class="amazon-review-heading-row">
        <h3 class="amazon-review-title">
            <span class="amazon-review-title-accent" aria-hidden="true"></span>
            <span>${escapeHtml(displayTitle)}</span>
        </h3>
        <span class="amazon-review-badge">${escapeHtml(rankLabel)}</span>
    </div>
    <div class="amazon-review-image-wrap">
        <img src="${imageUrl}" alt="${escapeHtml(displayTitle)}" data-product-id="${product.id}" loading="lazy"${onErrorAttr ? ` ${onErrorAttr}` : ''} />
    </div>
    <div class="amazon-review-body">
        <p class="amazon-review-summary">${escapeHtml(summary)}</p>
        <p class="amazon-review-price">${escapeHtml(price)}</p>
        <div class="amazon-key-features amazon-review-features">
            <h4>Highlights</h4>
            <ul>${keyFeatures.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
        </div>
        <div class="pros-cons-grid amazon-review-columns">
            <div class="pros-box amazon-review-list">
                <h4>Pros</h4>
                <ul>${pros.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
            </div>
            <div class="cons-box amazon-review-list">
                <h4>Cons</h4>
                <ul>${cons.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
            </div>
        </div>
        <p class="amazon-review-tradeoff"><strong>Tradeoff:</strong> ${escapeHtml(tradeoff)}</p>
        <div class="amazon-review-cta-wrap">
            <a href="${link}" class="amazon-cta-button amazon-cta-button-full" target="_blank" rel="noopener noreferrer sponsored">Check Price on Amazon</a>
        </div>
    </div>
</article>`.trim();
    }).join('\n\n');

    return `<h2>${buildReviewSectionHeading(products)}</h2>\n<!-- wp:html --><section class="amazon-reviews-section">${cards}</section><!-- /wp:html -->`;
};

const generateAmazonComparisonTableHtml = (
    products: AmazonProduct[],
    productImageUrls: Record<string, string> | undefined,
    affiliateTag: string
): string => {
    if (!products || products.length === 0) return '';

    const cards = products.slice(0, 3).map((product, index) => {
        const link = buildProductAffiliateLink(product, affiliateTag);
        const imageUrl = resolveReviewProductImageUrl(product, productImageUrls, '320x320');
        const onErrorAttr = buildProductImageOnErrorAttr(product, imageUrl, '320x320');
        const displayTitle = getCompactProductDisplayTitle(product, product.productName, link);
        const price = product.price || 'N/A';
        const rating = getProductRating(product);
        const compactDescription = buildCompactProductDescription(product);
        const miniFeatures = getKeyFeatures(product).slice(0, 2);
        const rankLabel = getReviewRankLabel(index);

        return `
<article class="amazon-compare-card" data-product-id="${product.id}">
    <span class="amazon-compare-badge">${escapeHtml(rankLabel)}</span>
    <div class="amazon-compare-image-box">
        <img src="${imageUrl}" alt="${escapeHtml(displayTitle)}" data-product-id="${product.id}" class="comparison-thumb" loading="lazy"${onErrorAttr ? ` ${onErrorAttr}` : ''} />
    </div>
    <h3 class="amazon-compare-title">${escapeHtml(displayTitle)}</h3>
    <p class="amazon-compare-price">${escapeHtml(price)}</p>
    <p class="amazon-compare-description">${escapeHtml(compactDescription)}</p>
    <ul class="amazon-compare-features">${miniFeatures.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
    <p class="amazon-compare-rating">Rating: ${escapeHtml(rating)}</p>
    <a href="${link}" class="amazon-table-cta-button" target="_blank" rel="noopener noreferrer sponsored">View on Amazon</a>
</article>`.trim();
    }).join('\n');

    return `<h2>Amazon Product Comparison</h2>
<!-- wp:html -->
<div class="amazon-comparison-grid" data-layout="three-column">
    ${cards}
</div>
<!-- /wp:html -->`;
};

const generateDefaultProductFaqHtml = (title: string): string => {
    const shortTitle = escapeHtml(title || 'these products');
    return `<!-- wp:html -->
<div class="postgenius-faq-section">
    <h2>FAQ Section</h2>
    <details class="faq-item">
        <summary class="faq-question">Which option is best for most buyers?</summary>
        <div class="faq-answer">The best overall option is usually the one with the most consistent value-to-performance ratio for ${shortTitle}.</div>
    </details>
    <details class="faq-item">
        <summary class="faq-question">Should I prioritize price or features first?</summary>
        <div class="faq-answer">Start with your must-have features, then compare prices only among products that meet those minimum requirements.</div>
    </details>
    <details class="faq-item">
        <summary class="faq-question">How often should I re-check pricing?</summary>
        <div class="faq-answer">Prices can change quickly, so re-checking before purchase helps you capture active deals and avoid outdated listings.</div>
    </details>
</div>
<!-- /wp:html -->`;
};

export const buildStyledArticleHtml = (htmlContent: string, styleConfig: StyleConfig | null | undefined): string => {
    const config = { ...defaultStyleConfig, ...(styleConfig || {}) };
    const cleanedHtmlContent = String(htmlContent || '').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '').trim();

    // Define variables so raw CSS can consume them
    const styleVariables = `
      :root {
        --pgp-primary-color: ${config.custom_primary_color};
        --pgp-secondary-color: ${config.custom_secondary_color};
        --pgp-font-family: ${config.custom_font_family};
        
        /* Derived vars for Themes */
        --pgp-card-bg: ${config.custom_background_style === 'Dark' ? '#1F2937' : '#FFFFFF'};
        --pgp-secondary-bg: ${config.custom_background_style === 'Dark' ? '#111827' : '#F9FAFB'};
        --pgp-border-color: ${config.custom_background_style === 'Dark' ? '#374151' : '#E5E7EB'};
        --pgp-text-color: ${config.custom_background_style === 'Dark' ? '#D1D5DB' : '#374151'};
        --pgp-text-secondary: ${config.custom_background_style === 'Dark' ? '#9CA3AF' : '#6B7280'};
        --pgp-heading-color: ${config.custom_background_style === 'Dark' ? '#F3F4F6' : '#111827'};
      }
    `;

    const bodyStyle = config.custom_background_style === 'Dark'
        ? 'background-color: #111827; color: #D1D5DB;'
        : (config.custom_background_style === 'Transparent' ? 'background-color: transparent;' : 'background-color: #ffffff; color: #374151;');

    // Combine all CSS into a single block, wrapped in wp:html for Gutenberg compatibility
    const fullCss = `
<!-- wp:html -->
<style>
    ${styleVariables}
    body { ${bodyStyle} font-family: var(--pgp-font-family); }
    a { color: var(--pgp-secondary-color); }
    ${RECIPE_CARD_CSS}
    ${PRODUCT_VERDICT_BOX_CSS}
    ${MAIN_CTA_BUTTON_CSS}
    ${FAQ_SECTION_CSS}

    /* Featured Image / Hero Fixes for Gutenberg & Themes - AGGRESSIVE OVERRIDE */
    
    /* Force featured image container to full viewport width, breaking out of any restrictive parent */
    .featured-image,
    .post-thumbnail,
    .entry-header .post-thumbnail,
    .entry-content .post-thumbnail,
    article .post-thumbnail,
    .single-post .post-thumbnail,
    .wp-block-post-featured-image {
        width: 100vw !important;
        max-width: 100vw !important;
        position: relative !important;
        left: 50% !important;
        right: 50% !important;
        margin-left: -50vw !important;
        margin-right: -50vw !important;
        margin-top: 0 !important;
        margin-bottom: 2rem !important;
        padding: 0 !important;
        max-height: 720px !important;
        overflow: hidden !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
    }

    /* Force image itself to cover properly */
    .featured-image img, 
    .post-thumbnail img, 
    .wp-post-image,
    .entry-header .post-thumbnail img,
    .wp-block-post-featured-image img {
        width: 100% !important;
        min-width: 100% !important;
        height: auto !important;
        min-height: 400px !important;
        max-height: 720px !important;
        object-fit: cover !important;
        object-position: center center !important;
        display: block !important;
        margin: 0 auto !important;
        padding: 0 !important;
    }

    /* Force full width content area if theme restricts it */
    .site-content, 
    .content-area,
    .site-main,
    article,
    .entry-header {
        max-width: 100% !important;
    }

    /* Remove any padding/margin from parent containers for featured images */
    .site-content,
    .content-area,
    .site-main {
        padding-left: 0 !important;
        padding-right: 0 !important;
    }

    /* Restore normal padding for content AFTER the featured image */
    .entry-content,
    .entry-content > *:not(.post-thumbnail):not(.featured-image) {
        max-width: 1200px;
        margin-left: auto;
        margin-right: auto;
        padding-left: 1rem;
        padding-right: 1rem;
    }
</style>
<!-- /wp:html -->
    `.trim();

    // Prepend the CSS to the HTML content
    return `${fullCss}\n${cleanedHtmlContent}`;
};

export const generateFinalHtml = (
    blogPostData: BlogPostData,
    productData: AmazonProduct[],
    amazonConfig: AmazonConfig,
    styleConfig: StyleConfig | null,
    userProfile: UserProfile | null,
    stepImageUrls?: Record<string, string>,
    productImageUrls?: Record<string, string>,
    isPreview: boolean = false,
    blueprintType?: Blueprint
): string => {
    const stripTags = (value: string): string => value.replace(/<[^>]*>/g, '');

    const normalizeHeadingText = (value: string): string =>
        stripTags(value)
            .replace(/&nbsp;/gi, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .toLowerCase();

    const extractFirstBlock = (input: string, regex: RegExp): { rest: string; block: string } => {
        const match = input.match(regex);
        if (!match) return { rest: input, block: '' };
        return {
            rest: input.replace(match[0], '').trim(),
            block: match[0].trim()
        };
    };

    const splitIntoH2Sections = (input: string): { preamble: string; sections: Array<{ headingText: string; html: string }> } => {
        const h2 = /<h2\b[^>]*>[\s\S]*?<\/h2>/gi;
        const matches = Array.from(input.matchAll(h2));
        if (!matches.length) return { preamble: input.trim(), sections: [] };

        const preamble = input.slice(0, matches[0].index || 0).trim();
        const sections = matches.map((m, idx) => {
            const start = m.index || 0;
            const end = (idx + 1 < matches.length) ? (matches[idx + 1].index || input.length) : input.length;
            const html = input.slice(start, end).trim();
            const headingText = normalizeHeadingText(m[0]);
            return { headingText, html };
        });

        return { preamble, sections };
    };

    const replaceFirstH2Text = (sectionHtml: string, newText: string): string => {
        // Preserve attributes on the first h2.
        const escaped = newText
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/\"/g, '&quot;')
            .replace(/'/g, '&#039;');
        return sectionHtml.replace(/<h2\b([^>]*)>[\s\S]*?<\/h2>/i, `<h2$1>${escaped}</h2>`);
    };

    const demoteAllH2ToH3 = (sectionHtml: string): string =>
        sectionHtml
            .replace(/<h2\b/gi, '<h3')
            .replace(/<\/h2>/gi, '</h3>');

    // Merge multiple H2 sections into exactly one canonical H2 section.
    // Extra sections are preserved but demoted to H3 so the final article keeps a fixed top-level outline.
    const mergeSectionsToSingleH2 = (canonicalHeading: string, sections: string[]): string => {
        if (!sections.length) return '';
        const base = replaceFirstH2Text(sections[0], canonicalHeading);
        const extras = sections.slice(1).map(demoteAllH2ToH3).filter(Boolean);
        return extras.length ? `${base}\n\n${extras.join('\n\n')}`.trim() : base.trim();
    };

    const looksLikeProductBlueprint = (html: string): boolean => {
        const lower = html.toLowerCase();
        return (
            lower.includes('amazon product comparison') ||
            lower.includes('product reviews') ||
            lower.includes('why choose') ||
            lower.includes('how to choose') ||
            lower.includes('beginner') ||
            lower.includes('conclusion &') ||
            lower.includes('conclusion and')
        );
    };

    const reorderRecipeSections = (raw: string, disclosureBlock: string, recipeCardBlock: string, faqBlock: string, spotlightBlock: string): string => {
        const { preamble, sections } = splitIntoH2Sections(raw);

        const buckets: Record<string, string[]> = {
            intro: [],
            ingredients: [],
            spotlight: [],
            conclusion: [],
            faq: []
        };
        const unknown: string[] = [];
        const matchedSteps: string[] = [];

        for (const s of sections) {
            const h = s.headingText;
            if (h.includes('introduction')) buckets.intro.push(s.html);
            else if (h.includes('ingredients')) buckets.ingredients.push(s.html);
            else if (h.includes('product spotlight') || h.includes('product spot light')) buckets.spotlight.push(s.html);
            else if (
                h.includes('step-by-step') ||
                h.includes('step by step') ||
                h.includes('instructions') ||
                h.includes('directions') ||
                h.includes('method') ||
                h === 'steps'
            ) matchedSteps.push(s.html);
            else if (h.includes('faq') || h.includes('frequently asked questions')) buckets.faq.push(s.html);
            else if (h.includes('conclusion')) buckets.conclusion.push(s.html);
            else unknown.push(s.html);
        }

        // Place the main CTA as the "Product Spotlight" section if the AI did not create one.
        if (spotlightBlock) {
            if (buckets.spotlight.length > 0) {
                buckets.spotlight[0] = `${buckets.spotlight[0]}\n\n${spotlightBlock}`;
            } else {
                buckets.spotlight.push(`<h2>Product Spotlight</h2>\n${spotlightBlock}`);
            }
        }
        // Normalize spotlight heading text.
        buckets.spotlight = buckets.spotlight.map(html => replaceFirstH2Text(html, 'Product Spotlight'));

        const out: string[] = [];
        if (disclosureBlock) out.push(disclosureBlock);
        if (preamble) out.push(preamble);

        // Canonical outline required for food posts:
        // Affiliate Disclosure, Introduction, Ingredients, Product Spotlight,
        // Step-by-Step Instructions, Recipe Card, FAQ Section, Conclusion.
        const introSection = mergeSectionsToSingleH2('Introduction', buckets.intro);
        const ingredientsSection = mergeSectionsToSingleH2('Ingredients', buckets.ingredients);
        const spotlightSection = mergeSectionsToSingleH2('Product Spotlight', buckets.spotlight);

        // Build ONE Step-by-Step H2 section.
        // If the AI produced extra/unknown H2 sections (often unrelated "tips"), we drop them when
        // we already have a valid Step-by-Step section to keep the recipe outline EXACT.
        let stepsSection = '';
        if (matchedSteps.length > 0) {
            const base = replaceFirstH2Text(matchedSteps[0], 'Step-by-Step Instructions');
            const extras = matchedSteps.slice(1).map(demoteAllH2ToH3);
            stepsSection = [base, ...extras].filter(Boolean).join('\n\n').trim();
        } else if (unknown.length > 0) {
            const unknownExtras = unknown.map(demoteAllH2ToH3).filter(Boolean).join('\n\n');
            stepsSection = `<h2>Step-by-Step Instructions</h2>\n${unknownExtras}`.trim();
        }

        const conclusionSection = mergeSectionsToSingleH2('Conclusion', buckets.conclusion);

        if (introSection) out.push(introSection);
        if (ingredientsSection) out.push(ingredientsSection);
        if (spotlightSection) out.push(spotlightSection);
        if (stepsSection) out.push(stepsSection);

        // Recipe Card then FAQ then Conclusion (as requested).
        if (recipeCardBlock) out.push(recipeCardBlock);
        if (faqBlock) {
            out.push(replaceFirstH2Text(faqBlock.replace(/<h2>\s*Frequently Asked Questions\s*<\/h2>/i, '<h2>FAQ Section</h2>'), 'FAQ Section'));
        } else {
            const faqSection = mergeSectionsToSingleH2('FAQ Section', buckets.faq.map(html => replaceFirstH2Text(html, 'FAQ Section')));
            if (faqSection) out.push(faqSection);
        }

        if (conclusionSection) out.push(conclusionSection);

        return out.join('\n\n').trim();
    };

    const reorderProductSections = (raw: string, disclosureBlock: string, faqBlock: string, mainCtaBlock: string, affiliateTag: string): string => {
        const { preamble, sections } = splitIntoH2Sections(raw);
        const stripSectionImagePlaceholders = (sectionHtml: string): string => {
            if (!sectionHtml) return sectionHtml;
            return sectionHtml
                .replace(/<p>\s*<\/p>/gi, '')
                .replace(/\n{3,}/g, '\n\n')
                .trim();
        };

        const buckets: Record<string, string[]> = {
            intro: [],
            why: [],
            how: [],
            reviews: [],
            comparison: [],
            faq: [],
            conclusion: []
        };
        const unknownBeforeComparison: string[] = [];
        const unknownAfterComparison: string[] = [];
        let sawComparisonInSource = false;

        for (const s of sections) {
            const h = s.headingText;
            if (h.includes('introduction')) buckets.intro.push(s.html);
            else if (h.includes('why choose')) buckets.why.push(s.html);
            else if (h.includes('how to choose')) buckets.how.push(s.html);
            else if (h.includes('product reviews') || (h.includes('reviews') && !h.includes('preview'))) buckets.reviews.push(s.html);
            else if (h.includes('amazon product comparison') || h.includes('comparison table') || h.includes('product comparison') || h.includes('comparison')) {
                sawComparisonInSource = true;
                buckets.comparison.push(s.html);
            }
            else if (h.includes('faq') || h.includes('frequently asked questions')) buckets.faq.push(s.html);
            else if (h.includes('conclusion')) buckets.conclusion.push(s.html);
            else if (sawComparisonInSource) unknownAfterComparison.push(s.html);
            else unknownBeforeComparison.push(s.html);
        }

        // Canonical outline required for product posts:
        // Affiliate Disclosure, Introduction, Why Choose, How to Choose, Product Reviews,
        // Amazon Product Comparison, BeginnerÃ¢â‚¬â„¢s Guide, FAQ Section, Conclusion & CTA.

        const out: string[] = [];
        if (disclosureBlock) out.push(disclosureBlock);
        if (preamble) out.push(preamble);

        let introSection = mergeSectionsToSingleH2('Introduction', buckets.intro.map(html => replaceFirstH2Text(html, 'Introduction')));
        let whySection = mergeSectionsToSingleH2('Why Choose This Selection?', buckets.why.map(html => replaceFirstH2Text(html, 'Why Choose This Selection?')));
        let howSection = mergeSectionsToSingleH2('How to Choose', buckets.how.map(html => replaceFirstH2Text(html, 'How to Choose')));
        let reviewsSection = mergeSectionsToSingleH2('Product Reviews', buckets.reviews.map(html => replaceFirstH2Text(html, 'Product Reviews')));
        let comparisonSection = mergeSectionsToSingleH2('Amazon Product Comparison', buckets.comparison.map(html => replaceFirstH2Text(html, 'Amazon Product Comparison')));

        // Keep rich editorial sections generated under custom H2 titles instead of dropping them.
        // Many review articles arrive with headings like "Why the X..." or "How Does X Compare..."
        // and contain the section lifestyle placeholders we want to preserve.
        const firstUnknownSection = unknownBeforeComparison.length
            ? unknownBeforeComparison.shift() || ''
            : unknownAfterComparison.length
                ? unknownAfterComparison.shift() || ''
                : '';

        // Hard fallback template for Amazon Multi-ASIN style posts
        if (!introSection) {
            introSection = firstUnknownSection
                ? replaceFirstH2Text(firstUnknownSection, 'Introduction')
                : `<h2>Introduction</h2><p>This guide compares the top options for ${escapeHtml(blogPostData.title)} and highlights the best pick for different budgets and priorities.</p>`;
        }
        if (!whySection) {
            whySection = `<h2>Why Choose This Selection?</h2><p>We selected these products based on value, reliability, customer feedback, and practical day-to-day use cases.</p>`;
        }
        if (!howSection) {
            howSection = `<h2>How to Choose</h2><ul><li>Check core features against your exact use case.</li><li>Compare long-term value, not just launch price.</li><li>Prioritize products with consistent ratings and proven durability.</li></ul>`;
        }

        const generatedReviewsSection = generateAmazonReviewCardsHtml(productData, productImageUrls, affiliateTag);
        if (generatedReviewsSection) {
            reviewsSection = generatedReviewsSection;
        }

        const generatedComparisonSection = generateAmazonComparisonTableHtml(productData, productImageUrls, affiliateTag);
        if (generatedComparisonSection) {
            comparisonSection = generatedComparisonSection;
        }

        introSection = stripSectionImagePlaceholders(introSection);
        whySection = stripSectionImagePlaceholders(whySection);
        howSection = stripSectionImagePlaceholders(howSection);

        if (introSection) out.push(introSection);
        if (whySection) out.push(whySection);
        if (howSection) out.push(howSection);
        if (reviewsSection) out.push(reviewsSection);
        unknownBeforeComparison
            .map(section => stripSectionImagePlaceholders(section))
            .filter(Boolean)
            .forEach(section => out.push(section));
        unknownAfterComparison
            .map(section => stripSectionImagePlaceholders(section))
            .filter(Boolean)
            .forEach(section => out.push(section));
        if (comparisonSection) out.push(comparisonSection);

        if (faqBlock) {
            out.push(replaceFirstH2Text(faqBlock.replace(/<h2>\s*Frequently Asked Questions\s*<\/h2>/i, '<h2>FAQ Section</h2>'), 'FAQ Section'));
        } else {
            const faqSection = mergeSectionsToSingleH2('FAQ Section', buckets.faq.map(html => replaceFirstH2Text(html, 'FAQ Section')));
            if (faqSection) out.push(faqSection);
            else out.push(generateDefaultProductFaqHtml(blogPostData.title));
        }

        // Conclusion stays clean and editorial for Amazon Multi-ASIN posts.
        let conclusionMerged = mergeSectionsToSingleH2('Conclusion', buckets.conclusion.map(html => replaceFirstH2Text(html, 'Conclusion')));
        conclusionMerged = stripSectionImagePlaceholders(conclusionMerged);
        if (conclusionMerged) {
            out.push(conclusionMerged.trim());
        }

        return out.join('\n\n').trim();
    };

    const pruneAmazonReviewArtifactsForNonReviewBlueprint = (raw: string): string => {
        // 1) Remove full wp:html blocks for comparison/review cards
        let cleaned = raw
            .replace(/<!-- wp:html -->\s*<div class="amazon-comparison-grid"[\s\S]*?<!-- \/wp:html -->/gi, '')
            .replace(/<!-- wp:html -->\s*<section class="amazon-reviews-section"[\s\S]*?<!-- \/wp:html -->/gi, '');

        // 2) Remove standalone legacy card blocks if present outside wp:html wrappers
        cleaned = cleaned
            .replace(/<div class="amazon-comparison-grid"[\s\S]*?<\/div>/gi, '')
            .replace(/<section class="amazon-reviews-section"[\s\S]*?<\/section>/gi, '')
            .replace(/<article class="amazon-review-card"[\s\S]*?<\/article>/gi, '')
            .replace(/<article class="amazon-compare-card"[\s\S]*?<\/article>/gi, '');

        // 3) Remove Amazon-specific H2 sections by heading text
        const { preamble, sections } = splitIntoH2Sections(cleaned);
        const filteredSections = sections.filter(section => {
            const h = section.headingText;
            return !(
                h.includes('amazon product comparison') ||
                h === 'product reviews' ||
                h.includes('product reviews')
            );
        });

        cleaned = [preamble, ...filteredSections.map(s => s.html)]
            .filter(Boolean)
            .join('\n\n')
            .trim();

        // 4) Final cleanup for empty wrappers
        cleaned = cleaned
            .replace(/<p>\s*<\/p>/gi, '')
            .replace(/<div>\s*<\/div>/gi, '')
            .replace(/\n{3,}/g, '\n\n')
            .trim();

        return cleaned;
    };

    const affiliateTag = amazonConfig.associateTag || 'yourtag-20';
    const normalizedNiche = String(blogPostData.niche || '').toLowerCase();
    const effectiveBlueprint = blueprintType || null;
    // IMPORTANT:
    // Amazon comparison/review structure must apply ONLY to the Amazon Multi-ASIN blueprint.
    // Keep Recipe/Guide and URL Link Replicator on their native structure.
    const isAmazonMultiAsinNiche = effectiveBlueprint
        ? effectiveBlueprint === 'review'
        : normalizedNiche === 'review';
    if ((!productData || productData.length === 0) && isAmazonMultiAsinNiche) {
        productData = [{
            id: 1,
            productName: blogPostData.title || 'Featured Product',
            isPrimary: true,
            price: 'Check Amazon',
            specs: [
                { key: 'Category', value: 'Top Pick' },
                { key: 'Recommendation', value: 'Editor Choice' },
            ],
            url: `https://www.amazon.com/s?k=${encodeURIComponent(blogPostData.title || 'top products')}&tag=${affiliateTag}`,
        }];
    }
    let content = blogPostData.htmlContent;

    // 1. Handle Affiliate Disclosure
    const affiliateDisclaimerHtml = `<!-- wp:paragraph --><p class="has-text-align-center"><em><strong>Affiliate Disclosure:</strong> This post may contain affiliate links. If you make a purchase through these links, we may earn a commission at no extra cost to you. For more information, please see our affiliate disclosure.</em></p><!-- /wp:paragraph --><!-- wp:separator --><hr class="wp-block-separator has-alpha-channel-opacity"/><!-- /wp:separator -->`;
    content = content.replace(/\[\s*AFFILIATE_DISCLOSURE_BLOCK\s*\]/g, affiliateDisclaimerHtml);

    // 2. Handle Individual Product Links AND Images (Replaces [PRODUCT_AFFILIATE_LINK_X])
    // In preview mode, we skip this replacement to allow BlogPostPreview to render interactive components
    if (!isPreview) {
        const affiliateLinkRegex = /(href\s*=\s*["']?)\s*\[\s*PRODUCT_AFFILIATE_LINK_(\d+)\s*\]|\[\s*PRODUCT_AFFILIATE_LINK_(\d+)\s*\]/gi;

        content = content.replace(affiliateLinkRegex, (match, hrefPrefix, idInside, idStandalone) => {
            const idStr = idInside || idStandalone;
            if (!idStr) return match;

            const id = parseInt(idStr, 10);
            const product = productData?.find(p => p.id === id);

            if (!product) {
                // Fallback: If product not found (hallucinated ID), link to generic Amazon search for the article title
                // This prevents broken relative links like postgeniuspro.com/blog/[PLACEHOLDER]
                const fallbackLink = `https://www.amazon.com/s?k=${encodeURIComponent(blogPostData.title || 'best products')}&tag=${affiliateTag}`;

                if (hrefPrefix) {
                    return `target="_blank" rel="noopener noreferrer" ${hrefPrefix}${fallbackLink}`;
                }
                return ''; // Remove standalone placeholder
            }

            const productLink = buildProductAffiliateLink(product, affiliateTag);

            if (hrefPrefix) {
                return `target="_blank" rel="noopener noreferrer" ${hrefPrefix}${productLink}`;
            } else {
                // Return empty string to remove standalone text placeholders
                return '';
            }
        });
    }

    // 3. Inject Real Images (Steps)
    // In preview mode, we skip this to allow BlogPostPreview to handle placeholders and interactivity
    if (stepImageUrls && !isPreview) {
        content = content.replace(/<img[^>]*src="\[STEP_IMAGE_(\d+)\]"[^>]*>/g, (match, id) => {
            const index = parseInt(id, 10) - 1;
            const url = stepImageUrls[index];
            if (url) {
                return `<!-- wp:image --><figure class="wp-block-image"><img src="${url}" alt="Step ${id}"/></figure><!-- /wp:image -->`;
            }
            return '';
        });
        content = content.replace(/\[STEP_IMAGE_(\d+)\]/g, (match, id) => {
            const index = parseInt(id, 10) - 1;
            const url = stepImageUrls[index];
            if (url) {
                return `<!-- wp:image --><figure class="wp-block-image"><img src="${url}" alt="Step ${id}"/></figure><!-- /wp:image -->`;
            }
            return '';
        });
    }

    const replaceContentSectionImagePlaceholders = (input: string): string => {
        if (!input || !stepImageUrls || isPreview) return input;

        const buildContentSectionImageBlock = (sectionId: string): string => {
            const normalizedId = String(sectionId || '').trim();
            const url = stepImageUrls[`section_${normalizedId}`];
            if (!url) return '';
            // Keep section lifestyle images as plain HTML figure to avoid Gutenberg block validation errors.
            return `<figure class="wp-block-image size-large content-section-image-block"><img src="${url}" alt="Content section ${normalizedId}" class="content-section-image"/></figure>`;
        };

        // Handle both standalone placeholders and legacy <img src="[CONTENT_SECTION_IMAGE_X]"> forms.
        let next = input.replace(
            /<img[^>]*src="\[\s*CONTENT_SECTION_IMAGE_\s*(\d+)\s*\]"[^>]*>/gi,
            (match, sectionId) => buildContentSectionImageBlock(sectionId)
        );
        next = next.replace(
            /\[\s*CONTENT_SECTION_IMAGE_\s*(\d+)\s*\]/gi,
            (match, sectionId) => buildContentSectionImageBlock(sectionId)
        );

        return next;
    };

    // 3b. Inject Real Images (Content Sections for non-food blueprints)
    content = replaceContentSectionImagePlaceholders(content);

    // 4. Clean up legacy Product Image Placeholders
    // In preview mode, we skip this to allow BlogPostPreview to handle placeholders
    if (productImageUrls && !isPreview) {
        content = content.replace(/<img[^>]*src="\[PRODUCT_IMAGE_URL_(\d+)\]"[^>]*>/g, (match, id) => {
            const product = productData.find(p => String(p.id) === String(id));
            const mappedRaw = upgradeLegacyAsinHostedImageUrl(productImageUrls[id]);
            const mapped = isPlaceholderProductImageUrl(mappedRaw) ? undefined : mappedRaw;
            const url = product
                ? resolveReviewProductImageUrl(product, productImageUrls, '600x600')
                : ((isAmazonHostedImage(mapped) || isPlatformHostedImage(mapped)) ? mapped : undefined);
            if (url) {
                return `<!-- wp:image --><figure class="wp-block-image"><img src="${url}" alt="Product ${id}"/></figure><!-- /wp:image -->`;
            }
            return '';
        });
        content = content.replace(/\[PRODUCT_IMAGE_URL_(\d+)\]/g, (match, id) => {
            const product = productData.find(p => String(p.id) === String(id));
            const mappedRaw = upgradeLegacyAsinHostedImageUrl(productImageUrls[id]);
            const mapped = isPlaceholderProductImageUrl(mappedRaw) ? undefined : mappedRaw;
            const url = product
                ? resolveReviewProductImageUrl(product, productImageUrls, '600x600')
                : ((isAmazonHostedImage(mapped) || isPlatformHostedImage(mapped)) ? mapped : undefined);
            if (url) {
                return `<!-- wp:image --><figure class="wp-block-image"><img src="${url}" alt="Product ${id}"/></figure><!-- /wp:image -->`;
            }
            return '';
        });
    }

    // 5. Generate Main CTA (Replaced with Product Box if primary product exists)
    const primaryProduct = productData.find(p => p.isPrimary) || (productData.length > 0 ? productData[0] : null);

    let mainCtaHtml = '';

    if (isAmazonMultiAsinNiche) {
        mainCtaHtml = '';
    } else if (primaryProduct) {
        const ctaLink = buildProductAffiliateLink(primaryProduct, affiliateTag);
        const imageUrl = resolveProductBoxImageUrl(primaryProduct, productImageUrls, '600x600');
        const onErrorAttr = buildProductImageOnErrorAttr(primaryProduct, imageUrl, '600x600');
        const displayTitle = getCompactProductDisplayTitle(primaryProduct, primaryProduct.productName, ctaLink);
        const compactDescription = buildCompactProductDescription(primaryProduct);
        const priceDisplay = primaryProduct.price ? `<span class="product-verdict-price">${primaryProduct.price}</span>` : '';

        // Render detailed product box. Added data-product-id for preview interactivity.
        mainCtaHtml = `
<!-- wp:html -->
<div class="product-verdict-box" style="margin-top: 2rem; margin-bottom: 2rem;">
    <div class="product-verdict-image" style="width: 180px; height: 180px; overflow: hidden; border-radius: 12px; background: #f3f4f6;">
         <a href="${ctaLink}" target="_blank" rel="noopener noreferrer sponsored" style="display: block; width: 100%; height: 100%;">
            <img src="${imageUrl}" alt="${displayTitle}" data-product-id="${primaryProduct.id}" style="width: 100% !important; height: 100% !important; object-fit: contain !important; object-position: center center !important; display: block; background: #ffffff; padding: 0.45rem;"${onErrorAttr ? ` ${onErrorAttr}` : ''} />
         </a>
    </div>
    <div class="product-verdict-content">
         <h4><a href="${ctaLink}" target="_blank" rel="noopener noreferrer sponsored">${displayTitle}</a></h4>
         ${priceDisplay}
         <p class="product-verdict-description">${compactDescription}</p>
         <a href="${ctaLink}" class="amazon-cta-button" target="_blank" rel="noopener noreferrer sponsored">Buy on Amazon</a>
    </div>
</div>
<!-- /wp:html -->
        `.trim();
    } else {
        // Fallback to generic button if no product found
        const ctaSearchTerm = blogPostData.title;
        const ctaLink = `https://www.amazon.com/s?k=${encodeURIComponent(ctaSearchTerm)}&tag=${affiliateTag}`;
        mainCtaHtml = `
<!-- wp:html -->
<div class="cta-container">
    <a href="${ctaLink}" class="pgp-cta-button" target="_blank" rel="noopener noreferrer sponsored">Check Price on Amazon</a>
</div>
<!-- /wp:html -->
        `.trim();
    }

    // 6. Replace Main CTA Placeholder
    const isRecipe = effectiveBlueprint
        ? effectiveBlueprint === 'recipe'
        : (blogPostData.niche === 'food' || blogPostData.niche === 'recipe');

    if (mainCtaHtml && content.includes('[MAIN_CTA_BUTTON]')) {
        content = content.replace(/<p>\s*\[\s*MAIN_CTA_BUTTON\s*\]\s*<\/p>/g, mainCtaHtml);
        content = content.replace(/\[\s*MAIN_CTA_BUTTON\s*\]/g, mainCtaHtml);
    } else if (mainCtaHtml) {
        // Fallback insertion logic
        if (isRecipe) {
            // For Recipes: Insert after intro headers (keep existing behavior)
            const match = content.match(/(<\/(h2|h3)>)/);
            if (match) {
                content = content.replace(match[0], `${match[0]}\n${mainCtaHtml}`);
            }
        }
        // For Non-Recipes: We will append it to the end later
    } else {
        // Never leak a raw CTA placeholder into preview or published HTML when the
        // current blueprint intentionally does not render a main CTA block.
        content = content.replace(/<p>\s*\[\s*MAIN_CTA_BUTTON\s*\]\s*<\/p>/gi, '');
        content = content.replace(/<div[^>]*>\s*\[\s*MAIN_CTA_BUTTON\s*\]\s*<\/div>/gi, '');
        content = content.replace(/\[\s*MAIN_CTA_BUTTON\s*\]/gi, '');
    }

    // 7. Inject Recipe Card
    const hasIngredients = blogPostData.ingredients && blogPostData.ingredients.length > 0;
    const hasSteps = blogPostData.steps && blogPostData.steps.length > 0;

    // Relaxed condition: Generate card if we have EITHER ingredients OR steps
    if (isRecipe && (hasIngredients || hasSteps)) {
        const recipeCardHtml = generateRecipeCardHtml(blogPostData, amazonConfig);
        const placeholderRegex = /\[RECIPE_CARD_CONTENT\]/g;

        if (placeholderRegex.test(content)) {
            content = content.replace(/<p>\s*\[RECIPE_CARD_CONTENT\]\s*<\/p>/gi, recipeCardHtml);
            content = content.replace(/<div[^>]*>\s*\[RECIPE_CARD_CONTENT\]\s*<\/div>/gi, recipeCardHtml);
            content = content.replace(placeholderRegex, recipeCardHtml);
        } else {
            const conclusionMatch = content.match(/<h2.*?>Conclusion<\/h2>/i);
            if (conclusionMatch) {
                content = content.replace(conclusionMatch[0], `${recipeCardHtml}\n${conclusionMatch[0]}`);
            } else {
                content += recipeCardHtml;
            }
        }
    } else {
        // Cleanup: Ensure placeholder is removed if no card logic matched
        const placeholderRegex = /\[RECIPE_CARD_CONTENT\]/g;
        if (placeholderRegex.test(content)) {
            content = content.replace(/<p>\s*\[RECIPE_CARD_CONTENT\]\s*<\/p>/gi, '');
            content = content.replace(/<div[^>]*>\s*\[RECIPE_CARD_CONTENT\]\s*<\/div>/gi, '');
            content = content.replace(placeholderRegex, '');
        }
    }

    // 8. Inject FAQ Section
    if (blogPostData.faq && blogPostData.faq.length > 0) {
        const faqHtml = generateFaqHtml(blogPostData.faq);
        const hasExistingFaqSection =
            /postgenius-faq-section/i.test(content)
            || /<h2[^>]*>\s*(?:faq section|frequently asked questions)\s*<\/h2>/i.test(content);
        if (!hasExistingFaqSection) {
            if (isRecipe) {
                // For Recipes: Insert before Conclusion (keep existing behavior)
                const conclusionMatch = content.match(/<h2.*?>Conclusion<\/h2>/i);
                if (conclusionMatch) {
                    content = content.replace(conclusionMatch[0], `${faqHtml}\n${conclusionMatch[0]}`);
                } else {
                    content += faqHtml;
                }
            } else {
                // For Non-Recipes: Append to END (After Conclusion)
                content += faqHtml;
            }
        }
    }

    // 9. Append Main CTA for Non-Recipes if not already inserted
    if (mainCtaHtml && !isRecipe && !content.includes(mainCtaHtml) && !content.includes('[MAIN_CTA_BUTTON]')) {
        content += mainCtaHtml;
    }

    // 9. Author Name replacement
    const authorName = userProfile?.full_name || 'Postgenius Pro Admin';
    content = content.replace(/\[AUTHOR_NAME\]/g, authorName);

    // 10. Final Cleanup
    content = content.replace(/<a\b(?![^>]*\btarget=)/gi, '<a target="_blank" rel="noopener noreferrer" ');

    // 11. Enforce Blueprint Section Ordering (Structure-only; does not change CSS/styles)
    // Food (recipe): Affiliate Disclosure, Introduction, Ingredients, Product Spotlight, Step-by-Step Instructions, Recipe Card, FAQ Section, Conclusion.
    // Products: Affiliate Disclosure, Introduction, Why Choose, How to Choose, Product Reviews, Amazon Product Comparison, BeginnerÃ¢â‚¬â„¢s Guide, FAQ Section, Conclusion & CTA.
    try {
        let disclosureBlock = '';
        let recipeCardBlock = '';
        let faqBlock = '';
        let mainCtaBlock = '';

        const disclosureExtract = extractFirstBlock(
            content,
            /<!-- wp:paragraph -->\s*<p[^>]*>[\s\S]*?<strong>\s*Affiliate Disclosure:\s*<\/strong>[\s\S]*?<!-- \/wp:separator -->/i
        );
        content = disclosureExtract.rest;
        disclosureBlock = disclosureExtract.block;

        const cardExtract = extractFirstBlock(
            content,
            /<!-- wp:html -->\s*<div class="postgenius-recipe-card">[\s\S]*?<!-- \/wp:html -->/i
        );
        content = cardExtract.rest;
        recipeCardBlock = cardExtract.block;

        const faqExtract = extractFirstBlock(
            content,
            /<!-- wp:html -->\s*<div class="postgenius-faq-section">[\s\S]*?<!-- \/wp:html -->/i
        );
        content = faqExtract.rest;
        faqBlock = faqExtract.block;

        const ctaExtract = extractFirstBlock(
            content,
            /<!-- wp:html -->\s*<div\b[^>]*class="[^"]*(?:product-verdict-box|cta-container)[^"]*"[^>]*>[\s\S]*?<!-- \/wp:html -->/i
        );
        content = ctaExtract.rest;
        mainCtaBlock = ctaExtract.block;

        if (isRecipe) {
            // For food/recipe blueprints, the main CTA becomes the "Product Spotlight" section.
            content = reorderRecipeSections(content, disclosureBlock, recipeCardBlock, faqBlock, mainCtaBlock);
        } else if (isAmazonMultiAsinNiche) {
            content = reorderProductSections(content, disclosureBlock, faqBlock, mainCtaBlock, affiliateTag);
        } else {
            // Non-review blueprints (Recipe / Guide / URL Replicator):
            // Keep native structure and strip any accidental Amazon comparison/review artifacts.
            content = pruneAmazonReviewArtifactsForNonReviewBlueprint(content);
            if (disclosureBlock) content = `${disclosureBlock}\n\n${content}`.trim();
        }
    } catch {
        // Never block generation due to ordering logic.
    }

    // Re-run section image replacement after section reordering.
    // Important: reordering can inject new [CONTENT_SECTION_IMAGE_X] placeholders.
    content = replaceContentSectionImagePlaceholders(content);

    // 12. Safety cleanup: strip unresolved template placeholders that leaked from model output
    // Keep only known runtime placeholders (if any are intentionally preserved in preview flows).
    const isAllowedPlaceholder = (token: string): boolean => {
        const normalized = token.replace(/\s+/g, '');
        return /^\[(?:AFFILIATE_DISCLOSURE_BLOCK|MAIN_CTA_BUTTON|RECIPE_CARD_CONTENT|AUTHOR_NAME|STEP_IMAGE_\d+|CONTENT_SECTION_IMAGE_\d+|PRODUCT_IMAGE_URL_\d+|PRODUCT_AFFILIATE_LINK_\d+)\]$/i.test(normalized);
    };

    content = content.replace(/\[[^[\]\r\n]{1,80}\]/g, (token) => {
        return isAllowedPlaceholder(token) ? token : '';
    });

    // Remove empty wrappers left after placeholder cleanup
    content = content
        .replace(/<p>\s*<\/p>/gi, '')
        .replace(/<div>\s*<\/div>/gi, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();

    // 13. Auto-heal legacy placeholder product images inside generated product cards/spotlight
    // If an older article still contains placehold.co URLs, replace them with the best available
    // current product image source.
    content = content.replace(
        /<img\b(?=[^>]*\bdata-product-id="(\d+)")[^>]*>/gi,
        (match, idStr) => {
            const productId = parseInt(idStr, 10);
            const product = productData?.find(p => p.id === productId);
            if (!product) return match;

            const replacement = resolveProductBoxImageUrl(product, productImageUrls, '600x600');
            if (!replacement || isPlaceholderProductImageUrl(replacement) || /placehold\.co/i.test(replacement)) return match;

            const srcMatch = match.match(/\bsrc="([^"]*)"/i);
            const source = String(srcMatch?.[1] || '');
            const normalizedSource = upgradeLegacyAsinHostedImageUrl(source) || source;
            if (normalizedSource === replacement) return match;

            if (srcMatch) {
                return match.replace(/\bsrc="[^"]*"/i, `src="${replacement}"`);
            }

            return match.replace('<img', `<img src="${replacement}"`);
        }
    );

    // 14. Never show raw URLs in article body text.
    content = normalizeVisibleLinks(content);

    // 15. Hard policy: remove any explicit links to postgeniuspro.com from generated article content.
    content = stripPlatformDomainLinks(content);

    return buildStyledArticleHtml(content, styleConfig);
};



