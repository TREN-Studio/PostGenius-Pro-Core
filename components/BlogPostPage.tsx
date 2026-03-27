import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { AmazonProduct, Article, BlogPostData, Session, UserProfile } from '../types';
import { getArticleBySlug, getUserProfileById } from '../services/articleService';
import {
    getSavedReviews,
    getTrackedProducts,
    toggleSavedReview,
    toggleTrackedProduct,
} from '../services/memberCollectionService';
import { normalizeAmazonMasterArticleHtml, reshapeAmazonMasterArticleForPortal } from '../services/reviewLayoutService';
import { isAmazonHostedImage, isPlatformHostedImage, resolvePreferredProductImageUrl, sanitizeProductCardTitlesInHtml } from '../services/styleService';
import LoadingSpinner from './LoadingSpinner';
import Meta from './Meta';
import NotFoundPage from './NotFoundPage';

interface BlogPostPageProps {
    session: Session | null;
    onEdit?: (article: Article) => void;
}

interface TrendingProduct {
    title: string;
    href: string;
}

const MID_AD = `<aside class="pgp-ad-slot" data-ad-slot="mid-article"><span class="pgp-ad-label">Advertisement</span><div class="pgp-ad-copy">Partner feature</div></aside>`;

const stripHtml = (html: string): string => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const estimateReadTime = (html: string): number => Math.max(1, Math.round(stripHtml(html).split(/\s+/).filter(Boolean).length / 220));

const normalizeUrl = (value: string): string => {
    const raw = String(value || '').trim();
    if (!raw) return '';
    try {
        const u = new URL(raw);
        u.hash = '';
        return u.toString();
    } catch {
        return raw;
    }
};

const isAmazonHref = (href: string): boolean => {
    const lower = String(href || '').toLowerCase();
    return lower.includes('amazon.') || lower.includes('amzn.to');
};

const injectMidArticleAd = (html: string): string => {
    if (!html || html.includes('data-ad-slot="mid-article"')) return html;
    if (typeof window === 'undefined' || typeof DOMParser === 'undefined') return html.replace(/(<\/p>)/i, `$1${MID_AD}`);
    try {
        const doc = new DOMParser().parseFromString(`<div id="root">${html}</div>`, 'text/html');
        const root = doc.getElementById('root');
        if (!root) return html;
        const blocks = Array.from(root.querySelectorAll('p, h2, h3, ul, ol, table'));
        if (blocks.length === 0) return `${html}${MID_AD}`;
        const anchor = blocks[Math.min(4, blocks.length - 1)];
        const holder = doc.createElement('div');
        holder.innerHTML = MID_AD;
        if (anchor.parentNode && holder.firstElementChild) {
            anchor.parentNode.insertBefore(holder.firstElementChild, anchor.nextSibling);
            return root.innerHTML;
        }
        return `${html}${MID_AD}`;
    } catch {
        return html.replace(/(<\/p>)/i, `$1${MID_AD}`);
    }
};

