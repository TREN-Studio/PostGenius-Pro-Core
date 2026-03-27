
import type { AmazonConfig, AmazonProduct, AmazonProductDetails } from '../types';
import { collectDominantFamilyTokens, titlesBelongToSameProductFamily } from './productFamilyService';

const getProxyEndpoint = (targetUrl: string): string => {
    const isLocal = typeof window !== 'undefined'
        && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
    const proxyBase = isLocal ? 'http://localhost:5000/api/proxy?url=' : '/api/proxy.php?url=';
    return `${proxyBase}${encodeURIComponent(targetUrl)}`;
};

const AMAZON_CACHE_KEY = 'pgp_amazon_products_cache_v3';
const AMAZON_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

const getAssociateTag = (config: AmazonConfig): string => {
    const tag = (config.associateTag || '').trim();
    return tag || 'yourtag-20';
};

const buildAffiliateUrl = (asin: string, config: AmazonConfig): string => {
    return `https://www.amazon.com/dp/${asin}?tag=${encodeURIComponent(getAssociateTag(config))}`;
};

const readAmazonCache = (allowStale = false): Record<string, { savedAt: number; payload: AmazonProductDetails }> => {
    if (typeof window === 'undefined') {
        return {};
    }

    try {
        const raw = localStorage.getItem(AMAZON_CACHE_KEY);
        if (!raw) {
            return {};
        }

        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') {
            return {};
        }

        const now = Date.now();
        return Object.fromEntries(
            Object.entries(parsed).filter(([, value]: any) => {
                if (!value || typeof value !== 'object') {
                    return false;
                }
                if (allowStale) {
                    return true;
                }
                return now - Number(value.savedAt || 0) <= AMAZON_CACHE_TTL_MS;
            })
        );
    } catch {
        return {};
    }
};

const getCachedAmazonProduct = (asin: string, allowStale = false): AmazonProductDetails | null => {
    const cache = readAmazonCache(allowStale);
    const cached = cache[asin];
    if (!cached?.payload?.title) {
        return null;
    }

    return {
        ...cached.payload,
        source: 'cache',
        warning: allowStale ? 'Using cached Amazon data because live retrieval failed.' : undefined,
    };
};

const saveAmazonProductToCache = (asin: string, payload: AmazonProductDetails): void => {
    if (typeof window === 'undefined') {
        return;
    }

    try {
        const existing = readAmazonCache(true);
        existing[asin] = {
            savedAt: Date.now(),
            payload: {
                title: payload.title,
                description: payload.description,
                features: payload.features || [],
                price: payload.price,
                images: payload.images || [],
                url: payload.url,
                source: payload.source,
            },
        };
        localStorage.setItem(AMAZON_CACHE_KEY, JSON.stringify(existing));
    } catch {
        // Ignore cache write failures.
    }
};

const cleanAmazonTitle = (title: string): string => {
    let cleaned = String(title || '').trim();
    cleaned = cleaned.replace(/^Amazon\.com:\s*/i, '');
    cleaned = cleaned.replace(/^Amazon\.com\s*-\s*/i, '');
    cleaned = cleaned.replace(/^URL\s*Source:\s*/i, '');
    cleaned = cleaned.replace(/\s+-\s+Amazon.*$/i, '');
    cleaned = cleaned.replace(/:\s*(Home\s*&\s*Kitchen|Electronics|Kitchen\s*&\s*Dining|Tools\s*&\s*Home\s*Improvement|Sports\s*&\s*Outdoors|Health\s*&\s*Household|Office\s*Products|Industrial\s*&\s*Scientific)\s*$/i, '');
    return cleaned.trim();
};

const normalizeAmazonProductKeyword = (value: string): string =>
    String(value || '')
        .replace(/\bhttps?:\/\/\S+/gi, ' ')
        .replace(/[^\p{L}\p{N}\s&/+.'-]+/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim();

export type AmazonProductIdentityOptions = {
    blueprintType?: string | null;
    articleTitle?: string;
};

const isAmazonProductUrl = (value: string | undefined): boolean => {
    const raw = String(value || '').trim();
    if (!raw) return false;

    try {
        const parsed = new URL(raw);
        if (!/(^|\.)amazon\./i.test(parsed.hostname)) return false;
        return !!extractASINFromUrl(parsed.toString());
    } catch {
        return false;
    }
};

const extractStrictAsinCandidate = (value: string | undefined): string => {
    const normalized = String(value || '').trim().toUpperCase();
    if (!normalized) return '';
    const matches = Array.from(normalized.matchAll(/\b((?:B[0-9A-Z]{9}|\d{10}))\b/g));
    const candidate = matches
        .map(match => match[1])
        .find(item => /\d/.test(item));
    return candidate || '';
};

const normalizeAmazonIdentityText = (value: string | undefined): string =>
    String(value || '')
        .replace(/\bhttps?:\/\/\S+/gi, ' ')
        .replace(/[^\p{L}\p{N}\s&/+.'-]+/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim();

export const extractProductAsinFromProduct = (product: AmazonProduct): string => {
    const fromUrl = extractASINFromUrl(String(product.url || '').trim());
    if (fromUrl) return fromUrl.toUpperCase();

    const fromSpecs = (product.specs || [])
        .filter(spec => /asin/i.test(String(spec.key || '')))
        .map(spec => extractASINFromUrl(String(spec.value || '').trim()) || extractStrictAsinCandidate(String(spec.value || '').trim()) || '')
        .find(Boolean);
    if (fromSpecs) return String(fromSpecs).toUpperCase();

    return extractStrictAsinCandidate(String(product.productName || ''));
};

export const hasVerifiableAmazonIdentity = (product: AmazonProduct): boolean =>
    Boolean(extractProductAsinFromProduct(product) || isAmazonProductUrl(product.url));

const hasSearchableAmazonKeywordIdentity = (
    product: AmazonProduct,
    options?: AmazonProductIdentityOptions
): boolean => {
    const rawProductName = String(product.productName || '').trim();
    if (!rawProductName || /^https?:\/\//i.test(rawProductName)) return false;
    if (/^(product|item)\s*\d+$/i.test(rawProductName)) return false;

    const normalizedName = normalizeAmazonIdentityText(rawProductName);
    if (!normalizedName || !isMeaningfulAmazonProductKeyword(normalizedName)) {
        return false;
    }

    const normalizedArticleTitle = normalizeAmazonIdentityText(options?.articleTitle || '');
    if (
        normalizedArticleTitle &&
        (normalizedName === normalizedArticleTitle
            || normalizedArticleTitle.includes(normalizedName)
            || normalizedName.includes(normalizedArticleTitle))
    ) {
        return false;
    }

    return true;
};

export const canUseAmazonKeywordSearch = (
    product: AmazonProduct,
    options?: AmazonProductIdentityOptions
): boolean => {
    return hasSearchableAmazonKeywordIdentity(product, options);
};

export const buildAmazonProductSearchQueries = (
    product: AmazonProduct,
    options?: AmazonProductIdentityOptions
): string[] => {
    const rawProductName = String(product.productName || '').trim();
    const extractedAsin = extractProductAsinFromProduct(product) || '';
    const candidates = [extractedAsin];
    if (!canUseAmazonKeywordSearch(product, options)) {
        return Array.from(new Set(candidates.filter(Boolean)));
    }

    const simplifiedTitle = normalizeAmazonIdentityText(rawProductName)
        .split(' ')
        .slice(0, 10)
        .join(' ');

    candidates.push(
        rawProductName,
        rawProductName.replace(/[.â€¦]+/g, ' ').replace(/\s+/g, ' ').trim(),
        simplifiedTitle,
    );

    return Array.from(
        new Set(
            candidates
                .map(value => normalizeAmazonIdentityText(String(value || '').trim()))
                .filter(Boolean)
                .filter(value => value.length >= 3)
                .filter(value => extractedAsin || isMeaningfulAmazonProductKeyword(value))
        )
    );
};

export const isMeaningfulAmazonProductKeyword = (keyword: string): boolean => {
    const raw = String(keyword || '').trim();
    if (!raw) return false;
    if (/^https?:\/\//i.test(raw)) return false;
    if (isStrictAsin(raw)) return true;

    const normalized = normalizeAmazonProductKeyword(raw);
    if (!normalized || normalized.length < 4) return false;
    if (normalized.split(' ').length > 16) return false;

    return !/\b(recipe|recipes|guide|guides|comparison|comparisons|buying guide|review|reviews|how to|tutorial|faq|conclusion|introduction|top picks?|best of|trending now|versus|vs\.?)\b/i.test(normalized);
};

const extractJinaFeatures = (body: string): string[] => {
    const lines = body.split(/\r?\n/);
    let capturing = false;
    const features: string[] = [];

    for (const line of lines) {
        const trimmed = line.trim();

        if (/^About this item$/i.test(trimmed)) {
            capturing = true;
            continue;
        }

        if (!capturing) {
            continue;
        }

        if (!trimmed || /^(Customers who viewed|Videos for similar products|Product information|Important information|Customer reviews|Product Description|Product Summary|Options Available)/i.test(trimmed)) {
            if (features.length > 0) {
                break;
            }
            continue;
        }

        const bulletMatch = trimmed.match(/^\*\s+(.*)$/);
        if (!bulletMatch) {
            if (features.length > 0) {
                break;
            }
            continue;
        }

        let feature = bulletMatch[1].replace(/\[[^\]]+\]\([^)]+\)/g, '');
        feature = feature.replace(/\s+/g, ' ').trim();
        feature = feature.replace(/^[•\s]+/, '').trim();

        if (feature && !/see more product details/i.test(feature)) {
            features.push(feature);
        }
    }

    return features.slice(0, 6);
};

const extractJinaPrice = (body: string): string => {
    const explicit = body.match(/Price[^\n]*\$\s*([0-9][0-9,]*(?:\.[0-9]{2})?)/i);
    if (explicit?.[1]) {
        return `$${explicit[1].trim()}`;
    }

    const generic = body.match(/\$\s*([0-9][0-9,]*(?:\.[0-9]{2})?)/);
    return generic?.[1] ? `$${generic[1].trim()}` : '';
};

const extractJinaImage = (body: string): string => {
    const matches = [...body.matchAll(/https:\/\/m\.media-amazon\.com\/images\/I\/[^)\s]+/gi)].map(match => match[0].trim());
    const primary = matches.find(url => url.includes('_AC_'));
    return primary || matches[0] || '';
};

const dedupeStrings = (items: string[]): string[] => items.filter((item, index) => item && items.indexOf(item) === index);

const isStrictAsin = (value: string | undefined): boolean => {
    const normalized = String(value || '').trim().toUpperCase();
    if (!normalized) return false;
    if (!/^(?:B[0-9A-Z]{9}|\d{10})$/.test(normalized)) return false;
    return /\d/.test(normalized);
};

const normalizeAmazonSearchImageUrl = (url: string): string => {
    const normalized = String(url || '').trim().replace(/\\u002F/g, '/').replace(/\\\//g, '/');
    if (!normalized) return '';
    return normalized.replace(/\._[^.]+_\.(jpg|jpeg|png|webp)$/i, '._AC_SL1500_.$1');
};

const isRejectedAmazonImageCandidate = (url: string): boolean => {
    const normalized = String(url || '').trim().toLowerCase();
    if (!normalized) return true;
    return (
        normalized.includes('images-na.ssl-images-amazon.com/images/p/')
        || normalized.includes('fls-na.amazon.com/1/batch/')
        || normalized.includes('/images/g/01/gno/sprites/')
        || normalized.includes('/nav-sprite')
        || normalized.includes('play-icon')
        || normalized.includes('spinner')
        || normalized.includes('transparent')
        || normalized.includes('placeholder')
    );
};

const decodeAmazonHtmlValue = (value: string): string =>
    String(value || '')
        .replace(/&quot;/gi, '"')
        .replace(/&#34;/gi, '"')
        .replace(/&amp;/gi, '&')
        .replace(/\\u002F/gi, '/')
        .replace(/\\\//g, '/');

const extractAmazonImageDimensionHint = (url: string): number => {
    const normalized = String(url || '').trim();
    if (!normalized) return 0;
    if (isRejectedAmazonImageCandidate(normalized)) return 0;
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

    return normalized.includes('media-amazon.com') ? 480 : 0;
};

const isUsableAmazonSearchImageUrl = (url: string, minimumSize = 220): boolean => {
    if (isRejectedAmazonImageCandidate(url)) return false;
    return extractAmazonImageDimensionHint(url) >= minimumSize;
};

const extractDynamicImageUrls = (rawValue: string): string[] => {
    const decoded = decodeAmazonHtmlValue(rawValue);
    if (!decoded) return [];

    const candidates = Array.from(
        decoded.matchAll(/https:\/\/m\.media-amazon\.com\/images\/I\/[^"'\\\s,}]+/gi)
    )
        .map(match => normalizeAmazonSearchImageUrl(match[0]))
        .filter(Boolean)
        .filter(url => isUsableAmazonSearchImageUrl(url));

    return dedupeStrings(candidates).sort(
        (a, b) => extractAmazonImageDimensionHint(b) - extractAmazonImageDimensionHint(a)
    );
};

const extractColorImageCandidates = (html: string): string[] => {
    const candidates: string[] = [];
    const colorBlockMatches = Array.from(html.matchAll(/"colorImages":\{.*?\}(?=,"|<\/script>|$)/gis));

    for (const blockMatch of colorBlockMatches) {
        const block = decodeAmazonHtmlValue(blockMatch[0]);
        candidates.push(
            ...Array.from(block.matchAll(/"(?:hiRes|large|mainUrl)":"([^"]+)"/gi)).map(match => match[1])
        );
    }

    return dedupeStrings(
        candidates
            .map(normalizeAmazonSearchImageUrl)
            .filter(Boolean)
            .filter(url => isUsableAmazonSearchImageUrl(url))
    ).sort((a, b) => extractAmazonImageDimensionHint(b) - extractAmazonImageDimensionHint(a));
};

const extractProxyImageCandidates = (html: string, doc: Document): string[] => {
    const prioritized: string[] = [];
    const genericFallback: string[] = [];

    const ogImage = doc.querySelector('meta[property="og:image"]')?.getAttribute('content')?.trim();
    if (ogImage) {
        prioritized.push(ogImage);
    }

    prioritized.push(
        ...Array.from(doc.querySelectorAll<HTMLElement>('#landingImage, #imgBlkFront, #imgTagWrapperId img, img[data-old-hires], img[data-a-dynamic-image]'))
            .flatMap(node => {
                const fromDynamic = extractDynamicImageUrls(node.getAttribute('data-a-dynamic-image') || '');
                const oldHires = node.getAttribute('data-old-hires')?.trim() || '';
                return [
                    ...fromDynamic,
                    oldHires,
                ];
            }),
        ...Array.from(html.matchAll(/data-old-hires="([^"]+)"/gi)).map(match => match[1]),
        ...Array.from(html.matchAll(/"hiRes":"([^"]+)"/gi)).map(match => match[1]),
        ...extractColorImageCandidates(html)
    );

    genericFallback.push(
        ...Array.from(html.matchAll(/https:\/\/m\.media-amazon\.com\/images\/I\/[^"'\s)]+?\.(?:jpe?g|png|webp)/gi)).map(match => match[0])
    );

    return dedupeStrings(
        [...prioritized, ...genericFallback]
            .map(normalizeAmazonSearchImageUrl)
            .filter(Boolean)
            .filter(url => !isRejectedAmazonImageCandidate(url))
            .filter(url => !/sprite|nav-|loading-|pixel|gif$|logo|badge|icon|coupon|video|play-icon|swatch/i.test(url))
            .filter(url => isUsableAmazonSearchImageUrl(url))
    );
};

const extractSearchResultImageCandidates = (node: Element | null): string[] => {
    if (!node) return [];
    const candidates = new Set<string>();
    const attrs = ['src', 'data-src', 'data-image-src', 'data-old-hires'];

    attrs.forEach((attr) => {
        const value = (node as HTMLElement).getAttribute?.(attr)?.trim() || '';
        if (value) {
            candidates.add(value);
        }
    });

    const srcset = (node as HTMLElement).getAttribute?.('srcset')?.trim() || '';
    if (srcset) {
        srcset
            .split(',')
            .map(part => part.trim().split(/\s+/)[0])
            .filter(Boolean)
            .forEach(url => candidates.add(url));
    }

    return Array.from(candidates)
        .map(normalizeAmazonSearchImageUrl)
        .filter(Boolean)
        .filter(url => isUsableAmazonSearchImageUrl(url));
};

const validateAmazonImageCandidate = async (url: string): Promise<boolean> => {
    const candidate = normalizeAmazonSearchImageUrl(url);
    if (!candidate || !isUsableAmazonSearchImageUrl(candidate)) {
        return false;
    }

    if (/placeholder|spinner|transparent|thumb/i.test(candidate) || isRejectedAmazonImageCandidate(candidate)) {
        return false;
    }

    try {
        const response = await fetch(getProxyEndpoint(candidate), {
            headers: {
                'Accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache',
            },
        });

        if (!response.ok) {
            return false;
        }

        const contentType = String(response.headers.get('content-type') || '').toLowerCase();
        if (!contentType.startsWith('image/') || contentType.includes('gif') || contentType.includes('svg')) {
            return false;
        }

        const blob = await response.blob();
        const blobType = String(blob.type || '').toLowerCase();
        if (blob.size < 4096 || blobType.includes('gif') || blobType.includes('svg')) {
            return false;
        }

        try {
            if (typeof createImageBitmap === 'function') {
                const bitmap = await createImageBitmap(blob);
                const isLargeEnough = bitmap.width >= 220 && bitmap.height >= 220;
                if (typeof bitmap.close === 'function') {
                    bitmap.close();
                }
                return isLargeEnough;
            }
        } catch {
            // Fall through to Image-based validation.
        }

        if (typeof window !== 'undefined' && typeof Image !== 'undefined') {
            const dimensions = await new Promise<{ width: number; height: number }>((resolve) => {
                const objectUrl = URL.createObjectURL(blob);
                const image = new Image();

                image.onload = () => {
                    resolve({
                        width: image.naturalWidth || image.width || 0,
                        height: image.naturalHeight || image.height || 0,
                    });
                    URL.revokeObjectURL(objectUrl);
                };

                image.onerror = () => {
                    resolve({ width: 0, height: 0 });
                    URL.revokeObjectURL(objectUrl);
                };

                image.src = objectUrl;
            });

            return dimensions.width >= 220 && dimensions.height >= 220;
        }

        return true;
    } catch {
        return false;
    }
};

const pickVerifiedAmazonImageCandidate = async (urls: string[]): Promise<string> => {
    const ranked = dedupeStrings(urls)
        .map(normalizeAmazonSearchImageUrl)
        .filter(Boolean)
        .filter(url => isUsableAmazonSearchImageUrl(url))
        .sort((a, b) => extractAmazonImageDimensionHint(b) - extractAmazonImageDimensionHint(a))
        .slice(0, 12);

    for (const candidate of ranked) {
        if (await validateAmazonImageCandidate(candidate)) {
            return candidate;
        }
    }

    return '';
};

const pickLargestAmazonImageCandidate = (urls: string[]): string => {
    const ranked = dedupeStrings(urls)
        .map(normalizeAmazonSearchImageUrl)
        .filter(Boolean)
        .filter(url => isUsableAmazonSearchImageUrl(url))
        .sort((a, b) => extractAmazonImageDimensionHint(b) - extractAmazonImageDimensionHint(a));

    return ranked[0] || '';
};

const decodeExternalSearchHref = (href: string): string => {
    const raw = String(href || '').trim();
    if (!raw) return '';

    try {
        const absolute = raw.startsWith('http')
            ? new URL(raw)
            : new URL(raw, 'https://html.duckduckgo.com');
        const redirectKeys = ['uddg', 'url', 'u', 'r'];

        for (const key of redirectKeys) {
            const redirected = absolute.searchParams.get(key);
            if (redirected) {
                try {
                    return decodeURIComponent(redirected);
                } catch {
                    return redirected;
                }
            }
        }

        return absolute.toString();
    } catch {
        return raw;
    }
};

const fetchAmazonSearchDocuments = async (query: string): Promise<Document[]> => {
    const targets = [
        `https://www.amazon.com/s?k=${encodeURIComponent(query)}`,
        `https://www.amazon.com/gp/aw/s?k=${encodeURIComponent(query)}`,
    ];

    const documents: Document[] = [];
    const errors: string[] = [];

    for (const target of targets) {
        let lastError = '';

        for (let attempt = 1; attempt <= 3; attempt += 1) {
            try {
                const response = await fetch(getProxyEndpoint(target), {
                    headers: {
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                        'Accept-Language': 'en-US,en;q=0.9',
                        'Cache-Control': 'no-cache',
                        'Pragma': 'no-cache',
                    },
                });

                if (!response.ok) {
                    lastError = `${target} failed with status ${response.status}`;
                    if (response.status >= 500 && attempt < 3) {
                        await new Promise(resolve => setTimeout(resolve, 350 * attempt));
                        continue;
                    }
                    break;
                }

                const html = await response.text();
                if (!html || html.trim().length < 800) {
                    lastError = `${target} returned empty or too-short HTML`;
                    if (attempt < 3) {
                        await new Promise(resolve => setTimeout(resolve, 350 * attempt));
                        continue;
                    }
                    break;
                }

                if (/Type the characters you see below|captchacharacters|Robot Check/i.test(html)) {
                    lastError = `${target} returned CAPTCHA`;
                    if (attempt < 3) {
                        await new Promise(resolve => setTimeout(resolve, 350 * attempt));
                        continue;
                    }
                    break;
                }

                const doc = new DOMParser().parseFromString(html, 'text/html');
                const results = Array.from(doc.querySelectorAll<HTMLElement>('[data-component-type="s-search-result"][data-asin]'));
                if (results.length === 0) {
                    lastError = `${target} returned no Amazon search results`;
                    if (attempt < 3) {
                        await new Promise(resolve => setTimeout(resolve, 350 * attempt));
                        continue;
                    }
                    break;
                }

                documents.push(doc);
                lastError = '';
                break;
            } catch (error: any) {
                lastError = `${target} failed: ${error?.message || String(error)}`;
                if (attempt < 3) {
                    await new Promise(resolve => setTimeout(resolve, 350 * attempt));
                    continue;
                }
            }
        }

        if (lastError) {
            errors.push(lastError);
        }
    }

    if (documents.length === 0) {
        throw new Error(errors.join(' | ') || 'Amazon search returned no usable HTML.');
    }

    return documents;
};

const extractAmazonProductUrlsFromExternalSearchHtml = (html: string): string[] => {
    const urls = new Set<string>();
    const doc = new DOMParser().parseFromString(html, 'text/html');

    const maybeAddUrl = (value: string | null | undefined) => {
        const decoded = decodeExternalSearchHref(String(value || '').trim());
        if (!decoded) return;
        if (!/(^|\.)amazon\./i.test(decoded)) return;
        if (!extractASINFromUrl(decoded)) return;
        urls.add(decoded);
    };

    doc.querySelectorAll<HTMLAnchorElement>('a[href]').forEach(anchor => {
        maybeAddUrl(anchor.getAttribute('href'));
        maybeAddUrl(anchor.getAttribute('data-href'));
    });

    const decodedHtml = decodeAmazonHtmlValue(html);
    Array.from(decodedHtml.matchAll(/https?:\/\/(?:www\.)?amazon\.[^"'\\\s<>]+/gi)).forEach(match => {
        maybeAddUrl(match[0]);
    });
    Array.from(decodedHtml.matchAll(/(?:uddg|url|u)=([^"'&\s<>]+)/gi)).forEach(match => {
        maybeAddUrl(match[1]);
    });

    return Array.from(urls);
};

const fetchExternalAmazonSearchCandidates = async (
    query: string
): Promise<Array<{ asin: string; url: string }>> => {
    const searchTargets = [
        `https://www.bing.com/search?q=${encodeURIComponent(`site:amazon.com/dp ${query}`)}`,
        `https://html.duckduckgo.com/html/?q=${encodeURIComponent(`site:amazon.com/dp ${query}`)}`,
    ];

    const candidates = new Map<string, string>();
    const errors: string[] = [];

    for (const searchUrl of searchTargets) {
        try {
            const response = await fetch(getProxyEndpoint(searchUrl), {
                headers: {
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.9',
                    'Cache-Control': 'no-cache',
                    'Pragma': 'no-cache',
                },
            });

            if (!response.ok) {
                errors.push(`external search ${searchUrl} failed with status ${response.status}`);
                continue;
            }

            const html = await response.text();
            if (!html || html.trim().length < 800) {
                errors.push(`external search ${searchUrl} returned empty or too-short HTML`);
                continue;
            }

            const urls = extractAmazonProductUrlsFromExternalSearchHtml(html);
            for (const url of urls) {
                const asin = extractASINFromUrl(url);
                if (!asin || candidates.has(asin)) continue;
                candidates.set(asin, url);
                if (candidates.size >= 8) {
                    break;
                }
            }

            if (candidates.size > 0) {
                break;
            }
        } catch (error: any) {
            errors.push(`external search ${searchUrl} failed: ${error?.message || String(error)}`);
        }
    }

    if (candidates.size === 0) {
        throw new Error(errors.join(' | ') || 'External Amazon search returned no candidate product URLs.');
    }

    return Array.from(candidates.entries()).map(([asin, url]) => ({ asin, url }));
};

export const searchAmazonProductByKeyword = async (
    keyword: string,
    config: AmazonConfig,
    options?: AmazonProductIdentityOptions
): Promise<AmazonProductDetails> => {
    const query = normalizeAmazonProductKeyword(String(keyword || '').trim());
    const queryIsStrictAsin = isStrictAsin(query);
    if (!query) {
        throw new Error('Missing keyword for Amazon search.');
    }
    if (!queryIsStrictAsin && !isMeaningfulAmazonProductKeyword(query)) {
        throw new Error('Keyword query does not look like a verifiable Amazon product identity.');
    }

    const normalizedArticleTitle = normalizeAmazonIdentityText(options?.articleTitle || '');
    if (
        !queryIsStrictAsin &&
        normalizedArticleTitle &&
        (query === normalizedArticleTitle
            || normalizedArticleTitle.includes(query)
            || query.includes(normalizedArticleTitle))
    ) {
        throw new Error('Keyword query matches the article title instead of a specific Amazon product.');
    }
    const dominantTokens = collectDominantFamilyTokens([query]);
    const errors: string[] = [];

    try {
        const docs = await fetchAmazonSearchDocuments(query);

        for (const doc of docs) {
            const results = Array.from(doc.querySelectorAll<HTMLElement>('[data-component-type="s-search-result"][data-asin]'));

            for (const result of results) {
                const asin = String(result.getAttribute('data-asin') || '').trim().toUpperCase();
                if (!asin || asin.length !== 10) continue;

                const anchor = result.querySelector<HTMLAnchorElement>('h2 a, a.a-link-normal.s-no-outline');
                const title = cleanAmazonTitle(
                    anchor?.textContent?.replace(/\s+/g, ' ').trim()
                    || result.querySelector<HTMLElement>('h2 span')?.textContent?.replace(/\s+/g, ' ').trim()
                    || ''
                );
                if (!title) continue;
                if (!titlesBelongToSameProductFamily(title, query, { articleTitle: query, dominantTokens })) {
                    continue;
                }

                const detailUrl = anchor?.getAttribute('href')
                    ? new URL(anchor.getAttribute('href')!, 'https://www.amazon.com').toString()
                    : buildAffiliateUrl(asin, config);

                try {
                    const resolved = await getProductDetailsFromProxyScrape(asin, config);
                    const verifiedImage = (resolved.images || [])[0] || '';
                    if (
                        verifiedImage
                        && titlesBelongToSameProductFamily(resolved.title || title, query, { articleTitle: query, dominantTokens })
                    ) {
                        return {
                            title: resolved.title || title,
                            description: resolved.description || title,
                            features: resolved.features || [],
                            price: resolved.price,
                            images: [verifiedImage],
                            url: resolved.url || detailUrl,
                            source: resolved.source,
                        };
                    }
                } catch {
                    // Fall through to raw search-result image extraction if detail-page scrape fails.
                }

                const imageCandidates = extractSearchResultImageCandidates(result.querySelector<HTMLImageElement>('img.s-image'));
                const imageUrl = await pickVerifiedAmazonImageCandidate(imageCandidates);
                if (!imageUrl) continue;

                return {
                    title,
                    description: title,
                    features: [],
                    images: [imageUrl],
                    url: buildAffiliateUrl(asin, config) || detailUrl,
                    source: 'proxy',
                };
            }
        }
    } catch (error: any) {
        errors.push(error?.message || String(error));
    }

    try {
        const externalCandidates = await fetchExternalAmazonSearchCandidates(query);
        for (const candidate of externalCandidates) {
            try {
                const resolved = await getProductDetailsFromProxyScrape(candidate.asin, config);
                const resolvedTitle = cleanAmazonTitle(resolved.title || '');
                const verifiedImage = (resolved.images || []).find(isUsableAmazonSearchImageUrl) || '';
                if (!resolvedTitle || !verifiedImage) {
                    continue;
                }
                if (!titlesBelongToSameProductFamily(resolvedTitle, query, { articleTitle: query, dominantTokens })) {
                    continue;
                }

                return {
                    title: resolvedTitle,
                    description: resolved.description || resolvedTitle,
                    features: resolved.features || [],
                    price: resolved.price,
                    images: [verifiedImage, ...(resolved.images || []).filter(url => url !== verifiedImage)],
                    url: resolved.url || candidate.url,
                    source: resolved.source,
                };
            } catch (error: any) {
                errors.push(`external candidate ${candidate.asin} failed: ${error?.message || String(error)}`);
            }
        }
    } catch (error: any) {
        errors.push(error?.message || String(error));
    }

    throw new Error(errors.join(' | ') || 'Amazon keyword search did not return a usable product image.');
};

export const getProductDetailsFromJina = async (
    asin: string,
    config: AmazonConfig
): Promise<AmazonProductDetails> => {
    const response = await fetch(`https://r.jina.ai/http://https://www.amazon.com/gp/aw/d/${encodeURIComponent(asin)}`, {
        headers: {
            'Accept': 'text/plain',
        },
    });

    if (!response.ok) {
        throw new Error(`Jina Reader failed with status ${response.status}`);
    }

    const body = await response.text();
    if (!body || !/^Title:\s*/mi.test(body)) {
        throw new Error('Jina Reader returned no product title.');
    }

    const titleMatch = body.match(/^Title:\s*(.+)$/mi);
    const title = cleanAmazonTitle(titleMatch?.[1] || '');
    if (!title || /^amazon\.com$/i.test(title)) {
        throw new Error('Jina Reader returned a blocked or generic Amazon title.');
    }

    const features = extractJinaFeatures(body);
    const price = extractJinaPrice(body);
    const imageUrl = extractJinaImage(body);
    const description = features.slice(0, 3).join(' ').trim() || title;

    return {
        title,
        description,
        features,
        price: price || undefined,
        images: imageUrl ? [imageUrl] : undefined,
        url: buildAffiliateUrl(asin, config),
        source: 'jina',
    };
};

export const getProductDetailsFromProxyScrape = async (
    asin: string,
    config: AmazonConfig
): Promise<AmazonProductDetails> => {
    const attemptUrls = [
        `https://www.amazon.com/gp/aw/d/${asin}`,
        `https://www.amazon.com/dp/${asin}`,
    ];

    let bestPartial: AmazonProductDetails | null = null;
    const errors: string[] = [];

    for (const attemptUrl of attemptUrls) {
        try {
            const response = await fetch(getProxyEndpoint(attemptUrl), {
                headers: {
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.9',
                    'Cache-Control': 'no-cache',
                    'Pragma': 'no-cache',
                },
            });

            if (!response.ok) {
                throw new Error(`Proxy scrape failed with status ${response.status}`);
            }

            const html = await response.text();
            if (!html || html.trim().length < 800) {
                throw new Error('Proxy scrape returned empty or too-short HTML.');
            }

            if (/Type the characters you see below|captchacharacters|Robot Check/i.test(html)) {
                throw new Error('Amazon CAPTCHA detected in proxy scrape.');
            }

            const doc = new DOMParser().parseFromString(html, 'text/html');
            const title = cleanAmazonTitle(
                doc.querySelector('#productTitle')?.textContent?.trim()
                || doc.querySelector('meta[property="og:title"]')?.getAttribute('content')?.trim()
                || html.match(/"title":"([^"]+)"/i)?.[1]?.replace(/\\u0026/g, '&')
                || doc.title
            );

            if (!title) {
                throw new Error('Proxy scrape did not return a valid product title.');
            }

            const featureNodes = Array.from(doc.querySelectorAll('#feature-bullets li span.a-list-item, #productFactsDesktopExpander li, #feature-bullets span'));
            const features = featureNodes
                .map(node => node.textContent?.replace(/\s+/g, ' ').trim() || '')
                .filter(line => line && !/make sure this fits/i.test(line))
                .slice(0, 6);

            const price = (
                doc.querySelector('#corePriceDisplay_desktop_feature_div .a-offscreen')?.textContent
                || doc.querySelector('#corePrice_feature_div .a-offscreen')?.textContent
                || doc.querySelector('#priceblock_ourprice')?.textContent
                || doc.querySelector('#priceblock_dealprice')?.textContent
                || html.match(/"priceToPay":\{"priceAmount":([0-9.]+)/i)?.[1]
                || ''
            ).trim();

            const imageCandidates = extractProxyImageCandidates(html, doc);
            const verifiedImage = await pickVerifiedAmazonImageCandidate(imageCandidates);
            const description = features.slice(0, 3).join(' ').trim() || title;

            const details: AmazonProductDetails = {
                title,
                description,
                features,
                price: price ? (price.startsWith('$') ? price : `$${price}`) : undefined,
                images: verifiedImage ? [verifiedImage, ...imageCandidates.filter(url => url !== verifiedImage)] : undefined,
                url: buildAffiliateUrl(asin, config),
                source: 'proxy',
            };

            if (verifiedImage) {
                return details;
            }

            bestPartial = bestPartial || details;
        } catch (error: any) {
            errors.push(`${attemptUrl}: ${error?.message || String(error)}`);
        }
    }

    if (bestPartial) {
        return bestPartial;
    }

    throw new Error(errors.join(' | ') || 'Proxy scrape failed.');
};

export const getProductDetailsFromProxyScrapeUrl = async (
    productUrl: string,
    config: AmazonConfig
): Promise<AmazonProductDetails> => {
    const normalizedUrl = String(productUrl || '').trim();
    if (!normalizedUrl || !isAmazonProductUrl(normalizedUrl)) {
        throw new Error('Proxy scrape URL must be a valid Amazon product URL.');
    }

    const derivedAsin = extractASINFromUrl(normalizedUrl)?.toUpperCase() || '';
    const attemptUrls = Array.from(
        new Set(
            [
                normalizedUrl,
                derivedAsin ? `https://www.amazon.com/gp/aw/d/${derivedAsin}` : '',
                derivedAsin ? `https://www.amazon.com/dp/${derivedAsin}` : '',
            ].filter(Boolean)
        )
    );

    let bestPartial: AmazonProductDetails | null = null;
    const errors: string[] = [];

    for (const attemptUrl of attemptUrls) {
        try {
            const response = await fetch(getProxyEndpoint(attemptUrl), {
                headers: {
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.9',
                    'Cache-Control': 'no-cache',
                    'Pragma': 'no-cache',
                },
            });

            if (!response.ok) {
                throw new Error(`Proxy scrape failed with status ${response.status}`);
            }

            const html = await response.text();
            if (!html || html.trim().length < 800) {
                throw new Error('Proxy scrape returned empty or too-short HTML.');
            }

            if (/Type the characters you see below|captchacharacters|Robot Check/i.test(html)) {
                throw new Error('Amazon CAPTCHA detected in proxy scrape.');
            }

            const doc = new DOMParser().parseFromString(html, 'text/html');
            const title = cleanAmazonTitle(
                doc.querySelector('#productTitle')?.textContent?.trim()
                || doc.querySelector('meta[property="og:title"]')?.getAttribute('content')?.trim()
                || html.match(/"title":"([^"]+)"/i)?.[1]?.replace(/\\u0026/g, '&')
                || doc.title
            );

            if (!title) {
                throw new Error('Proxy scrape did not return a valid product title.');
            }

            const featureNodes = Array.from(doc.querySelectorAll('#feature-bullets li span.a-list-item, #productFactsDesktopExpander li, #feature-bullets span'));
            const features = featureNodes
                .map(node => node.textContent?.replace(/\s+/g, ' ').trim() || '')
                .filter(line => line && !/make sure this fits/i.test(line))
                .slice(0, 6);

            const price = (
                doc.querySelector('#corePriceDisplay_desktop_feature_div .a-offscreen')?.textContent
                || doc.querySelector('#corePrice_feature_div .a-offscreen')?.textContent
                || doc.querySelector('#priceblock_ourprice')?.textContent
                || doc.querySelector('#priceblock_dealprice')?.textContent
                || html.match(/"priceToPay":\{"priceAmount":([0-9.]+)/i)?.[1]
                || ''
            ).trim();

            const imageCandidates = extractProxyImageCandidates(html, doc);
            const verifiedImage = await pickVerifiedAmazonImageCandidate(imageCandidates);
            const description = features.slice(0, 3).join(' ').trim() || title;
            const resolvedAsin = extractASINFromUrl(attemptUrl)?.toUpperCase() || derivedAsin;
            const canonicalUrl = resolvedAsin ? buildAffiliateUrl(resolvedAsin, config) : normalizedUrl;

            const details: AmazonProductDetails = {
                title,
                description,
                features,
                price: price ? (price.startsWith('$') ? price : `$${price}`) : undefined,
                images: verifiedImage ? [verifiedImage, ...imageCandidates.filter(url => url !== verifiedImage)] : undefined,
                url: canonicalUrl,
                source: 'proxy',
            };

            if (verifiedImage) {
                return details;
            }

            bestPartial = bestPartial || details;
        } catch (error: any) {
            errors.push(`${attemptUrl}: ${error?.message || String(error)}`);
        }
    }

    if (bestPartial) {
        return bestPartial;
    }

    throw new Error(errors.join(' | ') || 'Proxy scrape URL failed.');
};


/**
 * Extracts the ASIN (Amazon Standard Identification Number) from an Amazon URL
 * @param url The Amazon product URL
 * @returns The ASIN string or null if not found
 */
export const extractASINFromUrl = (url: string): string | null => {
    try {
        const urlObj = new URL(url);
        const pathSegments = urlObj.pathname.split('/');

        // 1. Check specific known patterns first
        // /dp/B0...
        const dpIndex = pathSegments.indexOf('dp');
        if (dpIndex !== -1 && pathSegments[dpIndex + 1]) return pathSegments[dpIndex + 1].substring(0, 10);

        // /gp/product/B0...
        const gpProdIndex = pathSegments.indexOf('product');
        if (pathSegments.includes('gp') && gpProdIndex !== -1 && pathSegments[gpProdIndex + 1]) return pathSegments[gpProdIndex + 1].substring(0, 10);

        // /gp/aw/d/B0...
        const gpAwDIndex = pathSegments.indexOf('d');
        if (pathSegments.includes('gp') && pathSegments.includes('aw') && gpAwDIndex !== -1 && pathSegments[gpAwDIndex + 1]) return pathSegments[gpAwDIndex + 1].substring(0, 10);

        // /gp/offer-listing/B0...
        const offerIndex = pathSegments.indexOf('offer-listing');
        if (offerIndex !== -1 && pathSegments[offerIndex + 1]) return pathSegments[offerIndex + 1].substring(0, 10);

        // 2. Query parameter check (often used in affiliate links or search results)
        const asinParam = urlObj.searchParams.get('ASIN') || urlObj.searchParams.get('asin');
        if (asinParam && isStrictAsin(asinParam)) return asinParam.trim().toUpperCase();

        // 3. Broad Regex Search in URL (Last resort)
        const broadMatch = url.match(/(?:^|[\/?&])((?:B[0-9A-Z]{9}|\d{10}))(?:$|[\/?&])/i);
        if (broadMatch?.[1] && isStrictAsin(broadMatch[1])) return broadMatch[1].toUpperCase();

        return null;
    } catch (e) {
        // Fallback for invalid URLs or non-URL strings
        const broadMatch = url.match(/(?:^|[\/?&])((?:B[0-9A-Z]{9}|\d{10}))(?:$|[\/?&])/i);
        return broadMatch?.[1] && isStrictAsin(broadMatch[1]) ? broadMatch[1].toUpperCase() : null;
    }
};

/**
 * Fetches product details from Amazon PAAPI using ASIN
 * @param asin The Amazon Standard Identification Number
 * @param config Amazon PAAPI configuration
 * @returns Product details including title, description, features
 */
export const getProductDetailsFromPAAPI = async (
    asin: string,
    config: AmazonConfig
): Promise<AmazonProductDetails> => {
    if (!config.accessKey || !config.secretKey || !config.associateTag) {
        throw new Error('[Amazon PAAPI] Missing credentials');
    }

    // Clean credentials (remove accidental spaces)
    const accessKey = config.accessKey.trim();
    const secretKey = config.secretKey.trim();
    const associateTag = config.associateTag.trim();

    const host = REGION_HOST_MAP[config.region];
    if (!host) {
        throw new Error(`[Amazon PAAPI] Unsupported region: ${config.region}`);
    }

    const service = 'ProductAdvertisingAPI';
    const path = '/paapi5/getitems';
    const amzTarget = 'com.amazon.paapi5.v1.ProductAdvertisingAPIv1.GetItems';

    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
    const dateStamp = amzDate.substring(0, 8);

    const payload = {
        ItemIds: [asin],
        PartnerTag: associateTag,
        PartnerType: 'Associates',
        Resources: [
            'ItemInfo.Title',
            'ItemInfo.Features',
            'ItemInfo.ProductInfo',
            'ItemInfo.ByLineInfo',
            'Offers.Listings.Price',
            'Images.Primary.Large'
        ],
        Marketplace: `www.amazon.${config.region === 'us-east-1' ? 'com' : 'co.uk'}`
    };
    const payloadString = JSON.stringify(payload);

    // Browsers often force charset=UTF-8 (uppercase). We must match what is sent.
    // We also exclude 'content-encoding' and 'content-type' from signature to be safe against browser modification,
    // trusting that AWS allows this if not in SignedHeaders.
    const canonicalHeaders = `host:${host}\nx-amz-date:${amzDate}\nx-amz-target:${amzTarget}\n`;
    const signedHeaders = 'host;x-amz-date;x-amz-target';
    const hashedPayload = bufferToHex(await sha256(payloadString));

    const canonicalRequest = `POST\n${path}\n\n${canonicalHeaders}\n${signedHeaders}\n${hashedPayload}`;
    const hashedCanonicalRequest = bufferToHex(await sha256(canonicalRequest));

    const credentialScope = `${dateStamp}/${config.region}/${service}/aws4_request`;
    const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${credentialScope}\n${hashedCanonicalRequest}`;

    const signingKey = await getSignatureKey(secretKey, dateStamp, config.region, service);
    const signatureBytes = await crypto.subtle.sign({ name: 'HMAC', hash: 'SHA-256' }, signingKey, new TextEncoder().encode(stringToSign));
    const signature = bufferToHex(signatureBytes);

    const authorizationHeader = `AWS4-HMAC-SHA256 Credential=${accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    const headers = {
        'Content-Type': 'application/json; charset=utf-8',
        'X-Amz-Target': amzTarget,
        'X-Amz-Date': amzDate,
        'Authorization': authorizationHeader,
        'Content-Encoding': 'amz-1.0',
    };

    try {
        const endpoint = `https://${host}${path}`;
        const proxyEndpoint = getProxyEndpoint(endpoint);

        const response = await fetch(proxyEndpoint, {
            method: 'POST',
            headers,
            body: payloadString
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(`PAAPI GetItems failed with status ${response.status}: ${JSON.stringify(errorData?.Errors)}`);
        }

        const data = await response.json();

        if (data.Errors && data.Errors.length > 0) {
            throw new Error(`PAAPI GetItems returned errors: ${JSON.stringify(data.Errors)}`);
        }

        const item = data.ItemsResult?.Items?.[0];
        if (!item) {
            throw new Error(`Product with ASIN ${asin} not found`);
        }

        // Extract product details
        const title = item.ItemInfo?.Title?.DisplayValue || 'Unknown Product';
        const features = item.ItemInfo?.Features?.DisplayValues || [];
        const brand = item.ItemInfo?.ByLineInfo?.Brand?.DisplayValue;
        const manufacturer = item.ItemInfo?.ByLineInfo?.Manufacturer?.DisplayValue;
        const price = item.Offers?.Listings?.[0]?.Price?.DisplayAmount;
        const image = item.Images?.Primary?.Large?.URL;

        // Build description from available parts
        let description = '';
        if (brand) description += `Brand: ${brand}. `;
        if (manufacturer && manufacturer !== brand) description += `Manufacturer: ${manufacturer}. `;
        if (features.length > 0) description += features.slice(0, 3).join('. ') + '.';

        return {
            title,
            description: description || 'Product description not available.',
            features,
            price,
            images: image ? [image] : undefined,
            url: buildAffiliateUrl(asin, config),
            source: 'paapi',
        };

    } catch (error: any) {
        console.error('[Amazon PAAPI] GetItems failed:', error);
        throw new Error(`Failed to fetch product details from Amazon: ${error.message}`);
    }
};

export const getAmazonProductData = async (
    asin: string,
    config: AmazonConfig
): Promise<AmazonProductDetails> => {
    const normalizedAsin = asin.trim().toUpperCase();
    const freshCache = getCachedAmazonProduct(normalizedAsin, false);
    if (freshCache && (freshCache.images || []).some(image => isUsableAmazonSearchImageUrl(image))) {
        return freshCache;
    }

    const staleCache = getCachedAmazonProduct(normalizedAsin, true);
    const errors: string[] = [];
    let bestPartial: AmazonProductDetails | null = null;

    const sources: Array<() => Promise<AmazonProductDetails>> = [];

    if (config.accessKey?.trim() && config.secretKey?.trim() && config.associateTag?.trim()) {
        sources.push(() => getProductDetailsFromPAAPI(normalizedAsin, config));
    }

    sources.push(() => getProductDetailsFromJina(normalizedAsin, config));
    sources.push(() => getProductDetailsFromProxyScrape(normalizedAsin, config));

    for (const fetcher of sources) {
        try {
            const details = await fetcher();
            if (!details.title || details.title.trim().length < 5) {
                throw new Error('Amazon product source returned an invalid title.');
            }

            const candidateImages = dedupeStrings((details.images || []).map(normalizeAmazonSearchImageUrl).filter(Boolean));
            const verifiedPrimary = candidateImages.length > 0
                ? await pickVerifiedAmazonImageCandidate(candidateImages)
                : '';
            const fallbackPrimary = candidateImages.length > 0
                ? pickLargestAmazonImageCandidate(candidateImages)
                : '';

            const normalizedDetails: AmazonProductDetails = {
                ...details,
                images: verifiedPrimary
                    ? [verifiedPrimary, ...candidateImages.filter(url => url !== verifiedPrimary)]
                    : fallbackPrimary
                        ? [fallbackPrimary, ...candidateImages.filter(url => url !== fallbackPrimary)]
                        : undefined,
            };

            if (verifiedPrimary) {
                saveAmazonProductToCache(normalizedAsin, normalizedDetails);
                return normalizedDetails;
            }

            if (!bestPartial) {
                bestPartial = normalizedDetails;
            }
        } catch (error: any) {
            errors.push(error?.message || String(error));
        }
    }

    if (staleCache && (staleCache.images || []).some(image => isUsableAmazonSearchImageUrl(image))) {
        return staleCache;
    }

    if (bestPartial) {
        return bestPartial;
    }

    throw new Error(errors.join(' | ') || `Failed to resolve Amazon product data for ${normalizedAsin}`);
};

// Helper for SHA256 hashing
async function sha256(str: string): Promise<ArrayBuffer> {
    const textEncoder = new TextEncoder();
    const data = textEncoder.encode(str);
    return crypto.subtle.digest('SHA-256', data);
}

// Helper to convert ArrayBuffer to hex string
function bufferToHex(buffer: ArrayBuffer): string {
    return Array.from(new Uint8Array(buffer))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
}

// Helper for HMAC-SHA256 signing
async function getSignatureKey(key: string, dateStamp: string, regionName: string, serviceName: string): Promise<CryptoKey> {
    const textEncoder = new TextEncoder();
    const kDate = await crypto.subtle.sign(
        { name: 'HMAC', hash: 'SHA-256' },
        await crypto.subtle.importKey('raw', textEncoder.encode('AWS4' + key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']),
        textEncoder.encode(dateStamp)
    );
    const kRegion = await crypto.subtle.sign(
        { name: 'HMAC', hash: 'SHA-256' },
        await crypto.subtle.importKey('raw', kDate, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']),
        textEncoder.encode(regionName)
    );
    const kService = await crypto.subtle.sign(
        { name: 'HMAC', hash: 'SHA-256' },
        await crypto.subtle.importKey('raw', kRegion, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']),
        textEncoder.encode(serviceName)
    );
    const kSigning = await crypto.subtle.sign(
        { name: 'HMAC', hash: 'SHA-256' },
        await crypto.subtle.importKey('raw', kService, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']),
        textEncoder.encode('aws4_request')
    );
    return crypto.subtle.importKey('raw', kSigning, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
}

const REGION_HOST_MAP: { [key: string]: string } = {
    'us-east-1': 'webservices.amazon.com',
    'eu-west-1': 'webservices.amazon.co.uk',
};

export const searchProductsAndGetImages = async (
    products: AmazonProduct[],
    config: AmazonConfig,
    options?: AmazonProductIdentityOptions
): Promise<Record<number, { primary: string; variants: string[]; url?: string }>> => {
    if (!config.accessKey || !config.secretKey || !config.associateTag || products.length === 0) {
        console.warn('[Amazon PAAPI] Missing credentials or products. Skipping image search.');
        return {};
    }

    // Clean credentials
    const accessKey = config.accessKey.trim();
    const secretKey = config.secretKey.trim();
    const associateTag = config.associateTag.trim();

    const host = REGION_HOST_MAP[config.region];
    if (!host) {
        throw new Error(`[Amazon PAAPI] Unsupported region: ${config.region}`);
    }

    const service = 'ProductAdvertisingAPI';
    const path = '/paapi5/searchitems';
    const amzTarget = 'com.amazon.paapi5.v1.ProductAdvertisingAPIv1.SearchItems';

    const imageUrls: Record<number, { primary: string; variants: string[]; url?: string }> = {};

    // Process products sequentially to avoid rate limits and ensure accuracy
    for (const product of products) {
        const searchQueries = buildAmazonProductSearchQueries(product, options);
        const primaryQuery = searchQueries.find(Boolean) || '';
        if (!primaryQuery) {
            continue;
        }

        try {
            const now = new Date();
            const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
            const dateStamp = amzDate.substring(0, 8);

            const payload = {
                Keywords: primaryQuery,
                PartnerTag: associateTag,
                PartnerType: 'Associates',
                Resources: ['Images.Primary.Large', 'Images.Variants.Large', 'ItemInfo.Title'],
                SearchIndex: 'All',
                ItemCount: 1,
            };
            const payloadString = JSON.stringify(payload);

            const canonicalHeaders = `host:${host}\nx-amz-date:${amzDate}\nx-amz-target:${amzTarget}\n`;
            const signedHeaders = 'host;x-amz-date;x-amz-target';
            const hashedPayload = bufferToHex(await sha256(payloadString));
            const canonicalRequest = `POST\n${path}\n\n${canonicalHeaders}\n${signedHeaders}\n${hashedPayload}`;
            const hashedCanonicalRequest = bufferToHex(await sha256(canonicalRequest));

            const credentialScope = `${dateStamp}/${config.region}/${service}/aws4_request`;
            const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${credentialScope}\n${hashedCanonicalRequest}`;

            const signingKey = await getSignatureKey(secretKey, dateStamp, config.region, service);
            const signatureBytes = await crypto.subtle.sign({ name: 'HMAC', hash: 'SHA-256' }, signingKey, new TextEncoder().encode(stringToSign));
            const signature = bufferToHex(signatureBytes);

            const authorizationHeader = `AWS4-HMAC-SHA256 Credential=${accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

            const headers = {
                'Content-Type': 'application/json; charset=utf-8',
                'X-Amz-Target': amzTarget,
                'X-Amz-Date': amzDate,
                'Authorization': authorizationHeader,
                'Content-Encoding': 'amz-1.0',
            };

            const endpoint = `https://${host}${path}`;
            const proxyEndpoint = getProxyEndpoint(endpoint);

            const response = await fetch(proxyEndpoint, {
                method: 'POST',
                headers,
                body: payloadString
            });

            if (!response.ok) {
                console.warn(`[Amazon PAAPI] Search failed for ${primaryQuery}: ${response.status}`);
                try {
                    const fallback = await searchAmazonProductByKeyword(primaryQuery, config, options);
                    const fallbackPrimary = (fallback.images || []).find(isUsableAmazonProductImageUrl) || '';
                    if (fallbackPrimary) {
                        imageUrls[product.id] = {
                            primary: fallbackPrimary,
                            variants: (fallback.images || []).filter(isUsableAmazonProductImageUrl).filter(url => url !== fallbackPrimary),
                            url: fallback.url,
                        };
                    }
                } catch (fallbackError) {
                    console.warn(`[Amazon Search Fallback] Failed for ${primaryQuery}:`, fallbackError);
                }
                continue;
            }

            const data = await response.json();
            const item = data.SearchResult?.Items?.[0];

            if (item && item.Images?.Primary?.Large?.URL) {
                const candidateTitle = cleanAmazonTitle(String(item.ItemInfo?.Title?.DisplayValue || ''));
                if (
                    candidateTitle
                    && !titlesBelongToSameProductFamily(candidateTitle, primaryQuery, {
                        articleTitle: options?.articleTitle || primaryQuery,
                        dominantTokens: collectDominantFamilyTokens([primaryQuery]),
                    })
                ) {
                    continue;
                }
                const rawPrimary = normalizeAmazonSearchImageUrl(item.Images.Primary.Large.URL);
                const rawVariants = item.Images.Variants?.map((v: any) => normalizeAmazonSearchImageUrl(v.Large?.URL)).filter(Boolean) || [];
                const primary = await pickVerifiedAmazonImageCandidate([rawPrimary, ...rawVariants]);
                const variants = dedupeStrings(rawVariants).filter(isUsableAmazonSearchImageUrl);
                if (!primary) {
                    continue;
                }
                imageUrls[product.id] = {
                    primary,
                    variants: variants,
                    url: item.DetailPageURL
                };
            } else {
                try {
                    const fallback = await searchAmazonProductByKeyword(primaryQuery, config, options);
                    const fallbackPrimary = (fallback.images || []).find(isUsableAmazonProductImageUrl) || '';
                    if (fallbackPrimary) {
                        imageUrls[product.id] = {
                            primary: fallbackPrimary,
                            variants: (fallback.images || []).filter(isUsableAmazonProductImageUrl).filter(url => url !== fallbackPrimary),
                            url: fallback.url,
                        };
                    }
                } catch (fallbackError) {
                    console.warn(`[Amazon Search Fallback] Failed for ${primaryQuery}:`, fallbackError);
                }
            }

            // Small delay to be nice to the API
            await new Promise(resolve => setTimeout(resolve, 2000));

        } catch (err) {
            console.error(`[Amazon PAAPI] Error searching for ${primaryQuery}:`, err);
        }
    }

    return imageUrls;
};

/**
 * Verifies Amazon PAAPI credentials by making a lightweight SearchItems request.
 * This is used to "fail fast" if keys are invalid (401/403) before attempting real work.
 * @param config Amazon PAAPI configuration
 * @returns Object indicating validity and optional error message
 */
export const verifyPaapiCredentials = async (config: AmazonConfig): Promise<{ valid: boolean; error?: string }> => {
    if (!config.accessKey || !config.secretKey || !config.associateTag) {
        return { valid: false, error: 'Missing credentials' };
    }

    try {
        const accessKey = config.accessKey.trim();
        const secretKey = config.secretKey.trim();
        const associateTag = config.associateTag.trim();
        const host = REGION_HOST_MAP[config.region];

        if (!host) return { valid: false, error: 'Invalid region' };

        const service = 'ProductAdvertisingAPI';
        const path = '/paapi5/searchitems';
        const amzTarget = 'com.amazon.paapi5.v1.ProductAdvertisingAPIv1.SearchItems';
        const now = new Date();
        const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
        const dateStamp = amzDate.substring(0, 8);

        // Minimal payload for verification
        const payload = {
            Keywords: 'kindle', // Generic term that always exists
            PartnerTag: associateTag,
            PartnerType: 'Associates',
            Resources: ['ItemInfo.Title'], // Minimal resource
            ItemCount: 1
        };
        const payloadString = JSON.stringify(payload);

        const canonicalHeaders = `host:${host}\nx-amz-date:${amzDate}\nx-amz-target:${amzTarget}\n`;
        const signedHeaders = 'host;x-amz-date;x-amz-target';
        const hashedPayload = bufferToHex(await sha256(payloadString));
        const canonicalRequest = `POST\n${path}\n\n${canonicalHeaders}\n${signedHeaders}\n${hashedPayload}`;
        const hashedCanonicalRequest = bufferToHex(await sha256(canonicalRequest));
        const credentialScope = `${dateStamp}/${config.region}/${service}/aws4_request`;
        const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${credentialScope}\n${hashedCanonicalRequest}`;
        const signingKey = await getSignatureKey(secretKey, dateStamp, config.region, service);
        const signatureBytes = await crypto.subtle.sign({ name: 'HMAC', hash: 'SHA-256' }, signingKey, new TextEncoder().encode(stringToSign));
        const signature = bufferToHex(signatureBytes);
        const authorizationHeader = `AWS4-HMAC-SHA256 Credential=${accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

        const headers = {
            'Content-Type': 'application/json; charset=utf-8',
            'X-Amz-Target': amzTarget,
            'X-Amz-Date': amzDate,
            'Authorization': authorizationHeader,
            'Content-Encoding': 'amz-1.0',
        };

        const endpoint = `https://${host}${path}`;
        const proxyEndpoint = getProxyEndpoint(endpoint);

        const response = await fetch(proxyEndpoint, {
            method: 'POST',
            headers,
            body: payloadString
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            const errorMsg = errorData?.Errors?.[0]?.Message || response.statusText;
            return { valid: false, error: `Amazon API Error (${response.status}): ${errorMsg}` };
        }

        const data = await response.json();
        if (data.Errors && data.Errors.length > 0) {
            return { valid: false, error: data.Errors[0].Message };
        }

        return { valid: true };

    } catch (error: any) {
        return { valid: false, error: error.message };
    }
};