const injectProductSaveButtons = (html: string): string => {
    if (!html || typeof window === 'undefined' || typeof DOMParser === 'undefined') return html;
    try {
        const doc = new DOMParser().parseFromString(`<div id="root">${html}</div>`, 'text/html');
        const root = doc.getElementById('root');
        if (!root) return html;

        const links = Array.from(root.querySelectorAll<HTMLAnchorElement>('a[href]'));
        links.forEach(link => {
            const href = String(link.getAttribute('href') || '').trim();
            if (!/^https?:\/\//i.test(href)) return;
            if (!isAmazonHref(href)) return;
            if (link.nextElementSibling?.classList.contains('pgp-track-product-btn')) return;

            const cardTitle = link.closest('.amazon-compare-card, .amazon-review-card, .product-verdict-box')?.querySelector('h2,h3,h4,strong')?.textContent;
            const title = String(cardTitle || link.textContent || 'Amazon Product').replace(/\s+/g, ' ').trim() || 'Amazon Product';

            const btn = doc.createElement('button');
            btn.type = 'button';
            btn.className = 'pgp-track-product-btn';
            btn.setAttribute('data-product-url', href);
            btn.setAttribute('data-product-title', title);
            btn.textContent = 'Save to Reading List';
            link.insertAdjacentElement('afterend', btn);
        });

        return root.innerHTML;
    } catch {
        return html;
    }
};

const buildFallbackTrending = (title: string): TrendingProduct[] => {
    const base = (title || 'best products')
        .split(' ')
        .filter(w => w.length > 2)
        .slice(0, 5)
        .join(' ');
    return [1, 2, 3, 4, 5].map((n) => ({
        title: `Trending Pick ${n}`,
        href: `https://www.amazon.com/s?k=${encodeURIComponent(`${base} best seller ${n}`)}`,
    }));
};

const extractTrendingProducts = (html: string, title: string): TrendingProduct[] => {
    if (typeof window === 'undefined' || typeof DOMParser === 'undefined') return buildFallbackTrending(title);
    try {
        const doc = new DOMParser().parseFromString(`<div id="root">${html}</div>`, 'text/html');
        const root = doc.getElementById('root');
        if (!root) return buildFallbackTrending(title);

        const links = Array.from(root.querySelectorAll<HTMLAnchorElement>('a[href]'));
        const seen = new Set<string>();
        const picks: TrendingProduct[] = [];

        for (const link of links) {
            const href = String(link.getAttribute('href') || '').trim();
            if (!/^https?:\/\//i.test(href) || !isAmazonHref(href) || seen.has(href)) continue;
            const cardTitle = link.closest('.amazon-compare-card, .amazon-review-card, .product-verdict-box')?.querySelector('h2,h3,h4,strong')?.textContent;
            const text = (cardTitle || link.textContent || `Amazon Pick ${picks.length + 1}`).replace(/\s+/g, ' ').trim();
            picks.push({ title: text || `Amazon Pick ${picks.length + 1}`, href });
            seen.add(href);
            if (picks.length >= 6) break;
        }

        if (picks.length >= 3) return picks;
        return [...picks, ...buildFallbackTrending(title)].slice(0, 6);
    } catch {
        return buildFallbackTrending(title);
    }
};

const stripStyleBlocks = (html: string): string =>
    String(html || '').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '').trim();

const extractFirstImageSrc = (html: string): string | null => {
    const match = String(html || '').match(/<img[^>]+src=["']([^"']+)["']/i);
    return match?.[1] || null;
};

const extractFirstParagraphText = (html: string): string => {
    const match = stripStyleBlocks(html).match(/<p\b[^>]*>([\s\S]*?)<\/p>/i);
    return stripHtml(match?.[1] || stripStyleBlocks(html));
};

const buildAmazonMasterImageFingerprint = (url: string): string => {
    const normalized = String(url || '').trim();
    if (!normalized) return '';
    try {
        const parsed = new URL(normalized);
        const fileName = parsed.pathname.split('/').pop() || parsed.pathname;
        return fileName
            .replace(/\.[a-z0-9]+$/i, '')
            .replace(/\._[^.]+$/i, '')
            .toLowerCase();
    } catch {
        return normalized.replace(/[?#].*$/, '').toLowerCase();
    }
};

const replaceCompareCardImageSources = (
    html: string,
    productImageUrls: Record<string, string>,
    productData: AmazonProduct[] = []
): string => {
    if (!html) return html;
    const resolveReplacement = (idStr: string): string => {
        const product = productData.find(entry => String(entry.id) === idStr);
        if (product) {
            const preferred = resolvePreferredProductImageUrl(product, productImageUrls, '320x320');
            if (preferred && (isAmazonHostedImage(preferred) || isPlatformHostedImage(preferred))) return preferred;
        }

        const mapped = String(productImageUrls[idStr] || '').trim();
        if (isAmazonHostedImage(mapped) || isPlatformHostedImage(mapped)) return mapped;

        return '';
    };

    let next = html.replace(
        /<img\b(?=[^>]*\bdata-product-id="(\d+)")[^>]*>/gi,
        (match, idStr) => {
            const replacement = resolveReplacement(idStr);
            if (!replacement) return match;

            if (/\bsrc="[^"]*"/i.test(match)) {
                return match.replace(/\bsrc="[^"]*"/i, `src="${replacement}"`);
            }
            return match.replace('<img', `<img src="${replacement}"`);
        }
    );

    next = next.replace(
        /<img\b(?=[^>]*\bsrc="[^"]*")[^>]*\bdata-product-id="(\d+)"[^>]*>/gi,
        (match, idStr) => {
            const replacement = resolveReplacement(idStr);
            if (!replacement) return match;
            return match.replace(/\bsrc="[^"]*"/i, `src="${replacement}"`);
        }
    );

    return next;
};

const replaceSectionImageSources = (html: string, stepImageUrls: Record<string, string>): string => {
    if (!html) return html;

    let next = html.replace(
        /<figure[^>]*content-section-image-block[^>]*>[\s\S]*?<img([^>]*)alt="Content section\s*(\d+)"([^>]*)>[\s\S]*?<\/figure>/gi,
        (match, before, sectionId, after) => {
            const replacement = String(stepImageUrls[`section_${sectionId}`] || '').trim();
            if (!replacement) return match;
            return match.replace(/\bsrc="[^"]*"/i, `src="${replacement}"`);
        }
    );

    next = next.replace(
        /\[\s*CONTENT_SECTION_IMAGE_(\d+)\s*\]/gi,
        (_match, sectionId) => {
            const replacement = String(stepImageUrls[`section_${sectionId}`] || '').trim();
            if (!replacement) return '';
            return `<figure class="wp-block-image size-large content-section-image-block"><img src="${replacement}" alt="Content section ${sectionId}" class="content-section-image"/></figure>`;
        }
    );

    return next;
};

const hasAmazonMasterMarkup = (html: string): boolean => {
    const lower = String(html || '').toLowerCase();
    return (
        lower.includes('amazon-comparison-grid')
        || lower.includes('amazon-review-card')
        || lower.includes('amazon product comparison')
        || lower.includes('data-product-id=')
    );
};

const collectAmazonMasterProductImages = (
    productData: AmazonProduct[],
    productImageUrls: Record<string, string>
): string[] => {
    const urls = productData
        .map(product => resolvePreferredProductImageUrl(product, productImageUrls, '1200x1200'))
        .filter(url => isAmazonHostedImage(url) || isPlatformHostedImage(url));

    return Array.from(new Set(urls));
};

const collectOrderedAmazonMasterSectionImages = (
    productData: AmazonProduct[],
    productImageUrls: Record<string, string>,
    productImageVariants: Record<string, string[]>
): string[] => {
    const perProductImages = productData
        .slice()
        .sort((left, right) => (Number(left.id) || 0) - (Number(right.id) || 0))
        .map(product => {
            const key = String(product.id);
            const primary = resolvePreferredProductImageUrl(product, productImageUrls, '1200x1200');
            const variants = (productImageVariants[key] || [])
                .filter(url => isAmazonHostedImage(url) || isPlatformHostedImage(url))
                .filter(url => url !== primary);
            const seenFingerprints = new Set<string>();
            const candidates = [
                ...(primary && (isAmazonHostedImage(primary) || isPlatformHostedImage(primary)) ? [primary] : []),
                ...variants,
            ];
            return candidates.filter(candidate => {
                if (!candidate) return false;
                const fingerprint = buildAmazonMasterImageFingerprint(candidate);
                if (!fingerprint || seenFingerprints.has(fingerprint)) return false;
                seenFingerprints.add(fingerprint);
                return true;
            });
        });

    const maxDepth = perProductImages.reduce((highest, images) => Math.max(highest, images.length), 0);
    const orderedUrls: string[] = [];
    const seenFingerprints = new Set<string>();

    for (let depth = 0; depth < maxDepth; depth += 1) {
        perProductImages.forEach(images => {
            const candidate = images[depth];
            const fingerprint = buildAmazonMasterImageFingerprint(candidate);
            if (candidate && fingerprint && !seenFingerprints.has(fingerprint)) {
                seenFingerprints.add(fingerprint);
                orderedUrls.push(candidate);
            }
        });
    }

    return orderedUrls;
};

const resolveAmazonMasterSectionImage = (
    sectionId: string,
    productImages: string[],
    stepImageUrls: Record<string, string>
): string => {
    const numeric = Math.max(1, parseInt(String(sectionId || '1'), 10) || 1);
    return productImages[numeric - 1] || String(stepImageUrls[`section_${sectionId}`] || '').trim() || '';
};

const replaceAmazonMasterSectionImagesWithProductImages = (
    html: string,
    productData: AmazonProduct[],
    productImageUrls: Record<string, string>,
    productImageVariants: Record<string, string[]>,
    stepImageUrls: Record<string, string>
): string => {
    if (!html) return html;

    const productImages = collectOrderedAmazonMasterSectionImages(productData, productImageUrls, productImageVariants);

    let next = html.replace(
        /<figure[^>]*content-section-image-block[^>]*>[\s\S]*?<img([^>]*)alt="Content section\s*(\d+)"([^>]*)>[\s\S]*?<\/figure>/gi,
        (match, _before, sectionId) => {
            const replacement = resolveAmazonMasterSectionImage(sectionId, productImages, stepImageUrls);
            if (!replacement) return match;
            return match.replace(/\bsrc="[^"]*"/i, `src="${replacement}"`);
        }
    );

    next = next.replace(
        /\[\s*CONTENT_SECTION_IMAGE_(\d+)\s*\]/gi,
        (_match, sectionId) => {
            const replacement = resolveAmazonMasterSectionImage(sectionId, productImages, stepImageUrls);
            if (!replacement) return '';
            return `<figure class="wp-block-image size-large content-section-image-block"><img src="${replacement}" alt="Content section ${sectionId}" class="content-section-image"/></figure>`;
        }
    );

    return next;
};

const formatPublishedDate = (value: string | null): string => {
    if (!value) return 'Recently';
    return new Date(value).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
    });
};

const resolveAuthorName = (article: Article, authorProfile: UserProfile | null): string => {
    if (article.author_role === 'admin') return 'Postgenius Pro Editorial Team';
    return article.author_name || article.author_username || authorProfile?.full_name || 'Postgenius Pro';
};

const collectLifestyleUrls = (value: unknown): string[] => {
    if (!value) return [];
    if (typeof value === 'string') {
        const trimmed = value.trim();
        return /^https?:\/\//i.test(trimmed) ? [trimmed] : [];
    }
    if (Array.isArray(value)) {
        return value.flatMap(collectLifestyleUrls);
    }
    if (typeof value === 'object') {
        const record = value as Record<string, unknown>;
        const directKeys = ['url', 'src', 'image', 'imageUrl', 'cdnUrl', 'publicUrl'];
        const nestedKeys = ['images', 'urls', 'items', 'variants', 'results'];
        return [
            ...directKeys.flatMap(key => collectLifestyleUrls(record[key])),
            ...nestedKeys.flatMap(key => collectLifestyleUrls(record[key])),
        ];
    }
    return [];
};

const buildArticleSchema = ({
    article,
    description,
    image,
    authorName,
    tags,
}: {
    article: Article;
    description: string;
    image?: string;
    authorName: string;
    tags: string[];
}): Record<string, any> => {
    const articleUrl = `https://postgeniuspro.com/blog/${article.slug}`;

    return {
        '@context': 'https://schema.org',
        '@type': 'Article',
        headline: article.seo?.metaTitle || article.title,
        description,
        image: image ? [image] : undefined,
        mainEntityOfPage: articleUrl,
        url: articleUrl,
        datePublished: article.published_at || article.created_at,
        dateModified: article.updated_at || article.published_at || article.created_at,
        articleSection: article.category || 'Magazine',
        keywords: tags,
        author: article.author_role === 'admin'
            ? {
                '@type': 'Organization',
                name: authorName,
              }
            : {
                '@type': 'Person',
                name: authorName,
              },
        publisher: {
            '@type': 'Organization',
            name: 'Postgenius Pro',
            logo: {
                '@type': 'ImageObject',
                url: 'https://postgeniuspro.com/favicon.png',
            },
        },
    };
};

const BlogPostPage: React.FC<BlogPostPageProps> = ({ session, onEdit }) => {
    const { slug } = useParams<{ slug: string }>();
    const navigate = useNavigate();
    const contentRef = useRef<HTMLDivElement>(null);

    const [article, setArticle] = useState<Article | null>(null);
    const [blogPostData, setBlogPostData] = useState<BlogPostData | null>(null);
    const [authorProfile, setAuthorProfile] = useState<UserProfile | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isSavedReview, setIsSavedReview] = useState(false);
    const [trackedUrls, setTrackedUrls] = useState<Set<string>>(new Set());
    const [notice, setNotice] = useState('');
    const [toc, setToc] = useState<{ id: string, text: string, level: number }[]>([]);

    useEffect(() => {
        if (!slug) {
            setError('Article slug is missing.');
            setIsLoading(false);
            return;
        }

        const fetchArticle = async (retries = 3) => {
            setIsLoading(true);
            setError(null);
            try {
                const data = await getArticleBySlug(slug);
                if (!data) {
                    if (retries > 0) return setTimeout(() => fetchArticle(retries - 1), 1000);
                    setArticle(null);
                    setIsLoading(false);
                    return;
                }

                setArticle(data);
                if (data.user_id) {
                    try { setAuthorProfile(await getUserProfileById(data.user_id)); } catch { setAuthorProfile(null); }
                }

                try {
                    const parsed = typeof data.content === 'string' ? JSON.parse(data.content) : data.content;
                    setBlogPostData(((parsed?.blogPostData || parsed) || null) as BlogPostData | null);
                } catch {
                    setBlogPostData(null);
                }

                setIsLoading(false);
            } catch (err: any) {
                if (retries > 0) return setTimeout(() => fetchArticle(retries - 1), 1000);
                setError(err.message || 'Failed to fetch article.');
                setIsLoading(false);
            }
        };

        fetchArticle();
    }, [slug]);

    const generatedHtml = article?.generated_html || '';
    const articleContent = useMemo(() => {
        if (!article?.content) return null;
        try {
            return typeof article.content === 'string' ? JSON.parse(article.content) : article.content;
        } catch {
            return null;
        }
    }, [article?.content]);
    const articleStepImageUrls = useMemo(() => (
        (articleContent?.stepImageUrls || {}) as Record<string, string>
    ), [articleContent]);
    const articleStoredHeroImage = useMemo(() => (
        String(articleContent?.heroImageUrl || '').trim()
    ), [articleContent]);
    const articleProductImageUrls = useMemo(() => (
        (articleContent?.productImageUrls || {}) as Record<string, string>
    ), [articleContent]);
    const articleProductImageVariants = useMemo(() => (
        (articleContent?.productImageVariants || {}) as Record<string, string[]>
    ), [articleContent]);
    const articleProductData = useMemo(() => (
        (articleContent?.productData || []) as AmazonProduct[]
    ), [articleContent]);
    const amazonMasterMarkupPresent = useMemo(() => hasAmazonMasterMarkup(generatedHtml), [generatedHtml]);
    const isAmazonMasterArticle = useMemo(() => {
        return (
            article?.blueprint_type === 'review'
            && blogPostData?.niche === 'review'
            && amazonMasterMarkupPresent
        );
    }, [article?.blueprint_type, blogPostData?.niche, amazonMasterMarkupPresent]);
    const amazonMasterPortalImages = useMemo(() => (
        collectOrderedAmazonMasterSectionImages(articleProductData, articleProductImageUrls, articleProductImageVariants)
    ), [articleProductData, articleProductImageUrls, articleProductImageVariants]);
    const hydratedGeneratedHtml = useMemo(() => {
        if (!generatedHtml) return generatedHtml;
        let next = isAmazonMasterArticle
            ? replaceAmazonMasterSectionImagesWithProductImages(generatedHtml, articleProductData, articleProductImageUrls, articleProductImageVariants, articleStepImageUrls)
            : replaceSectionImageSources(generatedHtml, articleStepImageUrls);
        next = replaceCompareCardImageSources(next, articleProductImageUrls, articleProductData);
        next = sanitizeProductCardTitlesInHtml(next, articleProductData);
        return next;
    }, [generatedHtml, isAmazonMasterArticle, articleStepImageUrls, articleProductImageUrls, articleProductImageVariants, articleProductData]);
    const articleTitle = article?.title || '';
    const readingMinutes = useMemo(() => estimateReadTime(hydratedGeneratedHtml), [hydratedGeneratedHtml]);
    const htmlWithUi = useMemo(() => {
        if (isAmazonMasterArticle) {
            return reshapeAmazonMasterArticleForPortal(normalizeAmazonMasterArticleHtml(hydratedGeneratedHtml));
        }
        return injectProductSaveButtons(injectMidArticleAd(hydratedGeneratedHtml));
    }, [hydratedGeneratedHtml, isAmazonMasterArticle]);
    const displayHtml = useMemo(() => (
        isAmazonMasterArticle ? stripStyleBlocks(htmlWithUi) : htmlWithUi
    ), [htmlWithUi, isAmazonMasterArticle]);
    const trending = useMemo(() => extractTrendingProducts(hydratedGeneratedHtml, articleTitle), [hydratedGeneratedHtml, articleTitle]);
    const articleDescription = useMemo(() => {
        const fallback = extractFirstParagraphText(hydratedGeneratedHtml).slice(0, 220);
        return article?.seo?.metaDescription || fallback;
    }, [article?.seo?.metaDescription, hydratedGeneratedHtml]);
    const publishedLabel = useMemo(() => formatPublishedDate(article?.published_at || article?.created_at || null), [article?.published_at, article?.created_at]);
    const authorName = useMemo(() => (article ? resolveAuthorName(article, authorProfile) : 'Postgenius Pro'), [article, authorProfile]);
    const articlePath = article?.slug ? `/blog/${article.slug}` : '';
    const articleHeroImage = useMemo(() => (
        isAmazonMasterArticle
            ? articleStoredHeroImage || article?.image_url || undefined
            : articleStoredHeroImage || article?.image_url || extractFirstImageSrc(displayHtml) || undefined
    ), [isAmazonMasterArticle, articleStoredHeroImage, article?.image_url, displayHtml]);
    const articleSchema = useMemo(() => (
        article ? buildArticleSchema({
            article,
            description: articleDescription,
            image: articleHeroImage,
            authorName,
            tags: article.tags || [],
        }) : null
    ), [article, articleDescription, articleHeroImage, authorName]);
    const lifestyleImages = useMemo(() => {
        const urls = [
            ...collectLifestyleUrls((article as Article & { ai_lifestyle_images?: unknown } | null)?.ai_lifestyle_images),
            ...collectLifestyleUrls((blogPostData as BlogPostData & { ai_lifestyle_images?: unknown; aiLifestyleImages?: unknown } | null)?.ai_lifestyle_images),
            ...collectLifestyleUrls((blogPostData as BlogPostData & { ai_lifestyle_images?: unknown; aiLifestyleImages?: unknown } | null)?.aiLifestyleImages),
        ];
        return Array.from(new Set(urls)).slice(0, 3);
    }, [article, blogPostData]);

    useEffect(() => {
        let active = true;
        const userId = session?.user?.id;
        if (!article || !userId) {
            setIsSavedReview(false);
            setTrackedUrls(new Set());
            return;
        }

        const loadMemberState = async () => {
            try {
                const [savedReviews, trackedProducts] = await Promise.all([
                    getSavedReviews(userId),
                    getTrackedProducts(userId),
                ]);
                if (!active) return;
                setIsSavedReview(savedReviews.some(item => item.slug === article.slug));
                setTrackedUrls(new Set(trackedProducts.map(item => normalizeUrl(item.url))));
            } catch {
                if (!active) return;
                setIsSavedReview(false);
                setTrackedUrls(new Set());
            }
        };

        loadMemberState();
        return () => {
            active = false;
        };
    }, [article?.slug, article?.id, session?.user?.id]);

    useEffect(() => {
        const contentElement = contentRef.current;
        if (!contentElement) return;

        const handleClick = (event: MouseEvent) => {
            const target = event.target as HTMLElement;

            const trackButton = target.closest('button.pgp-track-product-btn') as HTMLButtonElement | null;
            if (trackButton) {
                event.preventDefault();
                event.stopPropagation();

                const userId = session?.user?.id;
                if (!userId) {
                    navigate('/signup');
                    return;
                }

                const url = String(trackButton.dataset.productUrl || '').trim();
                const title = String(trackButton.dataset.productTitle || 'Amazon Product').trim();
                if (!url) return;

                void (async () => {
                    try {
                        const tracked = await toggleTrackedProduct({ title, url }, userId);
                        const urls = (await getTrackedProducts(userId)).map(item => normalizeUrl(item.url));
                        setTrackedUrls(new Set(urls));
                        setNotice(tracked ? 'Product saved to your collection.' : 'Product removed from your collection.');
                        setTimeout(() => setNotice(''), 2200);
                    } catch {
                        setNotice('Failed to update your collection.');
                        setTimeout(() => setNotice(''), 2200);
                    }
                })();
                return;
            }

            const anchor = target.closest('a');
            if (!anchor || !anchor.href) return;
            if (anchor.hostname === window.location.hostname && anchor.target !== '_blank' && !anchor.hasAttribute('download')) {
                event.preventDefault();
                navigate(anchor.pathname + anchor.search);
            }
        };

        contentElement.addEventListener('click', handleClick);
        return () => contentElement.removeEventListener('click', handleClick);
    }, [displayHtml, navigate, session?.user?.id]);

    useEffect(() => {
        const contentElement = contentRef.current;
        if (!contentElement) return;
        const buttons = Array.from(contentElement.querySelectorAll<HTMLButtonElement>('button.pgp-track-product-btn'));
        buttons.forEach(btn => {
            const normalized = normalizeUrl(String(btn.dataset.productUrl || ''));
            const tracked = trackedUrls.has(normalized);
            btn.textContent = tracked ? 'Saved to Reading List' : 'Save to Reading List';
            btn.classList.toggle('is-saved', tracked);
        });
    }, [displayHtml, trackedUrls]);

    useEffect(() => {
        const contentElement = contentRef.current;
        if (!contentElement) return;

        const timer = setTimeout(() => {
            const headings = Array.from(contentElement.querySelectorAll('h2, h3'));
            const newToc = headings.map((heading, i) => {
                const text = heading.textContent || '';
                if (!heading.id) {
                    heading.id = text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || `heading-${i}`;
                }
                return {
                    id: heading.id,
                    text,
                    level: heading.tagName === 'H2' ? 2 : 3
                };
            }).filter(h => h.text.trim().length > 0);
            setToc(newToc);
        }, 100);

        return () => clearTimeout(timer);
    }, [displayHtml]);

    useEffect(() => {
        const contentElement = contentRef.current;
        if (!contentElement || !isAmazonMasterArticle) return;

        const reviewImages = Array.from(contentElement.querySelectorAll<HTMLImageElement>('.amazon-editorial-image img'));
        const replacementPool = amazonMasterPortalImages.length ? amazonMasterPortalImages : lifestyleImages;
        if (replacementPool.length === 0) return;
        reviewImages.forEach((img, index) => {
            const nextSrc = replacementPool[index] || lifestyleImages[index] || '';
            if (!nextSrc) return;
            if (img.src !== nextSrc) img.src = nextSrc;
        });
    }, [displayHtml, isAmazonMasterArticle, amazonMasterPortalImages, lifestyleImages]);

    const handleToggleReview = async () => {
        const userId = session?.user?.id;
        if (!article) return;
        if (!userId) {
            navigate('/signup');
            return;
        }

        try {
            const saved = await toggleSavedReview(article, userId);
            setIsSavedReview(saved);
            setNotice(saved ? 'Review saved to your collection.' : 'Review removed from your collection.');
        } catch {
            setNotice('Failed to update your collection.');
        }
        setTimeout(() => setNotice(''), 2200);
    };

    const handleToggleTrendingProduct = async (product: TrendingProduct) => {
        const userId = session?.user?.id;
        if (!userId) {
            navigate('/signup');
            return;
        }

        try {
            const tracked = await toggleTrackedProduct({ title: product.title, url: product.href }, userId);
            const urls = (await getTrackedProducts(userId)).map(item => normalizeUrl(item.url));
            setTrackedUrls(new Set(urls));
            setNotice(tracked ? 'Product saved to your collection.' : 'Product removed from your collection.');
        } catch {
            setNotice('Failed to update your collection.');
        }
        setTimeout(() => setNotice(''), 2200);
    };

    if (isLoading) return <div className="text-center py-16"><LoadingSpinner /></div>;
    if (error) return <div className="text-red-400 p-4 bg-red-900/50 rounded-md text-center">{error}</div>;
    if (!article) return <NotFoundPage />;

    const isAuthor = session?.user?.id === article.user_id;
    const allTags = article.tags || [];
    const postUrl = typeof window !== 'undefined' ? window.location.href : `https://postgeniuspro.com/blog/${article.slug}`;
    const heroAlt = blogPostData?.heroImageMetadata?.alt || article.title;
    const authorHref = `/author/${article.user_id}`;
    return (
        <>
            <Meta
                title={article.seo?.metaTitle || article.title}
                description={articleDescription}
                path={articlePath}
                canonicalPath={articlePath}
                image={articleHeroImage}
                ogType="article"
                publishedTime={article.published_at || article.created_at}
                modifiedTime={article.updated_at || article.published_at || article.created_at}
                author={authorName}
                section={article.category || 'Magazine'}
                tags={allTags}
                schemaData={articleSchema}
                disableDefaultSchema
            />

            <article className="mag-wrap-shell animate-fade-in relative">
                <style>{`
                    @import url('https://fonts.googleapis.com/css2?family=Manrope:wght@500;700;800&family=Source+Serif+4:wght@400;600;700&display=swap');
                    .mag-wrap-shell{max-width:${isAmazonMasterArticle ? '1460px' : '1240px'};margin:0 auto;border:1px solid ${isAmazonMasterArticle ? '#e7dcc9' : 'rgba(253,199,84,.2)'};border-radius:${isAmazonMasterArticle ? '28px' : '18px'};overflow:hidden;background:${isAmazonMasterArticle ? 'linear-gradient(180deg,#fffaf1,#fff)' : 'linear-gradient(180deg,#0b1220,#0f172a)'};box-shadow:${isAmazonMasterArticle ? '0 24px 60px rgba(15,23,42,.08)' : 'none'};}
                    .mag-grid{display:grid;grid-template-columns:minmax(0,1fr);gap:${isAmazonMasterArticle ? '2rem' : '1.25rem'};padding:${isAmazonMasterArticle ? '1.5rem' : '1.2rem'};}
                    .mag-kicker{display:inline-block;background:${isAmazonMasterArticle ? '#fff2d4' : 'rgba(253,199,84,.1)'};border:1px solid ${isAmazonMasterArticle ? '#efcf8a' : 'rgba(253,199,84,.25)'};color:${isAmazonMasterArticle ? '#8a5a00' : '#fdc754'};padding:${isAmazonMasterArticle ? '.38rem .85rem' : '.25rem .75rem'};border-radius:999px;font:800 .72rem/1 Manrope,sans-serif;letter-spacing:.12em;text-transform:uppercase;}
                    .mag-title{font:800 clamp(${isAmazonMasterArticle ? '2.5rem,5.5vw,4.5rem' : '2rem,5.2vw,3.6rem'})/1.08 Manrope,sans-serif;color:${isAmazonMasterArticle ? '#111827' : '#f8fafc'};margin:.8rem 0;letter-spacing:${isAmazonMasterArticle ? '-.04em' : 'normal'};max-width:${isAmazonMasterArticle ? '16ch' : 'none'};}
                    .mag-dek{margin:0 0 1rem;color:${isAmazonMasterArticle ? '#475569' : '#cbd5e1'};font:${isAmazonMasterArticle ? "400 1.15rem/1.82 'Source Serif 4',Georgia,serif" : "600 .92rem/1.75 Manrope,sans-serif"};max-width:${isAmazonMasterArticle ? '880px' : 'none'};}
                    .mag-meta{display:flex;flex-wrap:wrap;gap:.8rem;color:${isAmazonMasterArticle ? '#6b7280' : '#94a3b8'};font:600 .86rem/1.4 Manrope,sans-serif}
                    .mag-meta a{color:${isAmazonMasterArticle ? '#b7791f' : '#fde08a'};text-decoration:none}
                    .mag-hero{width:100%;max-height:${isAmazonMasterArticle ? '440px' : '430px'};min-height:${isAmazonMasterArticle ? '240px' : 'unset'};object-fit:cover;border:${isAmazonMasterArticle ? '1px solid #e7dcc9' : '0'};border-bottom:${isAmazonMasterArticle ? '0' : '1px solid rgba(253,199,84,.2)'};border-radius:${isAmazonMasterArticle ? '22px' : '0'};box-shadow:${isAmazonMasterArticle ? '0 20px 40px rgba(15,23,42,.08)' : 'none'};margin-bottom:${isAmazonMasterArticle ? '1rem' : '0'};background:${isAmazonMasterArticle ? '#f8f5ee' : 'transparent'}}
                    .mag-main{min-width:0;${isAmazonMasterArticle ? 'background:#fffdf9;border:1px solid #e5dccd;border-radius:22px;padding:1.35rem 1.4rem;' : ''}}
                    .mag-sidebar{min-width:0}
                    .mag-sticky{position:sticky;top:1rem;display:grid;gap:.9rem}
                    .mag-author-card{border:1px solid ${isAmazonMasterArticle ? '#e7dcc9' : 'rgba(253,199,84,.2)'};background:${isAmazonMasterArticle ? '#fff' : '#111c33'};border-radius:16px;padding:1rem}
                    .mag-author-eyebrow{display:block;margin-bottom:.5rem;color:${isAmazonMasterArticle ? '#8a5a00' : '#fde08a'};font:800 .68rem/1 Manrope,sans-serif;letter-spacing:.14em;text-transform:uppercase}
                    .mag-author-row{display:grid;grid-template-columns:56px minmax(0,1fr);gap:.8rem;align-items:center}
                    .mag-author-avatar{width:56px;height:56px;border-radius:${isAmazonMasterArticle ? '16px' : '999px'};overflow:hidden;background:${isAmazonMasterArticle ? 'linear-gradient(135deg,#111827,#334155)' : 'rgba(253,199,84,.14)'};display:flex;align-items:center;justify-content:center;color:${isAmazonMasterArticle ? '#fff' : '#fdc754'};font:800 1rem/1 Manrope,sans-serif}
                    .mag-author-avatar img{width:100%;height:100%;object-fit:cover}
                    .mag-author-name{margin:0;color:${isAmazonMasterArticle ? '#111827' : '#f8fafc'};font:800 1rem/1.2 Manrope,sans-serif}
                    .mag-author-bio{margin:.25rem 0 0;color:${isAmazonMasterArticle ? '#64748b' : '#cbd5e1'};font:600 .82rem/1.5 Manrope,sans-serif}
                    .trending{border:1px solid ${isAmazonMasterArticle ? '#e2d7c6' : 'rgba(253,199,84,.2)'};background:${isAmazonMasterArticle ? '#fffaf2' : '#111c33'};border-radius:12px;padding:.9rem}
                    .trending h3{margin:0 0 .7rem;color:${isAmazonMasterArticle ? '#111827' : '#f8fafc'};font:700 1rem/1.3 Manrope,sans-serif}
                    .trend-list{list-style:none;margin:0;padding:0;display:grid;gap:.6rem}
                    .trend-item{display:grid;grid-template-columns:24px minmax(0,1fr);gap:.55rem;padding:.55rem;border:1px solid ${isAmazonMasterArticle ? '#ebe2d2' : 'rgba(253,199,84,.16)'};border-radius:10px;background:${isAmazonMasterArticle ? '#ffffff' : 'rgba(255,255,255,.02)'}}
                    .trend-rank{width:22px;height:22px;border-radius:999px;background:#fdc754;color:#0f172a;font:800 .7rem/22px Manrope,sans-serif;text-align:center}
                    .trend-title{margin:0;color:${isAmazonMasterArticle ? '#334155' : '#dbe6f6'};font:600 .84rem/1.35 Manrope,sans-serif}
                    .trend-link{display:inline-block;margin-top:.35rem;padding:.22rem .62rem;border-radius:999px;border:1px solid ${isAmazonMasterArticle ? 'rgba(223,158,26,.45)' : 'rgba(253,199,84,.45)'};color:${isAmazonMasterArticle ? '#9a6700' : '#fcd879'};text-decoration:none;font:700 .72rem/1 Manrope,sans-serif}
                    .trend-link:hover{background:#fdc754;color:#0f172a}
                    .trend-track{display:inline-block;margin-top:.32rem;padding:.22rem .62rem;border-radius:999px;border:1px solid ${isAmazonMasterArticle ? 'rgba(148,163,184,.35)' : 'rgba(253,199,84,.3)'};color:${isAmazonMasterArticle ? '#475569' : '#cbd5e1'};background:transparent;font:700 .68rem/1 Manrope,sans-serif}
                    .trend-track.is-saved{border-color:rgba(253,199,84,.6);color:${isAmazonMasterArticle ? '#8a5a00' : '#fde29b'};background:${isAmazonMasterArticle ? 'rgba(247,183,51,.12)' : 'rgba(253,199,84,.12)'}}
                    .pgp-ad-slot{margin:1rem 0;border:1px dashed ${isAmazonMasterArticle ? 'rgba(223,158,26,.45)' : 'rgba(253,199,84,.5)'};border-radius:12px;background:${isAmazonMasterArticle ? 'rgba(247,183,51,.08)' : 'rgba(253,199,84,.06)'};padding:.72rem}
                    .pgp-ad-label{display:block;color:${isAmazonMasterArticle ? '#9a6700' : '#fde08a'};font:700 .66rem/1 Manrope,sans-serif;text-transform:uppercase;letter-spacing:.16em;margin-bottom:.35rem}
                    .pgp-ad-copy{color:${isAmazonMasterArticle ? '#64748b' : '#cbd5e1'};font:600 .84rem/1.4 Manrope,sans-serif}
                    .mag-content{font:400 ${isAmazonMasterArticle ? '1.08rem/1.85' : '1.14rem/1.9'} 'Source Serif 4',Georgia,serif;color:${isAmazonMasterArticle ? '#374151' : '#dbe6f6'}}
                    .mag-content h2,.mag-content h3,.mag-content h4{font-family:Manrope,sans-serif!important;color:${isAmazonMasterArticle ? '#111827' : '#f8fafc'}!important;line-height:1.25;margin:1.7rem 0 .7rem}
                    .mag-content a{color:${isAmazonMasterArticle ? '#b7791f' : '#fdc754'}!important;text-decoration:underline}
                    .mag-content p,.mag-content li,.mag-content td,.mag-content blockquote{color:${isAmazonMasterArticle ? '#374151' : '#dbe6f6'}!important}
                    .mag-content img{border-radius:${isAmazonMasterArticle ? '0' : '12px'};border:1px solid ${isAmazonMasterArticle ? '#e4d8c5' : 'rgba(253,199,84,.2)'};box-shadow:${isAmazonMasterArticle ? '0 10px 28px rgba(15,23,42,.06)' : '0 18px 40px rgba(2,6,23,.45)'}}
                    .mag-content table{width:100%;border-collapse:collapse;border:1px solid ${isAmazonMasterArticle ? '#e2d7c6' : 'rgba(253,199,84,.25)'}}
                    .mag-content th,.mag-content td{border:1px solid ${isAmazonMasterArticle ? '#ece2d3' : 'rgba(253,199,84,.15)'};padding:.62rem .68rem}
                    ${isAmazonMasterArticle ? `
                    .mag-content > *:first-child{margin-top:0!important}
                    .mag-content h2{font-size:clamp(1.5rem,2.3vw,2.1rem)!important;letter-spacing:-.03em}
                    .mag-content h3{font-size:1.24rem!important}
                    .mag-content .amazon-review-title,.mag-content .amazon-compare-title,.mag-content .faq-question,.mag-content .amazon-key-features h4,.mag-content .pros-box h4,.mag-content .cons-box h4{color:#111827!important}
                    .mag-content .amazon-review-summary,.mag-content .amazon-review-tradeoff,.mag-content .faq-answer,.mag-content .faq-answer p,.mag-content .amazon-compare-features,.mag-content .amazon-compare-rating,.mag-content .amazon-key-features li,.mag-content .pros-box li,.mag-content .cons-box li{color:#475569!important}
                    .mag-content figure{margin:1.4rem 0!important}
                    .mag-content figure img,.mag-content > p > img{width:100%!important;max-width:100%!important;display:block;box-shadow:0 24px 40px rgba(15,23,42,.08)!important;border:1px solid #e5dccd!important}
                    .mag-content .amazon-editorial-pick{padding:1rem 0 1.85rem!important;margin:0 0 1.75rem!important;border-bottom:1px solid #ece1cf!important;background:transparent!important;border-radius:0!important;box-shadow:none!important}
                    .mag-content .amazon-editorial-pick:first-of-type{padding-top:.35rem!important}
                    .mag-content .amazon-editorial-pick:last-of-type{margin-bottom:0!important}
                    .mag-content .amazon-editorial-head{display:flex!important;flex-wrap:wrap!important;align-items:flex-start!important;justify-content:space-between!important;gap:.9rem!important;margin-bottom:.45rem!important}
                    .mag-content .amazon-editorial-title-wrap{display:grid!important;gap:.45rem!important}
                    .mag-content .amazon-editorial-title{margin:0!important;font:800 clamp(1.12rem,2vw,1.55rem)/1.26 Manrope,sans-serif!important;letter-spacing:-.02em!important;color:#111827!important}
                    .mag-content .amazon-editorial-badge{display:inline-flex!important;align-items:center!important;width:max-content!important;padding:.34rem .7rem!important;border-radius:999px!important;background:#fff3d4!important;border:1px solid #efcf8a!important;color:#8a5a00!important;font:800 .68rem/1 Manrope,sans-serif!important;letter-spacing:.08em!important;text-transform:uppercase!important}
                    .mag-content .amazon-editorial-meta{display:flex!important;flex-wrap:wrap!important;align-items:center!important;gap:.55rem!important}
                    .mag-content .amazon-editorial-price{color:#9a6700!important;font:800 .78rem/1 Manrope,sans-serif!important;letter-spacing:.12em!important;text-transform:uppercase!important}
                    .mag-content .amazon-editorial-image{margin:.8rem 0 1rem!important}
                    .mag-content .amazon-editorial-image img{display:block!important;width:100%!important;max-width:100%!important;aspect-ratio:16/10!important;object-fit:cover!important;border-radius:0!important;border:1px solid #e5dccd!important;box-shadow:none!important;background:#f8f5ee!important}
                    .mag-content .amazon-editorial-summary{margin:0 0 .85rem!important;color:#334155!important;font:400 1rem/1.82 'Source Serif 4',Georgia,serif!important}
                    .mag-content .amazon-editorial-points{display:grid!important;grid-template-columns:minmax(0,1fr)!important;gap:.75rem!important;margin:.15rem 0 .85rem!important}
                    .mag-content .amazon-editorial-point{margin:0!important}
                    .mag-content .amazon-editorial-point-label{display:block!important;margin:0 0 .25rem!important;color:#9a6700!important;font:800 .72rem/1 Manrope,sans-serif!important;letter-spacing:.12em!important;text-transform:uppercase!important}
                    .mag-content .amazon-editorial-point ul{margin:0!important;padding-left:1.08rem!important}
                    .mag-content .amazon-editorial-point li{margin:.18rem 0!important;color:#475569!important;line-height:1.62!important}
                    .mag-content .amazon-editorial-tradeoff{margin:.2rem 0 0!important;color:#475569!important;font:400 .98rem/1.76 'Source Serif 4',Georgia,serif!important}
                    .mag-content .amazon-editorial-tradeoff strong{color:#111827!important;font-family:Manrope,sans-serif!important;font-size:.8rem!important;letter-spacing:.08em!important;text-transform:uppercase!important}
                    .mag-content .amazon-editorial-actions{display:flex!important;flex-wrap:wrap!important;gap:.65rem!important;margin-top:.95rem!important}
                    .mag-content .amazon-review-card,.mag-content .product-verdict-box{background:#fffdf9!important;border:1px solid #e5dccd!important;border-top:3px solid #f7b733!important;border-radius:22px!important;padding:1.25rem!important;box-shadow:0 16px 34px rgba(15,23,42,.06)!important;margin:1.65rem 0!important}
                    .mag-content .amazon-review-card{display:grid!important;grid-template-columns:minmax(0,1fr)!important;gap:1rem!important}
                    .mag-content .amazon-review-heading-row{display:flex!important;flex-wrap:wrap;align-items:flex-start;justify-content:space-between;gap:.85rem}
                    .mag-content .amazon-review-badge,.mag-content .amazon-compare-badge{display:inline-flex!important;align-items:center;padding:.34rem .7rem!important;border-radius:999px!important;background:#fff3d4!important;border:1px solid #efcf8a!important;color:#8a5a00!important;font:800 .68rem/1 Manrope,sans-serif!important;text-transform:uppercase;letter-spacing:.08em}
                    .mag-content .amazon-review-image-wrap,.mag-content .product-verdict-image,.mag-content .amazon-compare-image-box{background:#faf5ea!important;border:1px solid #e5dccd!important;border-radius:18px!important;overflow:hidden;padding:.35rem!important}
                    .mag-content .amazon-review-image-wrap img{width:100%!important;height:100%!important;object-fit:cover!important;border-radius:14px!important}
                    .mag-content .product-verdict-image img,.mag-content .comparison-thumb{width:100%!important;height:100%!important;object-fit:contain!important;object-position:center center!important;border-radius:14px!important;background:#ffffff!important;padding:.35rem!important}
                    .mag-content .amazon-review-price,.mag-content .amazon-compare-price,.mag-content .product-verdict-price{color:#8a5a00!important;font:800 1.45rem/1 Manrope,sans-serif!important}
                    .mag-content .amazon-key-features,.mag-content .pros-box,.mag-content .cons-box,.mag-content .postgenius-faq-section,.mag-content .faq-item{background:#fff8eb!important;border:1px solid #efdebd!important;border-radius:16px!important}
                    .mag-content .pros-cons-grid,.mag-content .amazon-review-columns{display:grid!important;grid-template-columns:minmax(0,1fr)!important;gap:.8rem!important}
                    .mag-content .amazon-comparison-grid{display:grid!important;grid-template-columns:repeat(1,minmax(0,1fr))!important;gap:1rem!important;margin:1.4rem 0 2rem!important;padding-bottom:0!important;border-bottom:0!important}
                    .mag-content .amazon-compare-card{display:flex!important;flex-direction:column!important;gap:.6rem!important;background:#fff!important;border:1px solid #e5dccd!important;border-top:3px solid #f7b733!important;border-radius:20px!important;padding:1rem!important;box-shadow:0 14px 28px rgba(15,23,42,.06)!important}
                    .mag-content .amazon-compare-description,.mag-content .product-verdict-description{color:#475569!important}
                    .mag-content .amazon-table-cta-button,.mag-content .amazon-cta-button-full,.mag-content .amazon-cta-button,.mag-content .pgp-cta-button,.mag-content .ac-shop-btn{background:linear-gradient(180deg,#ffd66e 0%,#f7b733 52%,#eea91d 100%)!important;color:#3f2602!important;border-color:#d69b1b!important;box-shadow:0 10px 22px rgba(247,183,51,.28), inset 0 1px 0 rgba(255,255,255,.65)!important;border-radius:999px!important;font-family:Manrope,sans-serif!important;font-weight:800!important}
                    .mag-content .pgp-track-product-btn.is-saved{background:#111827!important;border-color:#111827!important;color:#fff!important}
                    ` : `
                    .mag-content .amazon-review-card,.mag-content .amazon-compare-card,.mag-content .product-verdict-box,.mag-content .postgenius-faq-section,.mag-content .faq-item,.mag-content .amazon-key-features,.mag-content .pros-box,.mag-content .cons-box,.mag-content .postgenius-recipe-card,.mag-content .postgenius-recipe-card .ac-header,.mag-content .postgenius-recipe-card .ac-ingredients,.mag-content .postgenius-recipe-card .ac-instructions,.mag-content .postgenius-recipe-card .ac-footer{background:#111c33!important;border-color:rgba(253,199,84,.2)!important;color:#dbe6f6!important}
                    .mag-content .amazon-review-title,.mag-content .amazon-compare-title,.mag-content .product-verdict-content h4,.mag-content .faq-question,.mag-content .postgenius-recipe-card h2,.mag-content .postgenius-recipe-card h3{color:#f8fafc!important}
                    .mag-content .postgenius-recipe-card .ac-meta-item,.mag-content .postgenius-recipe-card .ac-meta-value,.mag-content .postgenius-recipe-card .ac-ingredients li,.mag-content .postgenius-recipe-card .ac-instructions li,.mag-content .faq-answer,.mag-content .faq-answer p{color:#dbe6f6!important}
                    .mag-content .postgenius-recipe-card .ac-print-btn{color:#f8fafc!important;border-color:rgba(253,199,84,.35)!important;background:rgba(255,255,255,.03)!important}
                    .mag-content .postgenius-recipe-card .ac-print-btn:hover{background:rgba(253,199,84,.12)!important;border-color:rgba(253,199,84,.5)!important}
                    .mag-content .amazon-compare-description,.mag-content .product-verdict-description{color:#dbe6f6!important}
                    .mag-content .pros-box ul{list-style:none!important;padding-left:1.8rem!important}
                    .mag-content .pros-box li{position:relative!important;margin-bottom:.5rem!important}
                    .mag-content .pros-box li::before{content:"✓";position:absolute;left:-1.5rem;top:0;color:#10b981;font-weight:800;font-family:Manrope,sans-serif}
                    .mag-content .cons-box ul{list-style:none!important;padding-left:1.8rem!important}
                    .mag-content .cons-box li{position:relative!important;margin-bottom:.5rem!important}
                    .mag-content .cons-box li::before{content:"✕";position:absolute;left:-1.5rem;top:0;color:#ef4444;font-weight:800;font-family:Manrope,sans-serif}
                    .mag-content .amazon-table-cta-button,.mag-content .amazon-cta-button-full,.mag-content .amazon-cta-button,.mag-content .pgp-cta-button,.mag-content .ac-shop-btn{background:linear-gradient(180deg,#ffb224 0%,#f59e0b 52%,#d97706 100%)!important;color:#fff!important;border-color:#b45309!important;box-shadow:0 12px 28px rgba(245,158,11,.3), inset 0 1px 0 rgba(255,255,255,.4)!important;border-radius:12px!important;padding:1rem 1.5rem!important;font-family:Manrope,sans-serif!important;font-weight:800!important;font-size:1.1rem!important;display:flex!important;justify-content:center!important;text-transform:uppercase!important;letter-spacing:.05em!important}
                    .mag-content .amazon-table-cta-button:hover,.mag-content .amazon-cta-button-full:hover,.mag-content .amazon-cta-button:hover{transform:translateY(-2px)!important;box-shadow:0 16px 36px rgba(245,158,11,.4)!important}
                    `}
                    .pgp-track-product-btn{display:inline-flex;margin:.45rem 0 0;padding:.4rem .8rem;border-radius:999px;border:1px solid ${isAmazonMasterArticle ? 'rgba(148,163,184,.35)' : 'rgba(253,199,84,.3)'};background:${isAmazonMasterArticle ? '#f8fafc' : 'transparent'};color:${isAmazonMasterArticle ? '#475569' : '#cbd5e1'};font:800 .8rem/1 Manrope,sans-serif}
                    .pgp-track-product-btn:hover{border-color:${isAmazonMasterArticle ? 'rgba(223,158,26,.55)' : 'rgba(253,199,84,.55)'};color:${isAmazonMasterArticle ? '#8a5a00' : '#fde29b'}}
                    .pgp-track-product-btn.is-saved{border-color:rgba(253,199,84,.6);color:${isAmazonMasterArticle ? '#8a5a00' : '#fde29b'};background:rgba(253,199,84,.12)}
                    .mag-footer{margin-top:1.2rem;padding-top:1rem;border-top:1px solid ${isAmazonMasterArticle ? '#e7ddce' : 'rgba(253,199,84,.2)'}}
                    .mag-actions{display:flex;flex-wrap:wrap;gap:.5rem;margin-bottom:.75rem}
                    .mag-save{padding:.34rem .75rem;border-radius:999px;border:1px solid ${isAmazonMasterArticle ? 'rgba(148,163,184,.38)' : 'rgba(253,199,84,.38)'};background:transparent;color:${isAmazonMasterArticle ? '#334155' : '#f8fafc'};font:700 .74rem/1.2 Manrope,sans-serif}
                    .mag-save.active{background:rgba(253,199,84,.14);color:${isAmazonMasterArticle ? '#8a5a00' : '#fde29b'}}
                    .mag-tags{display:flex;flex-wrap:wrap;gap:.4rem;margin-top:.8rem}
                    .mag-tag{padding:.2rem .55rem;border-radius:999px;border:1px solid ${isAmazonMasterArticle ? '#eadfcd' : 'rgba(253,199,84,.2)'};background:${isAmazonMasterArticle ? '#fffaf0' : 'rgba(253,199,84,.12)'};color:${isAmazonMasterArticle ? '#334155' : '#f8fafc'};text-decoration:none;font:600 .72rem/1.3 Manrope,sans-serif}
                    .mag-share{display:flex;flex-wrap:wrap;gap:.45rem}
                    .mag-share a{padding:.28rem .64rem;border-radius:999px;border:1px solid ${isAmazonMasterArticle ? '#e4d8c5' : 'rgba(253,199,84,.35)'};color:${isAmazonMasterArticle ? '#334155' : '#f8fafc'};text-decoration:none;font:600 .74rem/1.2 Manrope,sans-serif}
                    .mag-back{display:inline-flex;margin-top:1rem;padding:.38rem .9rem;border:1px solid ${isAmazonMasterArticle ? '#dfc38c' : 'rgba(253,199,84,.5)'};border-radius:999px;color:${isAmazonMasterArticle ? '#9a6700' : '#fcd879'};text-decoration:none;font:700 .82rem/1.2 Manrope,sans-serif}
                    .mag-edit{position:absolute;top:1rem;right:1rem;z-index:10;border-radius:999px;background:#fdc754;color:#0f172a;border:0;padding:.42rem .82rem;font:800 .78rem/1 Manrope,sans-serif}
                    .mag-notice{margin-top:.6rem;color:${isAmazonMasterArticle ? '#8a5a00' : '#fde29b'};font:600 .78rem/1.3 Manrope,sans-serif}
                    @media(min-width:980px){
                        .mag-grid{grid-template-columns:minmax(0,1fr) 360px;padding:2.5rem 2.5rem 3rem}
                        .mag-main{${isAmazonMasterArticle ? 'padding:2rem 2.5rem;' : ''}}
                        .mag-content p, .mag-content li {font-size: 1.18rem!important; line-height: 1.95!important;}
                        ${isAmazonMasterArticle ? '.mag-content .amazon-review-card{grid-template-columns:360px minmax(0,1fr)!important}.mag-content .pros-cons-grid,.mag-content .amazon-review-columns{grid-template-columns:repeat(2,minmax(0,1fr))!important}.mag-content .amazon-editorial-points{grid-template-columns:repeat(2,minmax(0,1fr))!important}.mag-content .amazon-comparison-grid{grid-template-columns:repeat(3,minmax(0,1fr))!important}' : ''}
                    }
                `}</style>

                {isAuthor && onEdit && <button onClick={() => onEdit(article)} className="mag-edit">Edit Article</button>}

                {(isAmazonMasterArticle ? articleHeroImage : article.image_url) && (
                    <img
                        src={isAmazonMasterArticle ? articleHeroImage : article.image_url || ''}
                        alt={heroAlt}
                        className="mag-hero"
                    />
                )}

                <div className="mag-grid">
                    <div className="mag-main">
                        <span className="mag-kicker">{article.category || 'Magazine'}</span>
                        <h1 className="mag-title">{article.title}</h1>
                        {isAmazonMasterArticle && <p className="mag-dek">{articleDescription}</p>}
                        <div className="mag-meta">
                            <span>{publishedLabel}</span>
                            <span>{readingMinutes} min read</span>
                            <span>
                                By <Link to={authorHref}>{authorName}</Link>
                            </span>
                        </div>

                        <div className="mag-actions">
                            {session ? (
                                <button onClick={handleToggleReview} className={`mag-save ${isSavedReview ? 'active' : ''}`}>
                                    {isSavedReview ? 'Saved to Reading List' : 'Save to Reading List'}
                                </button>
                            ) : (
                                <Link to="/signup" className="mag-save">Save to Reading List</Link>
                            )}
                        </div>
                        {notice && <p className="mag-notice">{notice}</p>}

                        {!isAmazonMasterArticle && (
                            <aside className="pgp-ad-slot" data-ad-slot="under-title">
                                <span className="pgp-ad-label">Advertisement</span>
                                <div className="pgp-ad-copy">Partner feature</div>
                            </aside>
                        )}

                        <div ref={contentRef} className="post-content mag-content" dangerouslySetInnerHTML={{ __html: displayHtml }} />

                        {!isAmazonMasterArticle && (
                            <aside className="pgp-ad-slot" data-ad-slot="end-article">
                                <span className="pgp-ad-label">Advertisement</span>
                                <div className="pgp-ad-copy">Partner feature</div>
                            </aside>
                        )}

                        <div className="mag-footer">
                            <div className="mag-share">
                                <a href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(postUrl)}`} target="_blank" rel="noopener noreferrer">LinkedIn</a>
                                <a href={`https://twitter.com/intent/tweet?url=${encodeURIComponent(postUrl)}&text=${encodeURIComponent(article.title)}`} target="_blank" rel="noopener noreferrer">X</a>
                                <a href={`https://pinterest.com/pin/create/button/?url=${encodeURIComponent(postUrl)}`} target="_blank" rel="noopener noreferrer">Pinterest</a>
                                <a href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(postUrl)}`} target="_blank" rel="noopener noreferrer">Facebook</a>
                            </div>

                            {allTags.length > 0 && (
                                <div className="mag-tags">
                                    {allTags.map(tag => (
                                        <Link key={tag} to={`/blog?tag=${encodeURIComponent(tag)}`} className="mag-tag">{tag}</Link>
                                    ))}
                                </div>
                            )}
                            <Link to="/blog" className="mag-back">Back to Magazine</Link>
                        </div>
                    </div>

                    <aside className="mag-sidebar">
                        <div className="mag-sticky">
                            {isAmazonMasterArticle && (
                                <div className="mag-author-card">
                                    <span className="mag-author-eyebrow">About The Author</span>
                                    <div className="mag-author-row">
                                        <div className="mag-author-avatar">
                                            {authorProfile?.avatar_url ? (
                                                <img src={authorProfile.avatar_url} alt={authorName} />
                                            ) : (
                                                <span>{authorName.charAt(0).toUpperCase()}</span>
                                            )}
                                        </div>
                                        <div>
                                            <p className="mag-author-name">{authorName}</p>
                                            <p className="mag-author-bio">
                                                {authorProfile?.bio || 'Trusted reviews and practical buying-guide coverage from the Postgenius Pro editorial desk.'}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            )}
                            {toc.length > 0 && (
                                <div className="trending">
                                    <h3>Quick Links</h3>
                                    <ol className="trend-list z-10 relative">
                                        {toc.map((item, idx) => (
                                            <li className="trend-item hover:bg-white/50 transition-colors" key={`${item.id}-${idx}`} style={{ paddingLeft: item.level === 3 ? '1.5rem' : '0.55rem' }}>
                                                <div className="flex items-center gap-2">
                                                    {item.level === 2 && <span className="trend-rank" style={{ background: '#e2e8f0', color: '#475569', width: '6px', height: '6px', borderRadius: '50%' }}></span>}
                                                    <a className="trend-title" style={{textDecoration: 'none'}} href={`#${item.id}`}>{item.text}</a>
                                                </div>
                                            </li>
                                        ))}
                                    </ol>
                                </div>
                            )}

                            <div className="trending">
                                <h3>Popular Picks Right Now</h3>
                                <ol className="trend-list">
                                    {trending.map((item, idx) => {
                                        const tracked = trackedUrls.has(normalizeUrl(item.href));
                                        return (
                                            <li className="trend-item" key={`${item.href}-${idx}`}>
                                                <span className="trend-rank">#{idx + 1}</span>
                                                <div>
                                                    <p className="trend-title">{item.title}</p>
                                                    <a className="trend-link" href={item.href} target="_blank" rel="noopener noreferrer sponsored nofollow">View Pick</a>
                                                    {session ? (
                                                        <button onClick={() => handleToggleTrendingProduct(item)} className={`trend-track ${tracked ? 'is-saved' : ''}`}>
                                                            {tracked ? 'Saved to Reading List' : 'Save to Reading List'}
                                                        </button>
                                                    ) : (
                                                        <Link to="/signup" className="trend-track">Save to Reading List</Link>
                                                    )}
                                                </div>
                                            </li>
                                        );
                                    })}
                                </ol>
                            </div>
                            {!isAmazonMasterArticle && (
                                <aside className="pgp-ad-slot" data-ad-slot="sidebar">
                                    <span className="pgp-ad-label">Advertisement</span>
                                    <div className="pgp-ad-copy">Partner feature</div>
                                </aside>
                            )}
                        </div>
                    </aside>
                </div>
            </article>
        </>
    );
};

export default BlogPostPage;
