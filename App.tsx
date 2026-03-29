
import React, { useState, useCallback, useEffect, useMemo, useLayoutEffect, useRef } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import type { AppSessionData, WordPressConfig, AmazonConfig, AiConfig, BlogPostData, PublishingProgress, Blueprint, Article, ScoreFeedback, ArticleStatus, ImageSource, ArticleContent, AmazonProduct, UserProfile, CombinedPostResponse, ImagePayload, ExtractedRecipeData, Session, User, AmazonProductDetails, ContentSection } from './types';
import { AppStep, PublishingStatus } from './types';
import { generateImage as generateWithGemini, QuotaError, modifyRecipe, extractDataFromUrl as extractDataFromUrlWithGemini, generateArticleFromKeyword, BillingQuotaError, ModelOverloadedError, generatePostFromExtractedData as generatePostFromExtractedDataWithGemini, analyzeContentWithGemini, generatePostWithOpenSource } from './services/geminiService';
import { generateImage as generateWithFreeTier, ImageRateLimitError as FreeImageRateLimitError } from './services/freeImageService';
import { generateImageWithDeepAI, getRateLimitStatus, ImageRateLimitError } from './services/deepaiImageService';
import { generateImageWithPriorityChain } from './services/imageService';
import { validateAndParseCombinedPost, validateAndParseExtractedRecipe, isValidUrl } from './services/validationService';
import { publishPost, validateWpConnection, fetchExistingCategories } from './services/wordpressService';
import { saveArticle, uploadImage, getPublicUrl, saveArticleToFileHost, getArticleScore, submitArticleForReview, updateArticle, updateArticleStatus, updateArticleImages, ARTICLE_IMAGES_BUCKET_NAME, deleteImage, updateUserStyleConfig, updateUserProfile } from './services/articleService';
import { defaultStyleConfig, generateFinalHtml, getCompactProductDisplayTitle, isAmazonHostedImage, isPlatformHostedImage, isUsableAmazonProductImageUrl, resolvePreferredProductImageUrl } from './services/styleService';
import { prepareArticleHtmlForEditing } from './services/reviewLayoutService';
import StatusBar from './components/StatusBar';
import UrlInput from './components/UrlInput';
import LoadingSpinner from './components/LoadingSpinner';
import BlogPostPreview from './components/BlogPostPreview';
import RecipeModification from './components/RecipeModification';
import FeaturedImageUploader from './components/FeaturedImageUploader';
import LandingPage from './components/LandingPage';
import MainLayout from './components/MainLayout';
import AboutPage from './components/AboutPage';
import AuthPage from './components/AuthPage';
import FaqPage from './components/FaqPage';
import ContactPage from './components/ContactPage';
import PrivacyPolicyPage from './components/PrivacyPolicyPage';
import TermsOfServicePage from './components/TermsOfServicePage';
import PricingPage from './components/PricingPage';
import AffiliateDisclosurePage from './components/AffiliateDisclosurePage';
import NotFoundPage from './components/NotFoundPage';
import MyArticlesPage from './components/MyArticlesPage';
import FeaturesPage from './components/FeaturesPage';
import BlogPage from './components/BlogPage';
import BlogPostPage from './components/BlogPostPage';
import MemberProfilePage from './components/MemberProfilePage';
import { useUsageTracker } from './hooks/useUsageTracker';
import UpgradeNudge from './components/UpgradeNudge';
// Lazy load heavy components for better performance
const AdminDashboard = React.lazy(() => import('./components/AdminDashboard'));
const PublishingWorkflow = React.lazy(() => import('./components/PublishingWorkflow'));
const AuthorProfilePage = React.lazy(() => import('./components/AuthorProfilePage'));
import BlueprintSelection from './components/BlueprintSelection';
import ContentScorePanel from './components/ContentScorePanel';
// import { supabase } from './services/supabaseClient'; // Removed for Hostinger Migration
import SettingsPage from './components/SettingsPage';
import type { StyleConfig } from './types';
import ImageStrategy from './components/ImageStrategy';
import { extractASINFromUrl, getAmazonProductData, searchAmazonProductByKeyword, searchProductsAndGetImages, isMeaningfulAmazonProductKeyword } from './services/amazonService';
import { uploadArticleImage, uploadDataURIOrUrlImage } from './services/uploadHandler';
import { filterProductsToDominantFamily } from './services/productFamilyService';
import StockImagePickerModal from './components/StockImagePickerModal';
import { searchStockImages } from './services/stockImageService';
import { extractRecipeFromHashbrown } from './services/hashbrownService';
import analyticsService from './services/analyticsService';
import AnalyticsDashboard from './components/AnalyticsDashboard';
import PremiumSupportForm from './components/PremiumSupportForm';
import { isPremiumUser } from './services/analyticsDataService';
import { checkArticleLimit, getLimitMessage, ArticleLimitInfo } from './services/limitService';
import LicenseGuard from './components/LicenseGuard';
import { api } from './services/apiClient';

import SuccessPage from './components/SuccessPage';

const sanitizeFilename = (filename: string): string => {
    return filename.replace(/[^a-zA-Z0-9_.-]/g, '_');
};

const dataURLtoFile = (dataurl: string, filename: string): File => {
    const arr = dataurl.split(',');
    const mime = arr[0].match(/:(.*?);/)![1];
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
        u8arr[n] = bstr.charCodeAt(n);
    }
    return new File([u8arr], filename, { type: mime });
};

const extractValidAsins = (input: string): string[] => {
    const directMatches = input.toUpperCase().match(/\b[B0-9][A-Z0-9]{9}\b/g) || [];
    const asinFromUrl = extractASINFromUrl(input);
    const allMatches = asinFromUrl ? [...directMatches, asinFromUrl.toUpperCase()] : directMatches;
    return Array.from(new Set(allMatches));
};

const resolveAmazonProductImage = (
    product: AmazonProduct,
    productImageUrls: Record<string, string> | undefined,
    fallbackSize = '600x600'
): string => {
    const preferred = resolvePreferredProductImageUrl(product, productImageUrls, fallbackSize);
    return isAmazonHostedImage(preferred) ? preferred : '';
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

type AmazonProductIdentityOptions = {
    blueprintType?: string | null;
    articleTitle?: string;
};

const normalizeAmazonIdentityText = (value: string | undefined): string =>
    String(value || '')
        .replace(/\bhttps?:\/\/\S+/gi, ' ')
        .replace(/[^\p{L}\p{N}\s&/+.'-]+/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim();

const hasVerifiableAmazonIdentity = (product: AmazonProduct): boolean => {
    return Boolean(extractProductAsin(product) || isAmazonProductUrl(product.url));
};

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

const canUseAmazonKeywordSearch = (
    product: AmazonProduct,
    options?: AmazonProductIdentityOptions
): boolean => {
    return hasSearchableAmazonKeywordIdentity(product, options);
};

const buildAmazonProductSearchQueries = (
    product: AmazonProduct,
    options?: AmazonProductIdentityOptions
): string[] => {
    const rawProductName = String(product.productName || '').trim();
    const extractedAsin = extractProductAsin(product) || '';
    const candidates = [extractedAsin];
    if (!canUseAmazonKeywordSearch(product, options)) {
        return Array.from(new Set(candidates.filter(Boolean)));
    }

    const compactTitle = getCompactProductDisplayTitle(product, rawProductName, product.url || '');
    const simplifiedTitle = compactTitle
        .replace(/\bhttps?:\/\/\S+/gi, ' ')
        .replace(/[^\p{L}\p{N}\s-]+/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .split(' ')
        .slice(0, 10)
        .join(' ');

    candidates.push(
        rawProductName,
        rawProductName.replace(/[.…]+/g, ' ').replace(/\s+/g, ' ').trim(),
        compactTitle,
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

const uploadHostedProductImage = async (
    sourceUrl: string,
    articleId: string,
    productId: number
): Promise<string> => {
    if (!sourceUrl) return '';
    if (isPlatformHostedImage(sourceUrl)) return sourceUrl;

    const token = typeof localStorage !== 'undefined' ? localStorage.getItem('auth_token') : null;
    return uploadDataURIOrUrlImage(sourceUrl, articleId, `product_${productId}.webp`, token);
};

const normalizeAmazonProductAssets = (
    productData: AmazonProduct[],
    productImageUrls: Record<string, string> | undefined
): {
    productData: AmazonProduct[];
    productImageUrls: Record<string, string>;
    changed: boolean;
} => {
    const nextImageUrls: Record<string, string> = { ...(productImageUrls || {}) };
    let changed = false;

    const nextProducts = productData.map((product) => {
        const key = String(product.id);
        const currentMapped = String(nextImageUrls[key] || '').trim();
        const currentHosted = isPlatformHostedImage(currentMapped);
        const amazonUrl = resolveAmazonProductImage(product, nextImageUrls, '600x600');

        if (currentHosted) {
            return product;
        }

        if (amazonUrl) {
            if (currentMapped !== amazonUrl) {
                nextImageUrls[key] = amazonUrl;
                changed = true;
            }

            if (String(product.imageUrl || '').trim() !== amazonUrl) {
                changed = true;
                return { ...product, imageUrl: amazonUrl };
            }

            return product;
        }

        if (currentMapped && !isAmazonHostedImage(currentMapped) && !isPlatformHostedImage(currentMapped)) {
            delete nextImageUrls[key];
            changed = true;
        }

        return product;
    });

    const normalizedKeys = new Set(productData.map(product => String(product.id)));
    Object.keys(nextImageUrls).forEach((key) => {
        if (normalizedKeys.has(key)) return;
        const value = String(nextImageUrls[key] || '').trim();
        if (!value || (!isAmazonHostedImage(value) && !isPlatformHostedImage(value))) {
            delete nextImageUrls[key];
            changed = true;
        }
    });

    return {
        productData: nextProducts,
        productImageUrls: nextImageUrls,
        changed,
    };
};

const extractProductAsin = (product: AmazonProduct): string => {
    const fromUrl = extractASINFromUrl(String(product.url || '').trim());
    if (fromUrl) return fromUrl.toUpperCase();

    const fromSpecs = (product.specs || [])
        .filter(spec => /asin/i.test(String(spec.key || '')))
        .map(spec => extractASINFromUrl(String(spec.value || '').trim()) || extractStrictAsinCandidate(String(spec.value || '').trim()) || '')
        .find(Boolean);
    if (fromSpecs) return String(fromSpecs).toUpperCase();

    return extractStrictAsinCandidate(String(product.productName || ''));
};

const hydrateAmazonProductAssets = async (
    productData: AmazonProduct[],
    productImageUrls: Record<string, string> | undefined,
    productImageVariants: Record<number, string[]> | undefined,
    amazonConfig: AmazonConfig,
    options?: AmazonProductIdentityOptions
): Promise<{
    productData: AmazonProduct[];
    productImageUrls: Record<string, string>;
    productImageVariants: Record<number, string[]>;
}> => {
    const normalized = normalizeAmazonProductAssets(productData, productImageUrls);
    const nextProducts = normalized.productData.map(product => ({ ...product }));
    const nextImageUrls: Record<string, string> = { ...normalized.productImageUrls };
    const nextVariants: Record<number, string[]> = { ...(productImageVariants || {}) };
    const hasResolvedProductImage = (product: AmazonProduct): boolean => {
        const mapped = String(nextImageUrls[String(product.id)] || '').trim();
        if (isPlatformHostedImage(mapped)) return true;
        return !!resolveAmazonProductImage(product, nextImageUrls, '600x600');
    };

    const unresolvedProducts = nextProducts.filter(product => !hasResolvedProductImage(product));
    const searchableProducts = unresolvedProducts.filter(product => canUseAmazonKeywordSearch(product, options));

    if (
        searchableProducts.length > 0 &&
        amazonConfig.accessKey?.trim() &&
        amazonConfig.secretKey?.trim() &&
        amazonConfig.associateTag?.trim()
    ) {
        try {
            const liveSearchResults = await searchProductsAndGetImages(searchableProducts, amazonConfig, options);
            Object.entries(liveSearchResults).forEach(([id, images]) => {
                const productId = Number(id);
                if (!Number.isFinite(productId) || !images?.primary || !isUsableAmazonProductImageUrl(images.primary)) return;

                nextImageUrls[String(productId)] = images.primary;
                const targetProduct = nextProducts.find(product => product.id === productId);
                if (targetProduct) {
                    targetProduct.imageUrl = images.primary;
                    if (images.url) targetProduct.url = images.url;
                }

                const amazonVariants = (images.variants || []).filter(isUsableAmazonProductImageUrl);
                if (amazonVariants.length > 0) {
                    nextVariants[productId] = amazonVariants;
                }
            });
        } catch (error) {
            console.warn('[Amazon Image Hydration] Live search fallback failed:', error);
        }
    }

    for (const product of nextProducts) {
        if (hasResolvedProductImage(product)) continue;
        if (!hasVerifiableAmazonIdentity(product)) continue;

        const asin = extractProductAsin(product);
        if (!asin) continue;

        try {
            const details = await getAmazonProductData(asin, amazonConfig);
            const amazonImages = (details.images || []).filter(isUsableAmazonProductImageUrl);
            const primaryAmazonImage = amazonImages[0] || '';
            if (!primaryAmazonImage) continue;

            nextImageUrls[String(product.id)] = primaryAmazonImage;
            product.imageUrl = primaryAmazonImage;
            if (details.url) product.url = details.url;
            if (details.price && !product.price) product.price = details.price;
            if (amazonImages.length > 1) {
                nextVariants[product.id] = amazonImages;
            }
        } catch (error) {
            console.warn(`[Amazon Image Hydration] Failed for product ${product.id}:`, error);
        }
    }

    for (const product of nextProducts) {
        if (hasResolvedProductImage(product)) continue;
        if (!canUseAmazonKeywordSearch(product, options)) continue;

        try {
            for (const query of buildAmazonProductSearchQueries(product, options)) {
                const details = await searchAmazonProductByKeyword(query, amazonConfig, options);
                const keywordImage = (details.images || []).find(isUsableAmazonProductImageUrl);
                if (!keywordImage) continue;

                nextImageUrls[String(product.id)] = keywordImage;
                product.imageUrl = keywordImage;
                if (details.url) product.url = details.url;
                if ((!product.productName || /^https?:\/\//i.test(product.productName)) && details.title) {
                    product.productName = details.title;
                }
                break;
            }
        } catch (error) {
            console.warn(`[Amazon Image Hydration] Keyword search failed for product ${product.id}:`, error);
        }
    }

    return {
        productData: nextProducts,
        productImageUrls: nextImageUrls,
        productImageVariants: nextVariants,
    };
};

const sanitizeProductFamilyAssets = (params: {
    productData: AmazonProduct[] | undefined;
    productImageUrls?: Record<string, string>;
    productImageVariants?: Record<number, string[]>;
    blogPostData?: BlogPostData | null;
    articleTitle?: string;
    blueprintType?: string | null;
}): {
    productData: AmazonProduct[];
    productImageUrls: Record<string, string>;
    productImageVariants: Record<number, string[]>;
    blogPostData?: BlogPostData;
    changed: boolean;
    rejectedProducts: AmazonProduct[];
    dominantTokens: string[];
} => {
    const nextProducts = Array.isArray(params.productData) ? params.productData.filter(Boolean).map(product => ({ ...product })) : [];
    const nextImageUrls: Record<string, string> = { ...(params.productImageUrls || {}) };
    const nextVariants: Record<number, string[]> = { ...(params.productImageVariants || {}) };
    const blueprintType = String(params.blueprintType || '').trim().toLowerCase();
    const shouldEnforceProductFamily =
        blueprintType === 'review' || blueprintType === 'amazon_multi_asin';

    if (!shouldEnforceProductFamily) {
        return {
            productData: nextProducts,
            productImageUrls: nextImageUrls,
            productImageVariants: nextVariants,
            blogPostData: params.blogPostData || undefined,
            changed: false,
            rejectedProducts: [],
            dominantTokens: [],
        };
    }

    if (nextProducts.length <= 1) {
        return {
            productData: nextProducts,
            productImageUrls: nextImageUrls,
            productImageVariants: nextVariants,
            blogPostData: params.blogPostData || undefined,
            changed: false,
            rejectedProducts: [],
            dominantTokens: [],
        };
    }

    const articleTitle = String(params.articleTitle || params.blogPostData?.title || '').trim();
    const familyValidation = filterProductsToDominantFamily(nextProducts, articleTitle, blueprintType || '');
    if (familyValidation.rejectedProducts.length === 0) {
        return {
            productData: nextProducts,
            productImageUrls: nextImageUrls,
            productImageVariants: nextVariants,
            blogPostData: params.blogPostData || undefined,
            changed: false,
            rejectedProducts: [],
            dominantTokens: familyValidation.dominantTokens,
        };
    }

    const keepIds = new Set(familyValidation.filteredProducts.map(product => String(product.id)));
    const hasPrimaryProduct = familyValidation.filteredProducts.some(product => product.isPrimary);
    const normalizedFilteredProducts = familyValidation.filteredProducts.map((product, index) => ({
        ...product,
        isPrimary: hasPrimaryProduct ? Boolean(product.isPrimary) : index === 0,
    }));
    const prunedImageUrls = Object.fromEntries(
        Object.entries(nextImageUrls).filter(([key]) => keepIds.has(String(key)))
    ) as Record<string, string>;
    const prunedVariants = Object.fromEntries(
        Object.entries(nextVariants).filter(([key]) => keepIds.has(String(key)))
    ) as Record<number, string[]>;

    let nextBlogPostData = params.blogPostData || undefined;
    if (nextBlogPostData?.productReviews?.length) {
        const filteredReviews = nextBlogPostData.productReviews.filter(review => keepIds.has(String(review.productId)));
        if (filteredReviews.length !== nextBlogPostData.productReviews.length) {
            nextBlogPostData = {
                ...nextBlogPostData,
                productReviews: filteredReviews,
            };
        }
    }

    return {
        productData: normalizedFilteredProducts,
        productImageUrls: prunedImageUrls,
        productImageVariants: prunedVariants,
        blogPostData: nextBlogPostData,
        changed: true,
        rejectedProducts: familyValidation.rejectedProducts,
        dominantTokens: familyValidation.dominantTokens,
    };
};

const candidatePreservesProductFamily = (
    targetProductId: number,
    candidateProduct: AmazonProduct,
    currentProducts: AmazonProduct[],
    articleTitle: string,
    blueprintType?: string | null
): boolean => {
    const mergedProducts = currentProducts.map(product => (
        product.id === targetProductId
            ? { ...product, ...candidateProduct, id: targetProductId }
            : product
    ));

    const validation = sanitizeProductFamilyAssets({
        productData: mergedProducts,
        articleTitle,
        blueprintType,
    });

    return !validation.rejectedProducts.some(product => product.id === targetProductId);
};

const stripHtmlToPlainText = (value: string): string =>
    String(value || '')
        .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
        .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
        .replace(/\[CONTENT_SECTION_IMAGE_\d+\]/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'")
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/\s+/g, ' ')
        .trim();

const normalizeHeadingLabel = (value: string): string =>
    stripHtmlToPlainText(value)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();

const deriveContentSectionsFromHtml = (blogPostData: BlogPostData | null | undefined): ContentSection[] => {
    if (!blogPostData) return [];
    if (Array.isArray(blogPostData.contentSections) && blogPostData.contentSections.length > 0) {
        return blogPostData.contentSections;
    }

    const html = String(blogPostData.htmlContent || '');
    if (!html) return [];

    const placeholderIds = Array.from(
        new Set(
            Array.from(html.matchAll(/\[CONTENT_SECTION_IMAGE_(\d+)\]/gi))
                .map(match => Number(match[1]))
                .filter(Number.isFinite)
        )
    ).sort((a, b) => a - b);

    if (!placeholderIds.length) return [];

    const sections: ContentSection[] = [];
    const seenIds = new Set<number>();
    const headingMatches = Array.from(html.matchAll(/<h2\b[^>]*>[\s\S]*?<\/h2>/gi));

    headingMatches.forEach((match, index) => {
        const start = match.index ?? 0;
        const end = index + 1 < headingMatches.length ? (headingMatches[index + 1].index ?? html.length) : html.length;
        const sectionHtml = html.slice(start, end);
        const sectionIds = Array.from(
            new Set(
                Array.from(sectionHtml.matchAll(/\[CONTENT_SECTION_IMAGE_(\d+)\]/gi))
                    .map(item => Number(item[1]))
                    .filter(Number.isFinite)
            )
        );

        if (!sectionIds.length) return;

        const title = stripHtmlToPlainText(match[0]) || `Section ${sectionIds[0]}`;
        const text = stripHtmlToPlainText(sectionHtml.replace(match[0], '')).slice(0, 1200);

        sectionIds.forEach(id => {
            if (seenIds.has(id)) return;
            seenIds.add(id);
            sections.push({
                id,
                title,
                text,
                image: `${title}. ${text.slice(0, 220)}`.trim(),
            });
        });
    });

    placeholderIds.forEach(id => {
        if (seenIds.has(id)) return;
        const fallbackText = stripHtmlToPlainText(html).slice(0, 220);
        sections.push({
            id,
            title: `Section ${id}`,
            text: fallbackText,
            image: `${blogPostData.title}. ${fallbackText}`.trim(),
        });
    });

    return sections.sort((a, b) => a.id - b.id);
};

const deriveRecipeStepPromptFromHtml = (
    blogPostData: BlogPostData | null | undefined,
    stepIndex: number
): string => {
    if (!blogPostData || stepIndex < 0) return '';

    const html = String(blogPostData.htmlContent || '');
    if (!html) return '';

    const stepNumber = stepIndex + 1;
    const placeholderPatterns = [
        new RegExp(`\\[STEP_IMAGE_\\s*${stepNumber}\\s*\\]`, 'i'),
        new RegExp(`<img[^>]*src="\\[STEP_IMAGE_\\s*${stepNumber}\\s*\\]"[^>]*>`, 'i'),
    ];

    let matchIndex = -1;
    for (const pattern of placeholderPatterns) {
        const match = pattern.exec(html);
        if (typeof match?.index === 'number') {
            matchIndex = match.index;
            break;
        }
    }

    if (matchIndex < 0) return '';

    const precedingWindow = html.slice(Math.max(0, matchIndex - 1400), matchIndex);
    const blockMatches = Array.from(precedingWindow.matchAll(/<(?:p|li)[^>]*>([\s\S]*?)<\/(?:p|li)>/gi));
    const recentBlocks = blockMatches
        .slice(-3)
        .map((item) => stripHtmlToPlainText(item[1] || ''))
        .filter(Boolean);

    if (recentBlocks.length > 0) {
        return recentBlocks.join('. ').trim();
    }

    return stripHtmlToPlainText(precedingWindow).slice(-280).trim();
};

const ensureContentSectionPlaceholders = (
    blogPostData: BlogPostData | null | undefined,
    blueprintType?: string | null
): BlogPostData | null | undefined => {
    if (!blogPostData) return blogPostData;

    const effectiveBlueprint = blueprintType || blogPostData.niche || '';
    if (!['review', 'roundup', 'howto'].includes(String(effectiveBlueprint).toLowerCase())) {
        return blogPostData;
    }

    const html = String(blogPostData.htmlContent || '');
    if (!html || /\[CONTENT_SECTION_IMAGE_\d+\]/i.test(html)) {
        return blogPostData;
    }

    const sourceSections = Array.isArray(blogPostData.contentSections) ? blogPostData.contentSections.filter(Boolean) : [];
    if (!sourceSections.length || typeof DOMParser === 'undefined') {
        return blogPostData;
    }

    try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(`<div id="pgp-root">${html}</div>`, 'text/html');
        const root = doc.getElementById('pgp-root');
        if (!root) return blogPostData;

        const headings = Array.from(root.querySelectorAll('h2, h3'));
        const claimedHeadings = new Set<Element>();
        const utilityHeadings = new Set([
            'introduction',
            'why choose this selection',
            'why choose',
            'how to choose',
            'amazon product comparison',
            'product comparison',
            'faq section',
            'faq',
            'conclusion',
        ]);

        const candidateHeadings = headings.filter(heading => !utilityHeadings.has(normalizeHeadingLabel(heading.textContent || '')));

        let fallbackIndex = 0;
        let insertedAny = false;

        sourceSections.slice(0, 5).forEach(section => {
            const placeholder = `[CONTENT_SECTION_IMAGE_${section.id}]`;
            const targetHeading =
                headings.find(heading =>
                    !claimedHeadings.has(heading) &&
                    normalizeHeadingLabel(heading.textContent || '') === normalizeHeadingLabel(section.title || '')
                ) ||
                candidateHeadings.find((heading, index) =>
                    index >= fallbackIndex && !claimedHeadings.has(heading)
                );

            if (!targetHeading) return;

            claimedHeadings.add(targetHeading);
            const siblingText = targetHeading.nextElementSibling?.textContent || '';
            if (siblingText.includes(placeholder)) return;

            const marker = doc.createElement('p');
            marker.textContent = placeholder;
            targetHeading.insertAdjacentElement('afterend', marker);
            insertedAny = true;

            const candidatePosition = candidateHeadings.indexOf(targetHeading);
            if (candidatePosition >= 0) {
                fallbackIndex = candidatePosition + 1;
            }
        });

        if (!insertedAny) return blogPostData;

        return {
            ...blogPostData,
            htmlContent: root.innerHTML.replace(/\n{3,}/g, '\n\n').trim(),
        };
    } catch {
        return blogPostData;
    }
};

const withDerivedContentSections = (
    blogPostData: BlogPostData | null | undefined,
    blueprintType?: string | null
): BlogPostData | null | undefined => {
    if (!blogPostData) return blogPostData;
    const withPlaceholders = ensureContentSectionPlaceholders(blogPostData, blueprintType) || blogPostData;
    const derivedSections = deriveContentSectionsFromHtml(withPlaceholders);
    if (!derivedSections.length) return blogPostData;
    return {
        ...withPlaceholders,
        contentSections: derivedSections,
    };
};

const looksLikeWeakImagePrompt = (value: string | undefined | null): boolean => {
    const normalized = String(value || '').trim();
    if (!normalized) return true;
    if (/^https?:\/\//i.test(normalized)) return true;
    if (/^[\w-]+\.(?:png|jpe?g|webp|gif|avif)$/i.test(normalized)) return true;
    if (/^[\w-]{6,}$/i.test(normalized) && normalized.includes('-')) return true;
    if (normalized.length < 18) return true;
    return false;
};

const buildEditorialHeroPrompt = (blogPostData: BlogPostData, productData: AmazonProduct[]): string => {
    const primaryProduct = productData.find(product => product.isPrimary) || productData[0];
    const subject = primaryProduct?.productName || blogPostData.title;
    const category = blogPostData.category || 'Product Reviews';
    const context = blogPostData.whyYoullLoveThis || blogPostData.seo?.metaDescription || '';

    return [
        `Premium editorial lifestyle hero image for "${blogPostData.title}".`,
        `Feature the product ${subject} in a realistic, polished setting related to ${category}.`,
        context,
        'Photorealistic, premium magazine quality, clean composition, natural lighting, no text, no watermark, no collage.'
    ].join(' ').replace(/\s+/g, ' ').trim();
};

const buildAmazonProductsHtml = (productDetailsArray: AmazonProductDetails[]): string => {
    const formattedHtml = productDetailsArray.map((productDetails, index) => `
        <div class="product-${index}">
            <h1 id="productTitle">${productDetails.title}</h1>
            <div id="feature-bullets">
                ${productDetails.features.map(f => `<li>${f}</li>`).join('')}
            </div>
            <div id="productDescription">
                <p>${productDetails.description}</p>
            </div>
            ${productDetails.price ? `<span class="price">${productDetails.price}</span>` : ''}
            ${productDetails.images && productDetails.images.length > 0 ? `<img src="${productDetails.images[0]}" alt="${productDetails.title}" />` : ''}
        </div>
    `).join('\n');

    return `
        <!DOCTYPE html>
        <html>
        <head><title>${productDetailsArray[0]?.title || 'Amazon Product'}</title></head>
        <body>
            ${formattedHtml}
        </body>
        </html>
    `;
};

const validateAmazonExtractedData = (data: any, fallbackAsin: string): void => {
    if (typeof data !== 'object' || !data) {
        throw new Error('Data is not an object');
    }

    let title = String(data.title || '').toLowerCase().trim();
    const badKeywords = ['unknown product', 'captcha', 'robot check', 'security check', 'something went wrong', 'serve', 'sorry', 'no results', 'page not found'];

    if (!title || title === 'amazon.com' || title === 'amazon.co.uk') {
        data.title = `Amazon Product (ASIN: ${fallbackAsin})`;
        title = data.title.toLowerCase();
    }

    const isKnownBad = badKeywords.some(keyword => title === keyword || title.includes(keyword));

    if (title.includes('amazon')
        && !title.includes('echo')
        && !title.includes('fire')
        && !title.includes('kindle')
        && !title.includes('basics')
        && !title.includes('prime')
        && !title.includes('asin:')) {
        throw new Error(`Suspicious title detected: "${data.title}".`);
    }

    const hasFeatures = (data.features && data.features.length > 0)
        || (data.ingredients && data.ingredients.length > 0)
        || (data.instructions && data.instructions.length > 0);
    const hasPrice = !!(data.price && String(data.price).trim());
    const hasDescription = !!(data.description && String(data.description).trim().length > 50);
    const hasStrongTitle = title.length > 20;
    const hasContent = hasFeatures || hasDescription || hasStrongTitle || hasPrice;

    if (isKnownBad) {
        throw new Error(`Detected generic/error page title: "${data.title}".`);
    }

    if (!hasContent) {
        throw new Error(`Insufficient data for "${data.title}".`);
    }

    if (title.length <= 10) {
        throw new Error(`Title "${data.title}" is too short.`);
    }
};

const defaultSessionData: AppSessionData = {
    inputVal: '',
    inputType: 'url',
    selectedBlueprint: 'recipe',
    wordpressConfig: { url: '', username: '', password: '', wooConsumerKey: '', wooConsumerSecret: '', featuredImageHandling: 'theme_default' },
    amazonConfig: { associateTag: 'yourtag-20', accessKey: '', secretKey: '', region: 'us-east-1' },
    aiConfig: {
        geminiApiKey: '',
        imageProvider: 'free_tier',
        productImageSource: 'amazon',
        huggingFaceApiKey: 'HUGGINGFACE_KEY_PLACEHOLDER',
        stockImageProvider: 'pexels',
        pexelsApiKey: 'pB9toP0OhRsE8PhMSOOuTXvc6mkK12QqGizPVyI6ZtcszrYz8SGPh4m9',
        pixabayApiKey: '41621152-ba3ea346ca0606ef077bd8646',
        unsplashApiKey: 'GlMwwwLk7e3GDpww2wESKV_NO5vDrnK6uT3IVVMXNwk'
    },
    styleConfig: defaultStyleConfig,
    blogPostData: null,
    originalBlogPostData: null,
    productData: [],
    heroImageUrl: '',
    stepImageUrls: {},
    productImageUrls: {},
    imageSelection: {},
    currentStep: AppStep.BlueprintSelection,
    ingredientAsins: [],
    articleId: null,
    articleStatus: null,
    imagesGenerated: false,
};

// CRITICAL FIX: Load config synchronously to prevent flash of default settings
const loadInitialData = (): AppSessionData => {
    if (typeof window === 'undefined') return defaultSessionData;
    try {
        const saved = localStorage.getItem('postgenius_config');
        if (saved) {
            const parsed = JSON.parse(saved);
            return {
                ...defaultSessionData,
                wordpressConfig: parsed.wordpressConfig || defaultSessionData.wordpressConfig,
                amazonConfig: parsed.amazonConfig || defaultSessionData.amazonConfig,
                aiConfig: parsed.aiConfig || defaultSessionData.aiConfig,
                // Ensure styleConfig is loaded, falling back to default only if missing in storage
                styleConfig: parsed.styleConfig || defaultSessionData.styleConfig,
            };
        }
    } catch (e) {
        console.error("Failed to load local config synchronously", e);
    }
    return defaultSessionData;
};

const HomePage: React.FC<{ onStart: () => void }> = () => <LandingPage />;

const ProtectedRoute: React.FC<{ user: User | null; children: React.ReactElement }> = ({ user, children }) => {
    return user ? children : <Navigate to="/login" replace />;
};
const AdminRoute: React.FC<{ userRole: 'admin' | 'user'; children: React.ReactElement }> = ({ userRole, children }) => {
    return userRole === 'admin' ? children : <Navigate to="/dashboard" replace />;
};
const ProRoute: React.FC<{ userProfile: UserProfile | null; children: React.ReactElement }> = ({ userProfile, children }) => {
    if (!userProfile) return <Navigate to="/login" replace />;
    const isPro = userProfile.subscription_tier === 'pro' || userProfile.subscription_tier === 'premium';
    return isPro ? children : <Navigate to="/pricing" replace />;
};
const PremiumRoute: React.FC<{ userProfile: UserProfile | null; children: React.ReactElement }> = ({ userProfile, children }) => {
    if (!userProfile) return <Navigate to="/login" replace />;
    const isPremium = userProfile.subscription_tier === 'premium';
    return isPremium ? children : <Navigate to="/pricing" replace />;
};

function App() {
    const navigate = useNavigate();
    const [session, setSession] = useState<Session | null>(null);
    const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
    const [articleLimitInfo, setArticleLimitInfo] = useState<ArticleLimitInfo | null>(null);
    const [isGenerating, setIsGenerating] = useState(false);
    const [statusMessage, setStatusMessage] = useState<string>('');
    const [error, setError] = useState<string | null>(null);
    const [saveStatus, setSaveStatus] = useState('');

    // CRITICAL FIX: Lazy Initialization ensures localStorage is read fresh on every mount/refresh.
    // Passing a function to useState ensures it runs during the initial render of the component instance.
    const [appData, setAppData] = useState<AppSessionData>(() => loadInitialData());

    const [loadingImages, setLoadingImages] = useState<Set<string>>(new Set());
    const [isUploadingImage, setIsUploadingImage] = useState(false);
    const [score, setScore] = useState<number | null>(null);
    const [feedback, setFeedback] = useState<ScoreFeedback[]>([]);
    const [isScoring, setIsScoring] = useState(false);
    const isGeneratingRef = useRef(false); // Ref to track generation status synchronously and prevent race conditions

    // --- Stock Image Picker State ---
    const [isPickerOpen, setIsPickerOpen] = useState(false);
    const [pickerKey, setPickerKey] = useState<string>('');
    const [pickerPrompt, setPickerPrompt] = useState<string>('');
    const [pickerCandidates, setPickerCandidates] = useState<any[]>([]);
    const [isPickerLoading, setIsPickerLoading] = useState(false);
    // --------------------------------

    const user = session?.user || null;
    const userRole = (userProfile?.role === 'admin' || user?.email === 'larbilife@gmail.com') ? 'admin' : 'user';

    const { usageCount, isBlocked, incrementUsage, remainingArticles, resetDate } = useUsageTracker(
        userRole,
        userProfile
    );
    const [publishingStatus, setPublishingStatus] = useState<PublishingStatus>(PublishingStatus.Idle);
    const [publishingProgress, setPublishingProgress] = useState<PublishingProgress>({ message: '', logs: [] });
    const [publishError, setPublishError] = useState<string | null>(null);
    const [newPostLink, setNewPostLink] = useState<string | null>(null);
    const [newPostId, setNewPostId] = useState<number | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitStatus, setSubmitStatus] = useState('');


    // CRITICAL: Inject CSS variables immediately when appData changes, including on first render
    useLayoutEffect(() => {
        if (appData.styleConfig) {
            const root = document.documentElement;
            // Apply Primary Color (CTAs, Highlights)
            root.style.setProperty('--color-cta', appData.styleConfig.custom_primary_color);
            root.style.setProperty('--pgp-primary-color', appData.styleConfig.custom_primary_color);

            // Apply Secondary Color (Accents, Links)
            root.style.setProperty('--color-accent', appData.styleConfig.custom_secondary_color);
            root.style.setProperty('--pgp-secondary-color', appData.styleConfig.custom_secondary_color);

            // Apply Fonts
            if (appData.styleConfig.custom_font_family) {
                root.style.setProperty('--font-sans', appData.styleConfig.custom_font_family);
                root.style.setProperty('--pgp-font-family', appData.styleConfig.custom_font_family);
            }
        }
    }, [appData.styleConfig]);

    useEffect(() => {
        let mounted = true;

        const fetchProfile = async (userId: string) => {
            if (!mounted) return;
            try {
                // Use custom API to get profile
                const { api } = await import('./services/apiClient');
                const data = await api.get(`/auth.php?action=getProfile&id=${userId}`);

                if (data && !data.error) {
                    setUserProfile(data);
                    // Merge DB settings with local settings to preserve API keys not stored in DB
                    if (data.style_config) {
                        setAppData(prev => ({ ...prev, styleConfig: data.style_config }));

                        // Update localStorage to keep it in sync for next refresh
                        try {
                            const currentLS = localStorage.getItem('postgenius_config');
                            const parsedLS = currentLS ? JSON.parse(currentLS) : {};
                            localStorage.setItem('postgenius_config', JSON.stringify({
                                ...parsedLS,
                                styleConfig: data.style_config
                            }));
                        } catch (e) { console.error("Error syncing profile style to localStorage", e); }
                    }
                } else {
                    console.warn("Profile not found or error:", data?.error);
                    setUserProfile(null);
                }
                // Fetch limit info whenever profile updates
                checkArticleLimit().then(setArticleLimitInfo).catch(console.error);
            } catch (e) {
                console.error("Failed to fetch profile", e);
            }
        };

        const initSession = async () => {
            const token = localStorage.getItem('auth_token');
            const userDataStr = localStorage.getItem('user_data');

            if (token && userDataStr) {
                try {
                    const user = JSON.parse(userDataStr);
                    // Construct a mock session object compatible with existing types
                    const mockSession: Session = {
                        access_token: token,
                        token_type: 'bearer',
                        expires_in: 3600,
                        refresh_token: '',
                        user: {
                            id: user.id,
                            email: user.email,
                            aud: 'authenticated',
                            created_at: new Date().toISOString()
                        }
                    };

                    if (mounted) {
                        setSession(mockSession);
                        fetchProfile(user.id);
                    }
                } catch (e) {
                    console.error("Error parsing user data", e);
                    localStorage.removeItem('auth_token');
                    localStorage.removeItem('user_data');
                }
            } else {
                if (mounted) {
                    setSession(null);
                    setUserProfile(null);
                }
            }
        };

        initSession();

        // Listen for storage events to handle login/logout across tabs or from AuthPage
        const handleStorageChange = () => {
            initSession();
        };
        window.addEventListener('storage', handleStorageChange);

        return () => {
            mounted = false;
            window.removeEventListener('storage', handleStorageChange);
        };
    }, []);

    useEffect(() => {
        const loadLocalConfig = () => {
            try {
                const saved = localStorage.getItem('postgenius_config');
                if (saved) {
                    const parsed = JSON.parse(saved);
                    setAppData(prev => ({
                        ...prev,
                        wordpressConfig: parsed.wordpressConfig || prev.wordpressConfig,
                        amazonConfig: parsed.amazonConfig || prev.amazonConfig,
                        aiConfig: parsed.aiConfig || prev.aiConfig,
                        styleConfig: parsed.styleConfig || prev.styleConfig
                    }));
                }
            } catch (e) {
                console.error("Failed to load local config", e);
            }
        };
        loadLocalConfig();

        // Key syncing system removed - using Master Gateway approach
        console.log('[PostGenius] Master Gateway system initialized');
    }, []);

    // ... rest of component methods (unchanged)
    const fetchUrlContent = async (url: string): Promise<string> => {
        try {
            // Check if this is an Amazon URL and PAAPI is configured
            const isAmazonUrl = url.includes('amazon.com') || url.includes('amazon.co');

            if (isAmazonUrl) {
                // Use the full Amazon fallback chain for Amazon URLs
                try {
                    const asin = extractASINFromUrl(url);
                    if (asin) {
                        console.log(`[Amazon URL] Detected ASIN: ${asin}. Fetching via Amazon fallback chain...`);
                        const productDetails = await getAmazonProductData(asin, appData.amazonConfig);
                        console.log(`[Amazon URL] Product details fetched successfully via ${productDetails.source || 'live source'}`);
                        return buildAmazonProductsHtml([productDetails]);
                    }
                } catch (paapiError: any) {
                    console.warn('[Amazon URL] Structured Amazon fallback failed, continuing to generic URL fetch:', paapiError.message);
                    // Continue to CORS proxy fallback below
                }
            }


            const parseProxyContent = async (response: Response, parser: 'text' | 'allorigins' = 'text'): Promise<string> => {
                if (parser === 'allorigins') {
                    const payload = await response.json().catch(() => null);
                    return String(payload?.contents || '').trim();
                }
                return (await response.text()).trim();
            };

            const normalizeScrapedContent = (content: string, source: string): string => {
                const normalized = String(content || '').trim();
                if (!normalized || normalized.length < 500) {
                    throw new Error(`${source} returned insufficient content`);
                }
                if (/Type the characters you see below|captchacharacters|Robot Check/i.test(normalized)) {
                    throw new Error(`${source} returned an anti-bot challenge`);
                }
                return normalized;
            };

            const isSameOrigin = (() => {
                try {
                    return new URL(url).origin === window.location.origin;
                } catch {
                    return false;
                }
            })();

            if (isSameOrigin) {
                try {
                    console.log('[Scrape] Trying direct fetch (same-origin)...');
                    const response = await fetch(url, {
                        method: 'GET',
                        headers: {
                            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                        },
                    });

                    if (response.ok) {
                        const content = normalizeScrapedContent(await response.text(), 'direct fetch');
                        console.log(`[Scrape] Success via direct fetch (${content.length} chars)`);
                        return content;
                    }

                    console.warn(`[Scrape] Direct fetch returned ${response.status}`);
                } catch (error: any) {
                    console.warn('[Scrape] Direct fetch failed:', error?.message);
                }
            } else {
                console.log('[Scrape] Skipping direct fetch (cross-origin/CORS). Using proxies...');
            }

            // Default: Prefer PostGenius internal proxy paths before public fallbacks
            const proxies: Array<{ name: string; parser?: 'text' | 'allorigins'; url: (u: string) => string }> = [
                { name: 'PrivateProxy', parser: 'text', url: (u: string) => `/api/proxy.php?url=${encodeURIComponent(u)}` },
                { name: 'PostGeniusProxyRoot', parser: 'text', url: (u: string) => `https://postgeniuspro.com/api/proxy.php?url=${encodeURIComponent(u)}` },
                { name: 'PostGeniusProxy', parser: 'text', url: (u: string) => `https://www.postgeniuspro.com/api/proxy.php?url=${encodeURIComponent(u)}` },
                { name: 'JinaReader', parser: 'text', url: (u: string) => `https://r.jina.ai/${u}` },
                { name: 'AllOrigins', parser: 'allorigins', url: (u: string) => `https://api.allorigins.win/get?url=${encodeURIComponent(u)}` },
                { name: 'CorsProxy', parser: 'text', url: (u: string) => `https://corsproxy.io/?${encodeURIComponent(u)}` },
                { name: 'ThingProxy', parser: 'text', url: (u: string) => `https://thingproxy.freeboard.io/fetch/${u}` }
            ];

            let lastError: Error | null = null;

            for (const proxy of proxies) {
                try {
                    console.log(`[Scrape] Trying ${proxy.name} for: ${url}`);
                    const proxyUrl = proxy.url(url);
                    const response = await fetch(proxyUrl, { method: 'GET' });

                    if (!response.ok) {
                        console.warn(`[Scrape] ${proxy.name} returned ${response.status}`);
                        lastError = new Error(`${proxy.name} returned ${response.status}`);
                        continue;
                    }
                    const content = normalizeScrapedContent(
                        await parseProxyContent(response, proxy.parser || 'text'),
                        proxy.name
                    );

                    console.log(`[Scrape] Success via ${proxy.name} (${content.length} chars)`);
                    return content;

                } catch (error: any) {
                    console.warn(`[Scrape] ${proxy.name} error:`, error?.message);
                    lastError = error instanceof Error
                        ? error
                        : new Error(String(error?.message || error || 'Unknown scrape error'));
                }
            }

            // All proxies failed
            throw new Error(lastError?.message || "Could not read content from the URL. The website might block automated access.");
        } catch (error: any) {
            console.error("URL Fetch Error:", error);
            throw new Error(error?.message || "Could not read content from the URL. The website might block automated access.");
        }
    };
    const extractGeneratedImageUrl = (payload: any): string => {
        const first = payload?.images?.[0] || payload?.data?.[0] || payload?.image || null;
        const directUrl = String(first?.url || payload?.url || payload?.newImageUrl || '').trim();
        if (directUrl) return directUrl;

        const base64 = String(first?.base64 || first?.b64_json || payload?.base64 || payload?.b64_json || '').trim();
        if (base64) {
            return base64.startsWith('data:image/') ? base64 : `data:image/png;base64,${base64}`;
        }

        throw new Error('Image response did not include a usable URL or base64 payload.');
    };

    const isInvalidGeneratedImageUrl = (value: string): boolean => {
        const normalized = String(value || '').trim();
        if (!normalized) return true;
        if (!normalized.startsWith('data:image/svg+xml')) return false;

        try {
            const decoded = decodeURIComponent(normalized);
            return /image fallback|image generation pending|generation failed|placeholder/i.test(decoded);
        } catch {
            return true;
        }
    };

    const generateArticleVisual = async ({
        prompt,
        kind,
        articleTitle,
        subjectId,
        subjectName,
        blueprint,
        aiConfig,
    }: {
        prompt: string;
        kind: 'hero' | 'step' | 'section' | 'product';
        articleTitle: string;
        subjectId?: string;
        subjectName?: string;
        blueprint: string;
        aiConfig: AiConfig;
    }): Promise<string> => {
        const trimmedPrompt = String(prompt || '').trim();
        if (trimmedPrompt.length < 3) {
            throw new Error('Image prompt is too short.');
        }

        const apiKey = aiConfig.geminiApiKey;
        const useGemini = aiConfig.imageProvider === 'gemini' && apiKey;
        const authToken = typeof localStorage !== 'undefined' ? (localStorage.getItem('auth_token') || '') : '';

        let editorialPrompt = trimmedPrompt;
        if (kind === 'product') {
            editorialPrompt = [
                `Premium editorial lifestyle photography of ${subjectName || trimmedPrompt}.`,
                `Article context: "${articleTitle}".`,
                'Show the product naturally in use or styled in a realistic home or work setting.',
                'Photorealistic, premium magazine quality, clean composition, no text, no watermark, no collage.'
            ].join(' ');
        } else if (kind === 'section') {
            editorialPrompt = [
                `Premium editorial lifestyle still life for "${subjectName || 'section'}" in the article "${articleTitle}".`,
                trimmedPrompt,
                'Photorealistic, realistic materials, balanced composition, no text, no watermark, no collage.'
            ].join(' ');
        } else if (kind === 'step') {
            editorialPrompt = `${articleTitle}: ${trimmedPrompt}`;
        }

        if (authToken && (kind === 'product' || kind === 'section')) {
            try {
                const nvidiaResponse = await api.post('/nvidia/generate-images/', {
                    productName: subjectName || articleTitle || 'Product review visual',
                    productDescription: editorialPrompt,
                    usageContext: articleTitle,
                    imageCount: 1,
                    cfgScale: 5,
                    steps: 40,
                    enhancePrompt: true,
                    enableThinking: false,
                    negativePrompt: 'cartoon, anime, illustration, cgi, blurry, watermark, text, logo, collage',
                    imageSpecs: [
                        {
                            role: 'image',
                            aspectRatio: '16:9',
                        }
                    ],
                });

                const nvidiaUrl = extractGeneratedImageUrl(nvidiaResponse);
                if (!isInvalidGeneratedImageUrl(nvidiaUrl)) {
                    return nvidiaUrl;
                }
                console.warn(`[Image Regen] NVIDIA returned placeholder/fallback image for ${kind}.`);
            } catch (nvidiaError: any) {
                console.warn(`[Image Regen] NVIDIA lifestyle fallback failed for ${kind}:`, nvidiaError.message || nvidiaError);
            }
        }

        try {
            const regenerateResponse = await api.post('/regenerate-image.php', {
                type: kind === 'product' ? 'product' : kind === 'hero' ? 'hero' : 'step',
                id: subjectId || kind,
                prompt: editorialPrompt,
                forceNewKey: true,
            });

            if (regenerateResponse?.success && regenerateResponse?.newImageUrl) {
                const gatewayUrl = String(regenerateResponse.newImageUrl);
                if (!isInvalidGeneratedImageUrl(gatewayUrl)) {
                    return gatewayUrl;
                }
                console.warn(`[Image Regen] Gateway returned placeholder/fallback image for ${kind}.`);
            }
        } catch (regenError: any) {
            console.warn(`[Image Regen] Gateway fallback failed for ${kind}:`, regenError.message || regenError);
        }

        if (useGemini) {
            try {
                const geminiUrl = await generateWithGemini(editorialPrompt, kind === 'section' ? 'step' : kind, blueprint, {}, apiKey);
                if (!isInvalidGeneratedImageUrl(geminiUrl)) {
                    return geminiUrl;
                }
                console.warn(`[Image Regen] Gemini returned placeholder/fallback image for ${kind}.`);
            } catch (geminiError: any) {
                console.warn(`Gemini regeneration failed for ${kind}, falling back to priority chain:`, geminiError.message);
            }
        } else if (aiConfig.imageProvider === 'deepai') {
            try {
                const deepAiUrl = await generateImageWithDeepAI(
                    editorialPrompt,
                    kind === 'section' ? 'step' : kind,
                    blueprint,
                    { apiKey: aiConfig.deepaiApiKey }
                );
                if (!isInvalidGeneratedImageUrl(deepAiUrl)) {
                    return deepAiUrl;
                }
                console.warn(`[Image Regen] DeepAI returned placeholder/fallback image for ${kind}.`);
            } catch (deepAiError: any) {
                if (deepAiError instanceof ImageRateLimitError) {
                    alert(`Rate limit hit. Try again in ${deepAiError.retryAfter} seconds.`);
                    throw deepAiError;
                }
                console.warn(`DeepAI regeneration failed for ${kind}, falling back to priority chain:`, deepAiError.message);
            }
        }

        return await generateImageWithPriorityChain({
            prompt: editorialPrompt,
            type: kind === 'section' ? 'step' : kind,
            blueprint,
            aiConfig,
            preferredAspectRatio: kind === 'product' ? '1:1' : '16:9',
            allowNvidia: Boolean(authToken),
            preferNvidiaForStep: kind === 'step',
            authToken,
            nvidiaPayload: {
                productName: subjectName || articleTitle || 'Product review visual',
                productDescription: editorialPrompt,
                usageContext: articleTitle,
                imageCount: 1,
                cfgScale: 5,
                steps: 40,
                enhancePrompt: true,
                enableThinking: false,
                negativePrompt: 'cartoon, anime, illustration, cgi, blurry, watermark, text, logo, collage',
                imageSpecs: [
                    {
                        role: kind === 'product' ? 'product' : kind === 'hero' ? 'hero' : 'step',
                        aspectRatio: kind === 'product' ? '1:1' : '16:9',
                    }
                ],
            },
        });
    };

    const generateImagesForContent = async (
        blogPostData: BlogPostData,
        productData: AmazonProduct[],
        aiConfig: AiConfig,
        skipProductIds: Set<number> = new Set(),
        existingStepImageUrls: Record<string, string> = {},
        existingProductImageUrls: Record<string, string> = {}
    ) => {

        console.log('[Auto-Gen] Starting parallel image generation...');
        const tasks: Promise<any>[] = [];
        const contentSections = deriveContentSectionsFromHtml(blogPostData);

        if (blogPostData.steps) {
            blogPostData.steps.forEach((step, i) => {
                const key = `step_${i}`;
                if (existingStepImageUrls[String(i)] || existingStepImageUrls[i]) return;

                tasks.push((async () => {
                    setLoadingImages(prev => new Set(prev).add(key));
                    try {
                        const url = await generateArticleVisual({
                            prompt: step.text,
                            kind: 'step',
                            articleTitle: blogPostData.title,
                            subjectId: String(i),
                            subjectName: `Step ${i + 1}`,
                            blueprint: blogPostData?.niche || 'general',
                            aiConfig,
                        });
                        setAppData(prev => ({
                            ...prev,
                            stepImageUrls: { ...prev.stepImageUrls, [i]: url }
                        }));
                    } catch (e: any) {
                        console.error(`Failed to generate step image ${i}:`, e.message || e);
                    } finally {
                        setLoadingImages(prev => { const n = new Set(prev); n.delete(key); return n; });
                    }
                })());
            });
        }

        if (contentSections.length) {
            contentSections.forEach((section) => {
                const key = `section_${section.id}`;
                if (existingStepImageUrls[`section_${section.id}`]) return;

                tasks.push((async () => {
                    setLoadingImages(prev => new Set(prev).add(key));
                    try {
                        const basePrompt = section.image || section.title;
                        const contextualPrompt = `${basePrompt}. ${section.text?.slice(0, 220) || ''}`.trim();
                        const url = await generateArticleVisual({
                            prompt: contextualPrompt,
                            kind: 'section',
                            articleTitle: blogPostData.title,
                            subjectId: String(section.id),
                            subjectName: section.title,
                            blueprint: blogPostData?.niche || 'general',
                            aiConfig,
                        });
                        setAppData(prev => ({
                            ...prev,
                            stepImageUrls: { ...prev.stepImageUrls, [`section_${section.id}`]: url }
                        }));
                    } catch (e: any) {
                        console.error(`Failed to generate section image ${section.id}:`, e.message || e);
                    } finally {
                        setLoadingImages(prev => { const n = new Set(prev); n.delete(key); return n; });
                    }
                })());
            });
        }

        productData.forEach((product) => {
            if (skipProductIds.has(product.id)) return;
            const existingUrl = String(
                existingProductImageUrls[String(product.id)]
                || existingProductImageUrls[product.id]
                || ''
            ).trim();
            if (isAmazonHostedImage(existingUrl) || isPlatformHostedImage(existingUrl)) return;
            const amazonImage = resolveAmazonProductImage(product, existingProductImageUrls, '600x600');
            if (!amazonImage) return;

            setAppData(prev => ({
                ...prev,
                productImageUrls: { ...prev.productImageUrls, [product.id]: amazonImage }
            }));
        });

        await Promise.allSettled(tasks);
        console.log(`[Auto-Gen] Completed ${tasks.length} image generation tasks.`);
    };

    const generateRemainingImagesInBackground = async (
        blogPostData: BlogPostData,
        productData: AmazonProduct[],
        aiConfig: AiConfig,
        skipProductIds: Set<number> = new Set(),
        existingStepImageUrls: Record<string, string> = {},
        existingProductImageUrls: Record<string, string> = {}
    ) => {
        await generateImagesForContent(
            blogPostData,
            productData,
            aiConfig,
            skipProductIds,
            existingStepImageUrls,
            existingProductImageUrls
        );
    };

    const handleSwapImage = async (imageKey: string) => {
        if (!appData.blogPostData) return;

        setPickerKey(imageKey);
        setIsPickerOpen(true);
        setIsPickerLoading(true);
        setPickerCandidates([]);

        try {
            // 1. Determine prompt based on key
            let promptToSearch = '';

            if (imageKey === 'hero') {
                promptToSearch = appData.blogPostData.title;
            } else if (imageKey.startsWith('step_')) {
                const index = parseInt(imageKey.replace('step_', ''));
                if (appData.blogPostData.steps && appData.blogPostData.steps[index]) {
                    promptToSearch = appData.blogPostData.steps[index].text;
                }
            } else if (imageKey.startsWith('section_')) {
                const id = parseInt(imageKey.replace('section_', ''));
                const section = deriveContentSectionsFromHtml(appData.blogPostData).find(item => item.id === id);
                if (section) {
                    promptToSearch = `${section.title} ${section.text?.slice(0, 140) || ''}`.trim();
                }
            } else if (imageKey.startsWith('product_')) {
                const id = parseInt(imageKey.replace('product_', ''));
                const product = appData.productData.find(p => p.id === id);
                if (product) promptToSearch = product.productName;
            }

            // Clean prompt for search
            const cleanQuery = promptToSearch
                .split(':')[0] // Remove "Step 1:" prefix if exists
                .replace(/^Step \d+[:.]?/i, '')
                .replace(/^Action shot of/i, '')
                .replace(/^Close-up of/i, '')
                .slice(0, 100) // Truncate for API safety
                .trim();

            setPickerPrompt(cleanQuery);

            // 2. Search Stock Images (Get 6 candidates)
            const results = await searchStockImages(cleanQuery, appData.styleConfig, 6);
            setPickerCandidates(results);

        } catch (e: any) {
            console.error("Stock search failed", e);
            alert("Failed to search stock images: " + e.message);
        } finally {
            setIsPickerLoading(false);
        }
    };

    const handlePickerSelect = (url: string) => {
        if (!pickerKey) return;

        // Update the image URL in state
        setAppData(prev => {
            const newStepImages = { ...prev.stepImageUrls };
            const newProductImages = { ...prev.productImageUrls };
            let newHero = prev.heroImageUrl;

            if (pickerKey === 'hero') {
                newHero = url;
            } else if (pickerKey.startsWith('step_') || pickerKey.startsWith('section_')) {
                // Determine index or key
                let keyToUpdate = pickerKey;
                if (pickerKey.startsWith('step_')) {
                    // Normalize step key to array index format if needed, OR keep as string map
                    // Our appData uses stepImageUrls as Record<string, string> where key is index (0, 1, 2)
                    // But Wait, stepImageUrls is Record<string, string>
                    const index = pickerKey.replace('step_', '');
                    newStepImages[index] = url;
                } else {
                    newStepImages[pickerKey] = url;
                }
            } else if (pickerKey.startsWith('product_')) {
                const id = pickerKey.replace('product_', '');
                newProductImages[id] = url;
            }

            return {
                ...prev,
                heroImageUrl: newHero,
                stepImageUrls: newStepImages,
                productImageUrls: newProductImages
            };
        });

        setIsPickerOpen(false);
    };

    const handlePickerGenerateAi = () => {
        // Just close picker and trigger standard regeneration
        setIsPickerOpen(false);
        handleRegenerateImage(pickerKey);
    };

    const handleGenerate = async () => {
    console.log('[handleGenerate] Clicked');

    // CRITICAL FIX: Synchronous check to prevent double-submissions
    if (isGeneratingRef.current) {
        console.warn('[handleGenerate] Blocked concurrent generation request.');
        return;
    }

    console.log('[handleGenerate] User Role:', userRole);
    console.log('[handleGenerate] Input Value:', appData.inputVal);

    // Lock immediately
    isGeneratingRef.current = true;

    if (!appData.inputVal.trim()) {
        console.log('[handleGenerate] Input value is empty');
        isGeneratingRef.current = false; // Release lock
        return;
    }

    // Check article limit before starting generation
    try {
        const limitInfo = await checkArticleLimit();
        console.log('[handleGenerate] Limit check:', limitInfo);

        if (!limitInfo.allowed) {
            console.warn('[handleGenerate] Monthly limit reached. Blocking generation.');

            // BLOCK generation and show upgrade message
            setStatusMessage('⚠️ Monthly limit reached! You have used all 10 free articles this month. Upgrade to Premium for unlimited articles.');

            // Show alert to user
            alert('📊 Monthly Limit Reached!\n\nYou have used all 10 free articles this month.\n\nUpgrade to Premium for:\n✅ Unlimited articles\n✅ Priority AI processing\n✅ Advanced features\n\nContact support to upgrade!');

            isGeneratingRef.current = false; // Release lock
            setIsGenerating(false);
            return; // STOP here - do not proceed
        }
    } catch (limitError: any) {
        console.error('[handleGenerate] Failed to check limit:', limitError);
        // If limit check fails, allow generation (fail open for better UX)
    }

    console.log('[handleGenerate] Starting generation...');
    setIsGenerating(true);
    setAppData(prev => ({ ...prev, currentStep: AppStep.Generating }));
    setStatusMessage('Initializing AI models...');
    setStatusMessage('Initializing AI models...');
    setError(null);

    // Prepare config (Check for Beast Mode override again to be safe/consistent)
    // We re-check the limit here or just assume if we passed the block above, we are good.
    // Actually, let's just make a derived config.
    const effectiveAiConfig = { ...appData.aiConfig };

    // Re-check limit synchronously if possible? No, we just did it. 
    // Let's assume we want to force it if limit was hit. 
    // Note: The previous block didn't save the state. We should checking 'limitInfo' result if we had it in scope.
    // Simplified approach: Re-check limit service or just rely on the fact we proceed. 

    // BETTER: Let's assume we are in "Free Mode" if the user has no API key OR if limit is hit.
    // But here we just want to ensure we pass the config. 

    // Let's re-run a quick check or just use a flag?
    // We can't share variables easily between the try/catch block above and here due to scope.
    // Let's just define effectiveAiConfig logic here properly.

    // For now, we pass the raw config. The Service will handle 'useBeastMode' if we set it.
    // BUT we didn't set it in the previous block because of scope! 
    // FIX: Let's move the `limitInfo` check variable to outer scope.

    try {
        const apiKey = appData.aiConfig.geminiApiKey || '';

        let extractedData: ExtractedRecipeData | string = appData.inputVal;
        const isInputUrl = isValidUrl(appData.inputVal);
        const detectedAsins = appData.selectedBlueprint === 'review'
            ? extractValidAsins(appData.inputVal)
            : [];
        const isInputASIN = appData.inputType === 'asin' || detectedAsins.length > 0;

        // Handle ASIN input with the same Amazon fallback chain used by the live automation path.
        if (isInputASIN) {
            setStatusMessage('Fetching product details from Amazon...');

            try {
                // Extract ASINs from input (could be single or comma-separated)
                const asins = detectedAsins.length > 0
                    ? detectedAsins
                    : appData.inputVal
                        .trim()
                        .split(',')
                        .map(a => a.trim().toUpperCase())
                        .filter(a => /^[B0-9][A-Z0-9]{9}$/.test(a));

                if (asins.length === 0) {
                    throw new Error("No valid ASINs found. ASINs should be 10 characters (e.g., B005ETDKEA). For multiple ASINs, separate with commas.");
                }

                console.log(`[ASIN Input] Found ${asins.length} valid ASIN(s):`, asins);

                const productDetailsArray = await Promise.all(
                    asins.map(asin => getAmazonProductData(asin, appData.amazonConfig))
                );

                const fullHtml = buildAmazonProductsHtml(productDetailsArray);
                console.log('[ASIN Input] Product details fetched successfully');
                extractedData = await extractDataFromUrlWithGemini(fullHtml, apiKey);
                if (typeof extractedData === 'object') {
                    validateAmazonExtractedData(extractedData, asins[0]);
                }
            } catch (asinError: any) {
                console.error('[ASIN Input] Amazon product resolution failed:', asinError);
                const message = asinError?.message || 'Unknown error';
                if (/Gemini API key is required/i.test(message)) {
                    throw new Error(message);
                }
                throw new Error(`Failed to fetch product data for the provided ASINs. ${message}`);
            }
        }
        // Handle URL input
        // Handle URL input
        else if (isInputUrl && appData.inputVal.startsWith('http')) {
            try {
                // Special handling for Amazon URLs to leverage robust ASIN scraping
                const { extractASINFromUrl } = await import('./services/amazonService');
                const detectedAsin = extractASINFromUrl(appData.inputVal);

                if (detectedAsin) {
                    console.log(`[App] Amazon URL detected with ASIN: ${detectedAsin}. Routing to strict ASIN logic.`);
                    setStatusMessage('Amazon product detected. Fetching verified details...');

                    // This path now uses the shared Amazon fallback chain instead of legacy public CORS proxies.

                    try {
                        const productDetails = await getAmazonProductData(detectedAsin, appData.amazonConfig);
                        extractedData = await extractDataFromUrlWithGemini(buildAmazonProductsHtml([productDetails]), apiKey);

                        if (typeof extractedData === 'object') {
                            validateAmazonExtractedData(extractedData, detectedAsin);
                        }

                        console.log(`[App] Amazon fallback chain succeeded for ${detectedAsin} via ${productDetails.source || 'live source'}`);
                    } catch (amazonError: any) {
                        console.error(`[App] Amazon product resolution failed for ${detectedAsin}:`, amazonError);
                        const message = amazonError?.message || 'Please try again later.';
                        if (/Gemini API key is required/i.test(message)) {
                            throw new Error(message);
                        }
                        throw new Error(`Could not retrieve product name or details. ${message}`);

                    }
                    /*
                            for (const proxy of proxies) {
                                try {
                                    console.log(`[Scrape] Trying ${proxy.name} for Amazon product...`);
                                    const proxyUrl = proxy.url(amazonUrl);
                                    const response = await fetch(proxyUrl);

                                    if (!response.ok) {
                                        console.warn(`[Scrape] ${proxy.name} returned ${response.status}`);
                                        continue;
                                    }

                                    let content: string;

                                    if (proxy.name === 'AllOrigins') {
                                        const data = await response.json();
                                        if (!data.contents) continue;
                                        content = data.contents;
                                    } else {
                                        content = await response.text();
                                    }

                                    // Validate content
                                    if (!content || content.length < 1000) {
                                        console.warn(`[Scrape] ${proxy.name} returned insufficient content (${content?.length} chars)`);
                                        continue;
                                    }

                                    console.log(`[Scrape] ✅ Success via ${proxy.name} (${content.length} chars)`);
                                    scrapedContent = content;
                                    break;

                                } catch (error: any) {
                                    console.warn(`[Scrape] ${proxy.name} error:`, error.message);
                                }
                            }

                            if (!scrapedContent) {
                                throw new Error("All proxies failed to scrape the Amazon product page");
                            }

                            // Extract data using Gemini
                            const { extractDataFromUrl } = await import('./services/geminiService');
                            const scrapedData = await extractDataFromUrl(scrapedContent, apiKey);

                            if (scrapedData && scrapedData.title && scrapedData.title.length > 10) {
                                console.log(`[App] ✅ Scraping successful. Product: "${scrapedData.title}"`);
                                extractedData = scrapedData;
                            } else {
                                throw new Error("Failed to extract valid product data from scraped content");
                            }

                        } catch (scrapeError) {
                            console.error(`[App] Scraping fallback failed: ${scrapeError}`);
                            throw new Error("Could not retrieve product name or details. Please check the URL or try again later.");
                        }

                    } // Close paapiError catch block

                    */
                } else {
                    // Standard URL handling for non-Amazon sites
                    // PHASE 7: Hashbrown.dev Integration (Extraction Gateway)
                    const hbKey = appData.aiConfig.hashbrownApiKey;
                    let hbSuccess = false;

                    if (hbKey) {
                        try {
                            setStatusMessage('⚡ Hashbrown Engine: Extracting structured recipe...');
                            console.log('[App] Attempting Hashbrown extraction (Agent Mode)...');
                            // We use the Gemini Key for the Transport, enabled by the Hashbrown feature flag
                            extractedData = await extractRecipeFromHashbrown(appData.inputVal, apiKey);
                            hbSuccess = true;
                            console.log('[App] ✅ Hashbrown Agent extraction successful!');
                        } catch (hbError: any) {
                            console.warn('[App] Hashbrown extraction failed, falling back to standard scraper:', hbError);
                            setStatusMessage('Hashbrown failed. Falling back to standard scraper...');
                        }
                    }

                    if (!hbSuccess) {
                        setStatusMessage('Analyzing URL and extracting content...');
                        const htmlContent = await fetchUrlContent(appData.inputVal);
                        extractedData = await extractDataFromUrlWithGemini(htmlContent, apiKey);
                    }
                }
            } catch (error: any) {
                console.error("URL Extraction failed:", error);
                throw new Error(`Could not verify product content. ${error.message ? error.message : "The site may be blocking access."}`);
            }
        }
        // Handle keyword/topic input
        else {
            setStatusMessage('Researching topic...');
            extractedData = appData.inputVal;
        }

        setStatusMessage('Drafting comprehensive article...');
        let postResponse: CombinedPostResponse;

        // Fetch existing WordPress categories if configured
        let existingCategories: string[] = [];
        if (appData.wordpressConfig.url && appData.wordpressConfig.username && appData.wordpressConfig.password) {
            try {
                setStatusMessage('Fetching existing WordPress categories...');
                const categories = await fetchExistingCategories(appData.wordpressConfig);
                existingCategories = categories.map(cat => cat.name);
                console.log(`[App] Fetched ${existingCategories.length} existing categories:`, existingCategories);
            } catch (catError) {
                console.warn('[App] Could not fetch WordPress categories, AI will create category name:', catError);
                // Continue without categories - AI will create a category name
            }
        }

        try {
            // [TIER LOGIC] Check limit one last time to decide on Beast Mode?
            // Actually, let's just use the config we have. 
            // If the user is supposed to be in Beast Mode, we need to set it.
            // Hack: Check limit again here? No, expensive.

            // Let's check if we should FORCE Beast Mode.
            const shouldForceBeast = (await checkArticleLimit()).allowed === false;

            const generationConfig = {
                ...appData.aiConfig,
                useBeastMode: shouldForceBeast || appData.aiConfig.useBeastMode
            };

            if (shouldForceBeast) {
                console.log('[App] Limit exceeded. Forcing Beast Mode for this generation.');
                setStatusMessage('Monthly Limit Reached. Switching to Free Beast Mode...');
            }

            postResponse = await generatePostFromExtractedDataWithGemini(extractedData, appData.selectedBlueprint, generationConfig, existingCategories);
        } catch (e) {
            if (e instanceof QuotaError || e instanceof BillingQuotaError) {
                setStatusMessage('Gemini quota reached. Switching to Open Source fallback...');
                postResponse = await generatePostWithOpenSource(extractedData, appData.selectedBlueprint);
            } else {
                throw e;
            }
        }

        const familyValidationTitle = String(postResponse.blogPostData?.title || extractedData.title || '').trim();
        const originalGeneratedProductCount = (postResponse.productData || []).length;
        const generatedFamilySanitization = sanitizeProductFamilyAssets({
            productData: postResponse.productData,
            blogPostData: postResponse.blogPostData,
            articleTitle: familyValidationTitle,
            blueprintType: appData.selectedBlueprint,
        });
        if (generatedFamilySanitization.rejectedProducts.length > 0) {
            console.warn('[Product Family] Rejected mismatched generated products:', generatedFamilySanitization.rejectedProducts.map(product => product.productName || product.id));
        }
        postResponse = {
            ...postResponse,
            productData: generatedFamilySanitization.productData,
            blogPostData: generatedFamilySanitization.blogPostData || postResponse.blogPostData,
        };
        if (originalGeneratedProductCount > 1 && postResponse.productData.length < 2) {
            throw new Error('Resolved products do not belong to the same product family. Please retry with more specific Amazon products.');
        }

        let heroUrl = '';
        let initialProductImageUrls: Record<number, string> = {};
        let productImageVariants: Record<number, string[]> = {};
        const amazonFoundIds = new Set<number>();

        const isAmazonInput = detectedAsins.length > 0 || appData.inputVal.includes('amazon.com') || appData.inputVal.includes('amazon.co');
        const hasAmazonCreds = appData.amazonConfig.accessKey && appData.amazonConfig.secretKey;

        if ((appData.aiConfig.productImageSource === 'amazon' || isAmazonInput) && hasAmazonCreds) {
            // Check if we can extract an ASIN to validate it's a "clean" Amazon URL
            if (isAmazonInput) {
                const asin = extractASINFromUrl(appData.inputVal);
                if (!asin) {
                    console.warn(`[Amazon URL] No ASIN detected in URL. Falling back to page scrape. URL: ${appData.inputVal}`);
                }
            }

            setStatusMessage('Searching Amazon for products...');
            try {
                const amazonIdentityOptions: AmazonProductIdentityOptions = {
                    blueprintType: appData.selectedBlueprint,
                    articleTitle: postResponse.blogPostData?.title || '',
                };
                const searchableProducts = postResponse.productData.filter(product =>
                    canUseAmazonKeywordSearch(product, amazonIdentityOptions)
                );
                const amazonImages = await searchProductsAndGetImages(searchableProducts, appData.amazonConfig, amazonIdentityOptions);

                // Map structured image data (primary/variants) to simple URL map for initial display
                initialProductImageUrls = {};
                productImageVariants = {};

                Object.entries(amazonImages).forEach(([key, images]) => {
                    const pId = parseInt(key);
                    if (!isNaN(pId)) {
                        // Use the High Quality Primary image for display
                        initialProductImageUrls[pId] = images.primary;

                        const product = postResponse.productData.find(p => p.id === pId);
                        if (product && images.primary && isAmazonHostedImage(images.primary)) {
                            product.imageUrl = images.primary;
                        }

                        // Store variant images for WordPress upload
                        if (images.variants && images.variants.length > 0) {
                            productImageVariants[pId] = images.variants;
                        }

                        // Update product URL if found
                        if (images.url) {
                            if (product) {
                                product.url = images.url;
                            }
                        }
                    }
                });

                Object.keys(amazonImages).forEach(k => amazonFoundIds.add(parseInt(k)));
                console.log(`Found ${amazonFoundIds.size} images from Amazon.`);
                console.log(`Variants available for ${Object.keys(productImageVariants).length} products.`);
            } catch (amazonErr) {
                console.warn("Amazon Image Search failed, defaulting to AI.", amazonErr);
            }
        }

        const hydratedAmazonAssets = await hydrateAmazonProductAssets(
            postResponse.productData,
            initialProductImageUrls,
            productImageVariants,
            appData.amazonConfig,
            {
                blueprintType: appData.selectedBlueprint,
                articleTitle: postResponse.blogPostData?.title || '',
            }
        );
        const hydratedGeneratedFamilySanitization = sanitizeProductFamilyAssets({
            productData: hydratedAmazonAssets.productData,
            productImageUrls: hydratedAmazonAssets.productImageUrls,
            productImageVariants: hydratedAmazonAssets.productImageVariants,
            blogPostData: postResponse.blogPostData,
            articleTitle: postResponse.blogPostData?.title || '',
            blueprintType: appData.selectedBlueprint,
        });
        if (hydratedGeneratedFamilySanitization.rejectedProducts.length > 0) {
            console.warn('[Product Family] Rejected mismatched hydrated products:', hydratedGeneratedFamilySanitization.rejectedProducts.map(product => product.productName || product.id));
        }
        postResponse.productData = hydratedGeneratedFamilySanitization.productData;
        postResponse.blogPostData = hydratedGeneratedFamilySanitization.blogPostData || postResponse.blogPostData;
        initialProductImageUrls = Object.fromEntries(
            Object.entries(hydratedGeneratedFamilySanitization.productImageUrls).map(([key, value]) => [Number(key), value])
        ) as Record<number, string>;
        productImageVariants = hydratedGeneratedFamilySanitization.productImageVariants;

        setStatusMessage('Designing featured image...');
        try {
            const heroPrompt = looksLikeWeakImagePrompt(postResponse.blogPostData.heroImage)
                ? buildEditorialHeroPrompt(postResponse.blogPostData, postResponse.productData)
                : postResponse.blogPostData.heroImage;

            if (appData.aiConfig.imageProvider === 'gemini' && apiKey) {
                try {
                    heroUrl = await generateWithGemini(heroPrompt, 'hero', postResponse.blogPostData.niche, {}, apiKey);
                } catch (geminiError: any) {
                    console.warn('Gemini hero image generation failed, falling back to free tier:', geminiError.message);
                    setStatusMessage('Gemini unavailable, using free tier for images...');
                    heroUrl = await generateWithFreeTier(heroPrompt, 'hero', postResponse.blogPostData.niche, appData.aiConfig);
                }
            } else if (appData.aiConfig.imageProvider === 'deepai') {
                try {
                    heroUrl = await generateImageWithDeepAI(
                        heroPrompt,
                        'hero',
                        postResponse.blogPostData.niche,
                        { apiKey: appData.aiConfig.deepaiApiKey }
                    );
                    setAppData(prev => ({ ...prev, heroImageUrl: heroUrl }));
                } catch (error: any) {
                    if (error instanceof ImageRateLimitError) {
                        alert(`Rate limit hit. Try again in ${error.retryAfter} seconds.`);
                    } else {
                        console.warn('DeepAI failed, falling back to free tier...');
                        heroUrl = await generateWithFreeTier(heroPrompt, 'hero', postResponse.blogPostData.niche, appData.aiConfig);
                    }
                }
            } else {
                heroUrl = await generateWithFreeTier(heroPrompt, 'hero', postResponse.blogPostData.niche, appData.aiConfig);
            }
        } catch (e: any) {
            console.error("Hero image generation failed completely:", e.message || e);
            // Hero image will remain empty, user can regenerate manually
        }

        // Hero image stays as data URI until publishing to blog
        // No upload during article generation

        const preparedBlogPostData = withDerivedContentSections(postResponse.blogPostData, appData.selectedBlueprint) as BlogPostData;

        setAppData(prev => ({
            ...prev,
            blogPostData: preparedBlogPostData,
            originalBlogPostData: preparedBlogPostData,
            productData: postResponse.productData,
            heroImageUrl: heroUrl,
            stepImageUrls: {},
            productImageUrls: initialProductImageUrls,
            productImageVariants: productImageVariants, // Store Amazon variant images
            currentStep: AppStep.Review,
            articleStatus: 'Draft',
            imagesGenerated: false,
            // CRITICAL FIX: Assign a temporary ID immediately to prevent duplicate auto-saves
            // The auto-save effect will now use this stable ID instead of creating a new one each time
            articleId: `draft_${Date.now()}`
        }));

        // ✅ CRITICAL ADDITION: Trigger auto-generation of visuals
        // We pass the new data immediately because 'appData' is not yet updated in this closure
        generateImagesForContent(
            preparedBlogPostData,
            postResponse.productData,
            appData.aiConfig,
            amazonFoundIds,
            {},
            initialProductImageUrls
        )
            .then(() => console.log('✅ Auto-generation of visuals complete'))
            .catch(e => console.error('⚠️ Auto-generation warning:', e));

        incrementUsage();

        generateRemainingImagesInBackground(
            preparedBlogPostData,
            postResponse.productData,
            appData.aiConfig,
            amazonFoundIds,
            {},
            initialProductImageUrls
        );

        // Track article generation in analytics
        try {
            const location = await analyticsService.getUserLocation();
            analyticsService.trackArticleGeneration(
                postResponse.blogPostData.title,
                location || undefined
            );
        } catch (analyticsError) {
            console.warn('Analytics tracking failed:', analyticsError);
            // Don't block the main flow if analytics fails
        }

    } catch (err: any) {
        console.error("Generation Error:", err);
        setError(err.message || "An unexpected error occurred during generation.");
        setAppData(prev => ({ ...prev, currentStep: AppStep.Input }));
    } finally {
        setIsGenerating(false);
        isGeneratingRef.current = false; // Release lock
    }
};

const handleRegenerateImage = async (key: string) => {
    if (loadingImages.has(key) || !appData.blogPostData) return;
    setLoadingImages(prev => new Set(prev).add(key));
    try {
        let prompt = '';
        let kind: 'hero' | 'step' | 'section' | 'product' = 'hero';
        let promptSource = '';
        let subjectId = key;
        let subjectName = appData.blogPostData.title;

        // Prefer the current working draft so regenerate reflects the article the
        // user is actively editing, not only the original saved payload.
        const currentDraftData =
            withDerivedContentSections(appData.blogPostData, appData.selectedBlueprint) ||
            appData.blogPostData;
        const sourceData = currentDraftData || appData.originalBlogPostData || appData.blogPostData;

        if (key === 'hero') {
            prompt = looksLikeWeakImagePrompt(sourceData.heroImage)
                ? buildEditorialHeroPrompt(sourceData, appData.productData)
                : (sourceData.heroImage || sourceData.title || 'Professional blog post hero image');
            kind = 'hero';
            subjectName = sourceData.title || 'Featured image';
            promptSource = looksLikeWeakImagePrompt(sourceData.heroImage)
                ? 'editorial hero fallback'
                : sourceData.heroImage ? 'heroImage field' : sourceData.title ? 'title fallback' : 'generic fallback';
            console.log(`[Regenerate Hero] Using prompt from: ${promptSource}`);
        } else if (key.startsWith('step_')) {
            const idx = parseInt(key.split('_')[1]);
            const step = sourceData.steps?.[idx];
            const derivedStepText =
                deriveRecipeStepPromptFromHtml(currentDraftData, idx) ||
                deriveRecipeStepPromptFromHtml(appData.originalBlogPostData, idx);
            // ✅ CRITICAL FIX: User-Requested "Victory Map" Logic
            // Pass RAW text. Service handles the rest.
            const stepText = step?.text || derivedStepText || `Step ${idx + 1}`;
            prompt = stepText;

            kind = 'step';
            subjectId = String(idx);
            subjectName = `Step ${idx + 1}`;
            promptSource = step?.text ? 'steps array' : derivedStepText ? 'html-derived fallback' : 'generic fallback';
            console.log(`[Regenerate Step ${idx}] Using prompt from: ${promptSource} (Text-to-Prompt Logic Applied)`);
        } else if (key.startsWith('section_')) {
            const id = parseInt(key.split('_')[1]);
            const section = deriveContentSectionsFromHtml(currentDraftData || sourceData).find(s => s.id === id);
            // Enhanced fallback chain for content sections
            const basePrompt = section?.image ||
                section?.text?.substring(0, 200) ||
                section?.title ||
                `Section ${id}`;
            // ✅ CRITICAL FIX: Add article context
            prompt = `${basePrompt}. ${section?.text?.substring(0, 220) || ''}`.trim();
            kind = 'section';
            subjectId = String(id);
            subjectName = section?.title || `Section ${id}`;
            promptSource = section?.image ? 'image field' :
                section?.text ? 'text fallback' :
                    section?.title ? 'title fallback' : 'generic fallback';
            console.log(`[Regenerate Section ${id}] Using prompt from: ${promptSource}`);
        } else if (key.startsWith('product_')) {
            const id = parseInt(key.split('_')[1]);
            const product = appData.productData.find(p => p.id === id);
            const basePrompt = product ? product.productName : `Product ${id}`;
            // ✅ CRITICAL FIX: Add article context
            prompt = basePrompt;
            kind = 'product';
            subjectId = String(id);
            subjectName = product?.productName || `Product ${id}`;
            promptSource = product ? 'amazon product image refresh' : 'generic fallback';
            console.log(`[Regenerate Product ${id}] Using source: ${promptSource}`);
        }

        if (!prompt || prompt.trim().length < 3) {
            throw new Error(`Could not find a valid prompt for image. Please ensure the article has detailed content for this section.`);
        }

        console.log(`[Regenerate ${key}] Final prompt (${prompt.length} chars): ${prompt.substring(0, 100)}...`);

        if (kind === 'product') {
            const productId = parseInt(subjectId, 10);
            const product = appData.productData.find(p => p.id === productId);
            if (!product) {
                throw new Error('Could not find product data for this image.');
            }

            const identityOptions: AmazonProductIdentityOptions = {
                blueprintType: appData.selectedBlueprint,
                articleTitle: appData.blogPostData?.title || '',
            };
            const currentArticleTitle = appData.blogPostData?.title || '';
            const searchQueries = buildAmazonProductSearchQueries(product, identityOptions);
            const searchName = searchQueries[0] || getCompactProductDisplayTitle(product, product.productName, product.url || '');
            let resolvedProduct: AmazonProduct = product;
            let amazonUrl = '';
            let resolvedVariants: string[] = [];
            const existingHostedImage = [String(appData.productImageUrls[productId] || '').trim(), String(product.imageUrl || '').trim()]
                .find(isPlatformHostedImage) || '';

            const existingAmazonCandidates = Array.from(new Set([
                String(product.imageUrl || '').trim(),
                String(appData.productImageUrls[productId] || '').trim(),
                ...(appData.productImageVariants?.[productId] || []).map(value => String(value || '').trim()),
            ].filter(isUsableAmazonProductImageUrl)));

            if (existingAmazonCandidates.length > 0) {
                amazonUrl = existingAmazonCandidates[0];
                resolvedVariants = existingAmazonCandidates;
            }

            if (!amazonUrl) {
                if (searchQueries.length === 0 && !existingHostedImage) {
                    console.info(`[Regenerate Product ${productId}] Skipped because there is no verifiable Amazon identity for this product.`);
                    return;
                }

                for (const query of searchQueries) {
                    try {
                        const liveSearchResults = await searchProductsAndGetImages(
                            [{ ...product, productName: query }],
                            appData.amazonConfig,
                            identityOptions
                        );
                        const liveHit = liveSearchResults[productId];
                        if (liveHit?.primary && isUsableAmazonProductImageUrl(liveHit.primary)) {
                            const candidateProduct: AmazonProduct = {
                                ...resolvedProduct,
                                imageUrl: liveHit.primary,
                                url: liveHit.url || resolvedProduct.url,
                            };
                            if (!candidatePreservesProductFamily(productId, candidateProduct, appData.productData, currentArticleTitle, appData.selectedBlueprint)) {
                                console.warn(`[Regenerate Product ${productId}] Rejected live search result outside dominant family for query "${query}".`);
                                continue;
                            }
                            amazonUrl = liveHit.primary;
                            resolvedVariants = (liveHit.variants || []).filter(isUsableAmazonProductImageUrl);
                            resolvedProduct = candidateProduct;
                            break;
                        }
                    } catch (error) {
                        console.warn(`[Regenerate Product ${productId}] Live search refresh failed for query "${query}":`, error);
                    }
                }
            }

            if (!amazonUrl) {
                const asin = extractProductAsin(product);
                if (asin) {
                    try {
                        const details = await getAmazonProductData(asin, appData.amazonConfig);
                        const amazonDetailImage = (details.images || []).find(isUsableAmazonProductImageUrl) || '';
                        if (amazonDetailImage) {
                            const candidateProduct: AmazonProduct = {
                                ...resolvedProduct,
                                productName: /^https?:\/\//i.test(String(resolvedProduct.productName || '').trim()) ? details.title : resolvedProduct.productName,
                                imageUrl: amazonDetailImage,
                                url: details.url || resolvedProduct.url,
                                price: details.price || resolvedProduct.price,
                                specs: (resolvedProduct.specs && resolvedProduct.specs.length > 0)
                                    ? resolvedProduct.specs
                                    : (details.features || []).slice(0, 3).map((feature, index) => ({
                                        key: index === 0 ? 'Feature' : `Feature ${index + 1}`,
                                        value: feature,
                                    })),
                            };
                            if (!candidatePreservesProductFamily(productId, candidateProduct, appData.productData, currentArticleTitle, appData.selectedBlueprint)) {
                                console.warn(`[Regenerate Product ${productId}] Rejected ASIN detail result outside dominant family.`);
                            } else {
                                amazonUrl = amazonDetailImage;
                                resolvedVariants = (details.images || []).filter(isUsableAmazonProductImageUrl);
                                resolvedProduct = candidateProduct;
                            }
                        }
                    } catch (error) {
                        console.warn(`[Regenerate Product ${productId}] ASIN refresh failed:`, error);
                    }
                }
            }

            if (!amazonUrl) {
                for (const query of searchQueries) {
                    try {
                        const details = await searchAmazonProductByKeyword(
                            query,
                            appData.amazonConfig,
                            identityOptions
                        );
                        const searchImage = (details.images || []).find(isUsableAmazonProductImageUrl) || '';
                        if (searchImage) {
                            const candidateProduct: AmazonProduct = {
                                ...resolvedProduct,
                                productName: /^https?:\/\//i.test(String(resolvedProduct.productName || '').trim()) ? details.title : resolvedProduct.productName,
                                imageUrl: searchImage,
                                url: details.url || resolvedProduct.url,
                            };
                            if (!candidatePreservesProductFamily(productId, candidateProduct, appData.productData, currentArticleTitle, appData.selectedBlueprint)) {
                                console.warn(`[Regenerate Product ${productId}] Rejected keyword result outside dominant family for query "${query}".`);
                                continue;
                            }
                            amazonUrl = searchImage;
                            resolvedProduct = candidateProduct;
                            break;
                        }
                    } catch (error) {
                        console.warn(`[Regenerate Product ${productId}] Keyword search refresh failed for query "${query}":`, error);
                    }
                }
            }

            if (!amazonUrl) {
                const hydratedAmazonAssets = await hydrateAmazonProductAssets(
                    [resolvedProduct],
                    { [productId]: appData.productImageUrls[productId] || '' },
                    appData.productImageVariants || {},
                    appData.amazonConfig,
                    identityOptions
                );
                const hydratedProduct = hydratedAmazonAssets.productData[0] || resolvedProduct;
                const hydratedUrl = resolveAmazonProductImage(hydratedProduct, hydratedAmazonAssets.productImageUrls, '600x600');
                if (hydratedUrl) {
                    const candidateProduct: AmazonProduct = {
                        ...hydratedProduct,
                        imageUrl: hydratedUrl,
                    };
                    if (!candidatePreservesProductFamily(productId, candidateProduct, appData.productData, currentArticleTitle, appData.selectedBlueprint)) {
                        throw new Error('Resolved fallback product does not match the current product family.');
                    }
                    amazonUrl = hydratedUrl;
                    resolvedProduct = candidateProduct;
                    resolvedVariants = hydratedAmazonAssets.productImageVariants[productId] || resolvedVariants;
                }
            }

            if (!amazonUrl || !isUsableAmazonProductImageUrl(amazonUrl)) {
                if (existingHostedImage) {
                    setAppData(prev => ({
                        ...prev,
                        productData: prev.productData.map(item => (
                            item.id === productId
                                ? {
                                    ...item,
                                    ...resolvedProduct,
                                    imageUrl: existingHostedImage,
                                    url: resolvedProduct.url || item.url,
                                }
                                : item
                        )),
                        productImageUrls: { ...prev.productImageUrls, [productId]: existingHostedImage },
                    }));
                    return;
                }
                throw new Error(`Could not fetch a real Amazon image for this product (${searchName}).`);
            }

            let finalProductImageUrl = amazonUrl;
            try {
                const articlePathId = String(appData.articleId || `draft_${Date.now()}`);
                finalProductImageUrl = await uploadHostedProductImage(amazonUrl, articlePathId, productId);
            } catch (uploadError) {
                if (existingHostedImage) {
                    finalProductImageUrl = existingHostedImage;
                }
                console.warn(`[Regenerate Product ${productId}] Failed to host Amazon image locally, keeping current hosted image if available:`, uploadError);
            }

            setAppData(prev => ({
                ...prev,
                productData: prev.productData.map(item => (
                    item.id === productId
                        ? {
                            ...item,
                            ...resolvedProduct,
                            imageUrl: finalProductImageUrl,
                            url: resolvedProduct.url || item.url,
                        }
                        : item
                )),
                productImageUrls: { ...prev.productImageUrls, [productId]: finalProductImageUrl },
                productImageVariants: {
                    ...prev.productImageVariants,
                    ...(resolvedVariants.length > 0 ? { [productId]: resolvedVariants } : {}),
                },
            }));
            return;
        }

        const finalUrl = await generateArticleVisual({
            prompt,
            kind,
            articleTitle: sourceData.title || appData.blogPostData.title,
            subjectId,
            subjectName,
            blueprint: sourceData.niche || appData.blogPostData.niche || 'general',
            aiConfig: appData.aiConfig,
        });

        setAppData(prev => {
            const next = { ...prev };
            if (key === 'hero') next.heroImageUrl = finalUrl;
            else if (key.startsWith('step_')) {
                const idx = parseInt(key.split('_')[1]);
                next.stepImageUrls = { ...prev.stepImageUrls, [idx]: finalUrl };
            } else if (key.startsWith('section_')) {
                // Store section images in stepImageUrls with the full key "section_ID"
                next.stepImageUrls = { ...prev.stepImageUrls, [key]: finalUrl };
            } else if (key.startsWith('product_')) {
                const id = parseInt(key.split('_')[1]);
                next.productImageUrls = { ...prev.productImageUrls, [id]: finalUrl };
            }
            return next;
        });

    } catch (e: any) {
        console.error("Image regeneration failed:", e.message || e);
        alert(`Failed to regenerate image: ${e.message || 'Unknown error'}. Please try again.`);
    } finally {
        setLoadingImages(prev => {
            const next = new Set(prev);
            next.delete(key);
            return next;
        });
    }
};

const handleSaveConfig = async () => {
    try {
        setSaveStatus('Saving...');
        let warningMessage = '';

        // Verify Amazon Credentials if present
        if (appData.amazonConfig.accessKey && appData.amazonConfig.secretKey) {
            setSaveStatus('Verifying Amazon keys...');
            try {
                const { verifyPaapiCredentials } = await import('./services/amazonService');
                const verification = await verifyPaapiCredentials(appData.amazonConfig);

                if (!verification.valid) {
                    warningMessage = `⚠️ Amazon Keys Invalid: ${verification.error}`;
                }
            } catch (verifyError: any) {
                warningMessage = `⚠️ Verification Error: ${verifyError.message}`;
            }
        }

        localStorage.setItem('postgenius_config', JSON.stringify({
            wordpressConfig: appData.wordpressConfig,
            amazonConfig: appData.amazonConfig,
            aiConfig: appData.aiConfig,
            styleConfig: appData.styleConfig
        }));

        if (warningMessage) {
            setSaveStatus(warningMessage);
            // Don't clear automatically so they see it
        } else {
            setSaveStatus('Configuration saved to browser.');
            setTimeout(() => setSaveStatus(''), 3000);
        }
    } catch (e) {
        setSaveStatus('Error saving configuration.');
    }
};

const handleClearConfig = () => {
    localStorage.removeItem('postgenius_config');
    setAppData(prev => ({
        ...prev,
        wordpressConfig: defaultSessionData.wordpressConfig,
        amazonConfig: defaultSessionData.amazonConfig,
        aiConfig: defaultSessionData.aiConfig,
        styleConfig: defaultSessionData.styleConfig
    }));
    setSaveStatus('Configuration cleared.');
    setTimeout(() => setSaveStatus(''), 3000);
};

const handleLogoClick = () => {
    if (appData.currentStep !== AppStep.BlueprintSelection) {
        if (window.confirm("Return to home? Current progress may be lost if not saved.")) {
            const initial = loadInitialData();
            setAppData(prev => ({
                ...initial,
                wordpressConfig: prev.wordpressConfig,
                amazonConfig: prev.amazonConfig,
                aiConfig: prev.aiConfig,
                styleConfig: prev.styleConfig
            }));
            navigate('/');
        }
    } else {
        navigate('/');
    }
};

const handleStart = () => {
    const initial = loadInitialData();
    setAppData(prev => ({
        ...initial,
        wordpressConfig: prev.wordpressConfig,
        amazonConfig: prev.amazonConfig,
        aiConfig: prev.aiConfig,
        styleConfig: prev.styleConfig
    }));
    navigate('/generator');
};

const handleEditArticle = (article: Article) => {
    try {
        let parsedContent: ArticleContent;
        if (typeof article.content === 'string') {
            parsedContent = JSON.parse(article.content);
        } else {
            parsedContent = article.content;
        }

        const preparedBlogPostData = parsedContent.blogPostData
            ? {
                ...parsedContent.blogPostData,
                htmlContent: prepareArticleHtmlForEditing(
                    parsedContent.blogPostData.htmlContent || article.generated_html || '',
                    article.blueprint_type
                )
              }
            : parsedContent.blogPostData;

        const preparedWithSections = withDerivedContentSections(preparedBlogPostData, article.blueprint_type);
        const existingStepImages = parsedContent.stepImageUrls || {};
        const normalizedProductAssets = normalizeAmazonProductAssets(
            parsedContent.productData || [],
            parsedContent.productImageUrls || {}
        );
        const sanitizedLoadedProductAssets = sanitizeProductFamilyAssets({
            productData: normalizedProductAssets.productData,
            productImageUrls: normalizedProductAssets.productImageUrls,
            productImageVariants: parsedContent.productImageVariants || {},
            blogPostData: preparedWithSections as BlogPostData | undefined,
            articleTitle: preparedWithSections?.title || article.title,
            blueprintType: article.blueprint_type,
        });
        const existingProductImages = sanitizedLoadedProductAssets.productImageUrls;
        const reviewSectionIds = deriveContentSectionsFromHtml(preparedWithSections as BlogPostData).map(section => `section_${section.id}`);
        const hasMissingReviewLifestyleImages =
            article.blueprint_type === 'review' &&
            reviewSectionIds.length > 0 &&
            reviewSectionIds.some(key => !existingStepImages[key]);

        setAppData(prev => ({
            ...prev,
            ...parsedContent,
            blogPostData: sanitizedLoadedProductAssets.blogPostData || preparedWithSections,
            originalBlogPostData: sanitizedLoadedProductAssets.blogPostData || preparedWithSections,
            productData: sanitizedLoadedProductAssets.productData,
            productImageUrls: sanitizedLoadedProductAssets.productImageUrls,
            productImageVariants: sanitizedLoadedProductAssets.productImageVariants,
            heroImageUrl: parsedContent.heroImageUrl || article.image_url || prev.heroImageUrl,
            articleId: article.id,
            articleStatus: article.status,
            selectedBlueprint: article.blueprint_type,
            currentStep: AppStep.Review,
        }));

        if (hasMissingReviewLifestyleImages && preparedWithSections) {
            generateRemainingImagesInBackground(
                preparedWithSections as BlogPostData,
                sanitizedLoadedProductAssets.productData,
                appData.aiConfig,
                new Set(sanitizedLoadedProductAssets.productData.map((product: AmazonProduct) => product.id)),
                existingStepImages,
                existingProductImages
            ).catch(error => console.warn('[Edit Article] Lifestyle backfill warning:', error));
        }

        hydrateAmazonProductAssets(
            sanitizedLoadedProductAssets.productData,
            sanitizedLoadedProductAssets.productImageUrls,
            sanitizedLoadedProductAssets.productImageVariants,
            appData.amazonConfig,
            {
                blueprintType: article.blueprint_type,
                articleTitle: preparedWithSections?.title || article.title,
            }
        ).then(({ productData, productImageUrls, productImageVariants }) => {
            const hydratedFamilySanitization = sanitizeProductFamilyAssets({
                productData,
                productImageUrls,
                productImageVariants,
                blogPostData: preparedWithSections as BlogPostData | undefined,
                articleTitle: preparedWithSections?.title || article.title,
                blueprintType: article.blueprint_type,
            });
            setAppData(prev => ({
                ...prev,
                blogPostData: hydratedFamilySanitization.blogPostData || prev.blogPostData,
                originalBlogPostData: hydratedFamilySanitization.blogPostData || prev.originalBlogPostData,
                productData: hydratedFamilySanitization.productData,
                productImageUrls: hydratedFamilySanitization.productImageUrls,
                productImageVariants: {
                    ...prev.productImageVariants,
                    ...hydratedFamilySanitization.productImageVariants,
                },
            }));
        }).catch(error => console.warn('[Edit Article] Amazon image hydration warning:', error));

        navigate('/generator');
    } catch (e) {
        console.error("Failed to load article for editing:", e);
        alert("Failed to load article. The data format might be incompatible.");
    }
};

const handleHtmlUpdate = (newHtml: string) => {
    setAppData(prev => {
        if (!prev.blogPostData) return prev;
        return {
            ...prev,
            blogPostData: {
                ...prev.blogPostData,
                htmlContent: newHtml
            }
        };
    });
};

const handleStepClick = (step: AppStep) => {
    if (step < appData.currentStep || (step === AppStep.Review && appData.blogPostData)) {
        setAppData(prev => ({ ...prev, currentStep: step }));
    }
};

const articleIdRef = useRef<number | null>(null);
useEffect(() => {
    articleIdRef.current = appData.articleId || null;
}, [appData.articleId]);

// Ref to store the stringified content of the last successful save
const lastSavedDataRef = useRef<string>('');
const isSavingRef = useRef(false);

useEffect(() => {
    const saveCurrentArticle = async () => {
        if (appData.currentStep === AppStep.Review && appData.blogPostData && user) {
            // Prevent duplicate saves if already running
            if (isSavingRef.current) return;

            // Create a stable representation of the validation data to check for changes
            // We exclude volatile fields like ID or status unless they are critical
            const normalizedProductAssets = normalizeAmazonProductAssets(appData.productData, appData.productImageUrls);
            const sanitizedProductAssets = sanitizeProductFamilyAssets({
                productData: normalizedProductAssets.productData,
                productImageUrls: normalizedProductAssets.productImageUrls,
                productImageVariants: appData.productImageVariants,
                blogPostData: appData.blogPostData,
                articleTitle: appData.blogPostData?.title || '',
                blueprintType: appData.selectedBlueprint,
            });
            const blogPostDataForSave = sanitizedProductAssets.blogPostData || appData.blogPostData;
            const currentDataToSave = {
                blogPostData: blogPostDataForSave,
                productData: sanitizedProductAssets.productData,
                heroImageUrl: appData.heroImageUrl,
                stepImageUrls: appData.stepImageUrls,
                productImageUrls: sanitizedProductAssets.productImageUrls,
                productImageVariants: appData.productImageVariants,
                styleConfig: appData.styleConfig,
                selectedBlueprint: appData.selectedBlueprint
            };

            const stringifiedData = JSON.stringify(currentDataToSave);

            // COMPARE: If the data hasn't changed since the last save, skip!
            if (stringifiedData === lastSavedDataRef.current) {
                console.log('[Auto-save] Content identical to last save. Skipping.');
                return;
            }

            isSavingRef.current = true;
            try {
                console.log('[Auto-save] Changes detected. Saving...');
                const finalHtml = generateFinalHtml(
                    blogPostDataForSave,
                    sanitizedProductAssets.productData,
                    appData.amazonConfig,
                    appData.styleConfig,
                    userProfile,
                    appData.stepImageUrls,
                    sanitizedProductAssets.productImageUrls,
                    false,
                    appData.selectedBlueprint
                );

                const articleContent: ArticleContent = {
                    blogPostData: blogPostDataForSave,
                    productData: sanitizedProductAssets.productData,
                    stepImageUrls: appData.stepImageUrls,
                    productImageUrls: sanitizedProductAssets.productImageUrls,
                    productImageVariants: Object.fromEntries(
                        Object.entries(appData.productImageVariants || {}).map(([key, value]) => [String(key), value])
                    ),
                    heroImageUrl: appData.heroImageUrl,
                };

                const currentId = articleIdRef.current;

                const savedArticle = await saveArticle(
                    articleContent,
                    user.id,
                    currentId,
                    appData.styleConfig,
                    appData.selectedBlueprint,
                    finalHtml,
                    appData.articleStatus || 'Draft'
                );

                if (normalizedProductAssets.changed || sanitizedProductAssets.changed || sanitizedProductAssets.blogPostData !== appData.blogPostData) {
                    setAppData(prev => ({
                        ...prev,
                        blogPostData: blogPostDataForSave,
                        originalBlogPostData: blogPostDataForSave,
                        productData: sanitizedProductAssets.productData,
                        productImageUrls: sanitizedProductAssets.productImageUrls,
                        productImageVariants: {
                            ...prev.productImageVariants,
                            ...sanitizedProductAssets.productImageVariants,
                        },
                    }));
                }

                // Update the last saved reference to the CURRENT data we just saved
                lastSavedDataRef.current = stringifiedData;

                // Only update AppData if critical IDs changed to avoid re-triggering this effect
                if (savedArticle.id !== appData.articleId) {
                    setAppData(prev => ({
                        ...prev,
                        articleId: savedArticle.id,
                        articleStatus: savedArticle.status
                    }));
                }

            } catch (error) {
                console.error("Failed to auto-save article:", error);
            } finally {
                isSavingRef.current = false;
            }
        }
    };

    const timeoutId = setTimeout(saveCurrentArticle, 3000); // Increased debounce to 3s
    return () => clearTimeout(timeoutId);
}, [
    // Only trigger on actual data changes
    appData.blogPostData,
    appData.productData,
    appData.heroImageUrl,
    appData.stepImageUrls,
    appData.productImageUrls,
    appData.productImageVariants,
    appData.styleConfig,
    appData.selectedBlueprint,
    // Trigger structure checks
    appData.currentStep,
    user
]);


const handleResetPublishing = () => {
    setPublishingStatus(PublishingStatus.Idle);
    setNewPostLink(null);
    setNewPostId(null);
    setPublishError(null);
    setPublishingProgress({ message: '', logs: [] });
};

const handleSubmitForReview = async () => {
    if (!user || !appData.blogPostData) return;

    // Prevent submission if a save is currently in progress
    if (isSavingRef.current) {
        console.log("Save in progress, waiting...");
        // Simple back-off might not be enough, but UI blocking is better.
        // For now, let's just create a collision check loop
        while (isSavingRef.current) {
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    }

    // RE-READ ID after waiting, as it might have changed
    // Note: In React functional components, 'appData.articleId' in this closure might be stale 
    // if we just awaited. However, we are not using a ref for appData, so this is risky.
    // A better approach is to set a "pending submit" state or block the UI better.
    // But since we can't easily refactor the whole architecture:

    // We will set the ref to true HERE explicitly to block concurrent auto-saves
    isSavingRef.current = true;

    setIsSubmitting(true);
    setSubmitStatus('Saving & Submitting...');

    try {
        const normalizedProductAssets = normalizeAmazonProductAssets(appData.productData, appData.productImageUrls);
        const sanitizedProductAssets = sanitizeProductFamilyAssets({
            productData: normalizedProductAssets.productData,
            productImageUrls: normalizedProductAssets.productImageUrls,
            productImageVariants: appData.productImageVariants,
            blogPostData: appData.blogPostData,
            articleTitle: appData.blogPostData?.title || '',
            blueprintType: appData.selectedBlueprint,
        });
        const blogPostDataForSave = sanitizedProductAssets.blogPostData || appData.blogPostData;
        const finalHtml = generateFinalHtml(
            blogPostDataForSave,
            sanitizedProductAssets.productData,
            appData.amazonConfig,
            appData.styleConfig,
            userProfile,
            appData.stepImageUrls,
            sanitizedProductAssets.productImageUrls,
            false,
            appData.selectedBlueprint
        );

        const content: ArticleContent = {
            blogPostData: blogPostDataForSave,
            productData: sanitizedProductAssets.productData,
            stepImageUrls: appData.stepImageUrls,
            productImageUrls: sanitizedProductAssets.productImageUrls,
            productImageVariants: Object.fromEntries(
                Object.entries(appData.productImageVariants || {}).map(([key, value]) => [String(key), value])
            ),
            heroImageUrl: appData.heroImageUrl,
        };

        const savedArticle = await saveArticle(
            content,
            user.id,
            appData.articleId, // Use the current ID (or the one from closure)
            appData.styleConfig,
            appData.selectedBlueprint,
            finalHtml,
            appData.articleStatus || 'Draft'
        );

        await submitArticleForReview(savedArticle.id);

        setAppData(prev => ({
            ...prev,
            articleId: savedArticle.id,
            articleStatus: 'Awaiting Admin Review',
            blogPostData: blogPostDataForSave,
            originalBlogPostData: blogPostDataForSave,
            productData: sanitizedProductAssets.productData,
            productImageUrls: sanitizedProductAssets.productImageUrls,
            productImageVariants: {
                ...prev.productImageVariants,
                ...sanitizedProductAssets.productImageVariants,
            }
        }));

        setSubmitStatus('✅ Article submitted for review!');

    } catch (e: any) {
        console.error("Submission failed:", e);
        setSubmitStatus(`❌ Submission failed: ${e.message}`);
    } finally {
        // CRITICAL: Release the lock so subsequent actions can proceed
        isSavingRef.current = false;
        setIsSubmitting(false);
    }
};

const handlePublish = async (statusToSet: ArticleStatus) => {
    if (!appData.blogPostData) return;

    setPublishingStatus(PublishingStatus.Publishing);
    setPublishingProgress({ message: 'Preparing article...', logs: [] });
    setPublishError(null);

    const normalizedProductAssets = normalizeAmazonProductAssets(appData.productData, appData.productImageUrls);
    const sanitizedProductAssets = sanitizeProductFamilyAssets({
        productData: normalizedProductAssets.productData,
        productImageUrls: normalizedProductAssets.productImageUrls,
        productImageVariants: appData.productImageVariants,
        blogPostData: appData.blogPostData,
        articleTitle: appData.blogPostData?.title || '',
        blueprintType: appData.selectedBlueprint,
    });
    const blogPostDataForPublish = sanitizedProductAssets.blogPostData || appData.blogPostData;
    if (normalizedProductAssets.changed || sanitizedProductAssets.changed || sanitizedProductAssets.blogPostData !== appData.blogPostData) {
        setAppData(prev => ({
            ...prev,
            blogPostData: blogPostDataForPublish,
            originalBlogPostData: blogPostDataForPublish,
            productData: sanitizedProductAssets.productData,
            productImageUrls: sanitizedProductAssets.productImageUrls,
            productImageVariants: {
                ...prev.productImageVariants,
                ...sanitizedProductAssets.productImageVariants,
            }
        }));
    }

    let currentContent: ArticleContent = {
        blogPostData: blogPostDataForPublish,
        productData: sanitizedProductAssets.productData,
        stepImageUrls: appData.stepImageUrls,
        productImageUrls: sanitizedProductAssets.productImageUrls,
        productImageVariants: Object.fromEntries(
            Object.entries(appData.productImageVariants || {}).map(([key, value]) => [String(key), value])
        ),
        heroImageUrl: appData.heroImageUrl,
    };

    const hydratedAmazonAssets = await hydrateAmazonProductAssets(
        currentContent.productData,
        currentContent.productImageUrls,
        appData.productImageVariants || {},
        appData.amazonConfig,
        {
            blueprintType: appData.selectedBlueprint,
            articleTitle: appData.blogPostData?.title || '',
        }
    );
    const hydratedSanitizedProductAssets = sanitizeProductFamilyAssets({
        productData: hydratedAmazonAssets.productData,
        productImageUrls: hydratedAmazonAssets.productImageUrls,
        productImageVariants: hydratedAmazonAssets.productImageVariants,
        blogPostData: currentContent.blogPostData,
        articleTitle: currentContent.blogPostData?.title || '',
        blueprintType: appData.selectedBlueprint,
    });
    currentContent = {
        ...currentContent,
        blogPostData: hydratedSanitizedProductAssets.blogPostData || currentContent.blogPostData,
        productData: hydratedSanitizedProductAssets.productData,
        productImageUrls: hydratedSanitizedProductAssets.productImageUrls,
        productImageVariants: Object.fromEntries(
            Object.entries(hydratedSanitizedProductAssets.productImageVariants || {}).map(([key, value]) => [String(key), value])
        ),
    };
    setAppData(prev => ({
        ...prev,
        blogPostData: hydratedSanitizedProductAssets.blogPostData || prev.blogPostData,
        originalBlogPostData: hydratedSanitizedProductAssets.blogPostData || prev.originalBlogPostData,
        productData: hydratedSanitizedProductAssets.productData,
        productImageUrls: hydratedSanitizedProductAssets.productImageUrls,
        productImageVariants: {
            ...prev.productImageVariants,
            ...hydratedSanitizedProductAssets.productImageVariants,
        },
    }));

    let savedArticleId = appData.articleId;
    let savedArticleSlug = '';

    if (user) {
        try {
            const finalHtmlForSave = generateFinalHtml(
                currentContent.blogPostData, currentContent.productData, appData.amazonConfig, appData.styleConfig, userProfile, appData.stepImageUrls, currentContent.productImageUrls, false, appData.selectedBlueprint
            );
            const savedArticle = await saveArticle(
                currentContent, user.id, appData.articleId, appData.styleConfig, appData.selectedBlueprint, finalHtmlForSave, statusToSet
            );

            savedArticleId = savedArticle.id;
            savedArticleSlug = savedArticle.slug;
            const savedContentParsed = typeof savedArticle.content === 'string'
                ? JSON.parse(savedArticle.content)
                : savedArticle.content;
            currentContent = savedContentParsed;

            setAppData(prev => ({
                ...prev,
                articleId: savedArticle.id,
                heroImageUrl: savedArticle.image_url || prev.heroImageUrl,
                stepImageUrls: savedContentParsed.stepImageUrls,
                productImageUrls: savedContentParsed.productImageUrls,
                productImageVariants: savedContentParsed.productImageVariants || prev.productImageVariants,
            }));

        } catch (e: any) {
            console.error("Pre-publish save failed", e);
            setPublishingStatus(PublishingStatus.Error);
            setPublishError(`Save failed: ${e.message || 'Unknown error'}`);
            return; // Stop publishing
        }
    }

    const finalHtml = generateFinalHtml(
        currentContent.blogPostData,
        currentContent.productData,
        appData.amazonConfig,
        appData.styleConfig,
        userProfile,
        currentContent.stepImageUrls,
        currentContent.productImageUrls,
        false,
        appData.selectedBlueprint
    );

    // Upload images to Hostinger ONLY when publishing to PostGenius Pro blog
    if (statusToSet === 'Published' && user) {
        // Ensure we have a valid article ID (UUID from Supabase)
        if (!savedArticleId) {
            setPublishingStatus(PublishingStatus.Error);
            setPublishError('Article must be saved before publishing to blog');
            return;
        }

        setPublishingProgress({ message: 'Uploading images to Hostinger...', logs: [] });

        try {
            // Upload hero image
            if (currentContent.heroImageUrl) {
                console.log('[Hostinger Upload] Uploading hero image...');
                const hostingerHeroUrl = await uploadDataURIOrUrlImage(
                    currentContent.heroImageUrl,
                    savedArticleId,
                    'hero_image.webp'
                );
                currentContent.heroImageUrl = hostingerHeroUrl;
                console.log('[Hostinger Upload] ✅ Hero image uploaded:', hostingerHeroUrl);
            }

            // Upload step images
            if (currentContent.stepImageUrls && Object.keys(currentContent.stepImageUrls).length > 0) {
                const uploadedStepImages: Record<number | string, string> = {};
                for (const [key, url] of Object.entries(currentContent.stepImageUrls)) {
                    if (url) {
                        console.log(`[Hostinger Upload] Uploading step/section ${key}...`);
                        const uploadedUrl = await uploadDataURIOrUrlImage(
                            url,
                            savedArticleId,
                            `step_${key}.webp`
                        );
                        uploadedStepImages[key] = uploadedUrl;
                    }
                }
                currentContent.stepImageUrls = uploadedStepImages;
                console.log(`[Hostinger Upload] ✅ Uploaded ${Object.keys(uploadedStepImages).length} step/section images`);
            }

            // Upload product images
            if (currentContent.productImageUrls && Object.keys(currentContent.productImageUrls).length > 0) {
                const uploadedProductImages: Record<number, string> = {};
                for (const [id, url] of Object.entries(currentContent.productImageUrls)) {
                    const numericId = parseInt(id, 10);
                    const product = currentContent.productData.find(p => p.id === numericId);
                    const amazonUrl = product ? resolveAmazonProductImage(product, currentContent.productImageUrls, '600x600') : '';
                    const currentUrl = String(url || '').trim();
                    const preferredSourceUrl = isPlatformHostedImage(currentUrl)
                        ? currentUrl
                        : (amazonUrl || currentUrl);

                    if (!preferredSourceUrl) {
                        continue;
                    }

                    if (isPlatformHostedImage(preferredSourceUrl)) {
                        uploadedProductImages[numericId] = preferredSourceUrl;
                        continue;
                    }

                    uploadedProductImages[numericId] = await uploadHostedProductImage(
                        preferredSourceUrl,
                        savedArticleId,
                        numericId
                    );
                }
                currentContent.productImageUrls = uploadedProductImages;
                console.log(`[Hostinger Upload] ✅ Uploaded ${Object.keys(uploadedProductImages).length} product images`);
            }

            // Re-generate HTML with Hostinger URLs
            const finalHtmlWithHostingerUrls = generateFinalHtml(
                currentContent.blogPostData,
                currentContent.productData,
                appData.amazonConfig,
                appData.styleConfig,
                userProfile,
                currentContent.stepImageUrls,
                currentContent.productImageUrls,
                false,
                appData.selectedBlueprint
            );

            // Re-save article with Hostinger URLs
            const hostingerSavedArticle = await saveArticle(
                currentContent,
                user.id,
                savedArticleId,
                appData.styleConfig,
                appData.selectedBlueprint,
                finalHtmlWithHostingerUrls,
                statusToSet,
                savedArticleSlug
            );
            // Update slug just in case
            if (hostingerSavedArticle.slug) {
                savedArticleSlug = hostingerSavedArticle.slug;
            }

            console.log('[Hostinger Upload] ✅ All images uploaded and article saved with Hostinger URLs');

        } catch (uploadErr: any) {
            console.error('[Hostinger Upload] ❌ Failed:', uploadErr);
            setPublishingStatus(PublishingStatus.Error);
            setPublishError(`Failed to upload images to Hostinger: ${uploadErr.message}`);
            return;
        }
    }

    if (statusToSet === 'Published') {
        if (savedArticleId) {
            await updateArticleStatus(savedArticleId, 'Published');
            // UPDATE LOCAL STATE TO PREVENT AUTO-SAVE FROM REVERTING STATUS
            setAppData(prev => ({ ...prev, articleStatus: 'Published' }));

            setPublishingStatus(PublishingStatus.Success);
            // Use the real slug from the DB which includes valid characters and suffix
            setNewPostLink(`/blog/${savedArticleSlug}`);
        }
        return;
    }

    try {
        const imagePayload: ImagePayload = {
            hero: currentContent.heroImageUrl || '',
            steps: Object.values(currentContent.stepImageUrls || {}),
            products: currentContent.productData.map(p => {
                const primaryUrl = resolveAmazonProductImage(p, currentContent.productImageUrls, '600x600');
                // Clone variants array to avoid mutating state
                const variants = [...(appData.productImageVariants?.[p.id] || [])]
                    .map(url => String(url || '').trim())
                    .filter(url => isAmazonHostedImage(url));

                // Logic: If the primary URL (e.g. AI generated) is different from the original Amazon image,
                // we MUST save the original Amazon image as a variant to ensure it's in the Media Library.
                if (p.imageUrl && isAmazonHostedImage(p.imageUrl) && p.imageUrl !== primaryUrl && !variants.includes(p.imageUrl)) {
                    variants.unshift(p.imageUrl);
                }

                return {
                    id: p.id,
                    url: primaryUrl,
                    variants: variants, // ✅ Pass comprehensive variants list
                    productName: p.productName // ✅ Pass name for accurate metadata
                };
            }).filter(p => p.url)
        };

        const result = await publishPost(
            appData.wordpressConfig,
            appData.blogPostData,
            finalHtml,
            imagePayload,
            (progress) => setPublishingProgress(prev => ({ ...prev, ...progress, logs: [...prev.logs, progress.log || ''] })),
            statusToSet,
            user?.id,
            savedArticleId
        );

        setPublishingStatus(PublishingStatus.Success);
        setNewPostLink(result.link);
        setNewPostId(result.id);

    } catch (error: any) {
        console.error("Publishing error:", error);
        setPublishingStatus(PublishingStatus.Error);
        setPublishError(error.message || 'An unknown error occurred.');
    }
};

const handleFeaturedImageUpload = async (file: File) => {
    if (!user) return;
    try {
        const safeFilename = file.name.replace(/[^a-zA-Z0-9_.-]/g, '_');
        const path = `${user.id}/uploads/${Date.now()}_${safeFilename}`;
        await uploadImage(ARTICLE_IMAGES_BUCKET_NAME, file, path);
        const publicUrl = await getPublicUrl(ARTICLE_IMAGES_BUCKET_NAME, path);

        setAppData(prev => ({ ...prev, heroImageUrl: publicUrl }));
    } catch (e) {
        console.error("Failed to upload featured image", e);
        alert("Failed to upload image.");
    }
};

const handleFeaturedImageRemove = async () => {
    setAppData(prev => ({ ...prev, heroImageUrl: '' }));
};

const handleInputChange = (val: string) => {
    setAppData(prev => {
        const isUrl = isValidUrl(val);

        // Only auto-detect inputType if user hasn't manually selected 'asin'
        // If they selected ASIN, keep it as ASIN regardless of input format
        const newInputType = prev.inputType === 'asin'
            ? 'asin'  // Keep ASIN if manually selected
            : isUrl ? 'url' : 'keyword';  // Otherwise auto-detect

        return {
            ...prev,
            inputVal: val,
            inputType: newInputType
        };
    });
};

/**
 * Handles custom image upload to Hostinger server
 */
const handleCustomImageUpload = async (file: File) => {
    try {
        setIsUploadingImage(true);

        // Generate article ID if we don't have one yet
        const currentArticleId = appData.articleId || `draft_${Date.now()}`;

        console.log('[Hostinger Upload] Starting upload...', {
            file: file.name,
            size: `${(file.size / 1024).toFixed(2)}KB`,
            articleId: currentArticleId
        });

        // Upload to Hostinger PHP API
        const imageUrl = await uploadArticleImage(file, currentArticleId);

        console.log('[Hostinger Upload] ✅ Success!', imageUrl);

        // Update the hero image URL in app state
        setAppData(prev => ({
            ...prev,
            heroImageUrl: imageUrl,
            articleId: currentArticleId
        }));

    } catch (error: any) {
        console.error('[Hostinger Upload] ❌ Failed:', error);
        alert(`Image upload failed: ${error.message}\n\nPlease try again or check console for details.`);
    } finally {
        setIsUploadingImage(false);
    }
};

/**
 * Handles removing the custom uploaded image
 */
const handleRemoveCustomImage = () => {
    setAppData(prev => ({
        ...prev,
        heroImageUrl: ''
    }));
};

const renderCurrentStep = () => {
    if (appData.currentStep === AppStep.Review && appData.blogPostData) {
        const finalHtmlForPreview = generateFinalHtml(
            appData.blogPostData,
            appData.productData,
            appData.amazonConfig,
            appData.styleConfig,
            userProfile,
            appData.stepImageUrls,
            appData.productImageUrls,
            true,
            appData.selectedBlueprint
        );

        return (
            <>
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
                    <div className="lg:col-span-2 bg-white rounded-xl shadow-lg overflow-hidden">
                        <BlogPostPreview
                            htmlContent={finalHtmlForPreview}
                            blogPostData={appData.blogPostData}
                            heroImageUrl={appData.heroImageUrl}
                            stepImageUrls={appData.stepImageUrls}
                            productImageUrls={appData.productImageUrls}
                            productImageVariants={Object.fromEntries(
                                Object.entries(appData.productImageVariants || {}).map(([key, value]) => [String(key), value])
                            )}
                            productData={appData.productData}
                            onRegenerateImage={handleRegenerateImage}
                            onSwapImage={handleSwapImage}
                            loadingImages={loadingImages}
                            styleConfig={appData.styleConfig}
                            onUpdateHtml={handleHtmlUpdate}
                            amazonConfig={appData.amazonConfig}
                            authorName={userProfile?.full_name || userProfile?.username || user?.email || 'PostGenius Pro'}
                            blueprintType={appData.selectedBlueprint}
                        />
                    </div>
                    <div className="space-y-8 sticky top-8">
                        <React.Suspense fallback={<LoadingSpinner />}>
                            <PublishingWorkflow
                                data={appData.blogPostData}
                                wpConfig={appData.wordpressConfig}
                                onPublish={handlePublish}
                                publishingStatus={publishingStatus}
                                publishingProgress={publishingProgress}
                                publishError={publishError}
                                newPostLink={newPostLink}
                                newPostId={newPostId}
                                userRole={userRole}
                                articleStatus={appData.articleStatus}
                                onSubmitForReview={handleSubmitForReview}
                                isSubmitting={isSubmitting}
                                submitStatus={submitStatus}
                                finalHtml={finalHtmlForPreview}
                                onReset={handleResetPublishing}
                                heroImageUrl={appData.heroImageUrl}
                                onRegenerateImage={handleRegenerateImage}
                                isLoadingHeroImage={loadingImages.has('hero')}
                            />
                        </React.Suspense>

                        <div className="p-4 bg-white rounded-lg shadow border border-gray-200">
                            <FeaturedImageUploader
                                heroImageUrl={appData.heroImageUrl}
                                onImageUpload={handleCustomImageUpload}
                                onImageRemove={handleRemoveCustomImage}
                                isLoading={isUploadingImage}
                                articleId={appData.articleId || 'draft'}
                            />
                        </div>
                    </div>
                </div>

                <StockImagePickerModal
                    isOpen={isPickerOpen}
                    onClose={() => setIsPickerOpen(false)}
                    imageKey={pickerKey}
                    prompt={pickerPrompt}
                    candidates={pickerCandidates}
                    isLoading={isPickerLoading}
                    onSelect={handlePickerSelect}
                    onGenerateAi={handlePickerGenerateAi}
                />
            </>
        );
    }

return (
    <div className="max-w-4xl mx-auto w-full px-2">
        <div className="mb-8">
            <StatusBar currentStep={appData.currentStep} onStepClick={handleStepClick} />
        </div>

        {appData.currentStep === AppStep.BlueprintSelection && (
            <BlueprintSelection onSelectBlueprint={(bp) => setAppData(prev => ({ ...prev, selectedBlueprint: bp, currentStep: AppStep.Input }))} />
        )}

        {appData.currentStep === AppStep.Input && (
            <UrlInput
                limitInfo={articleLimitInfo}
                session={session}
                appData={appData}
                onAppDataChange={setAppData}
                onInputChange={handleInputChange}
                onWpConfigChange={(e) => setAppData(prev => ({ ...prev, wordpressConfig: { ...prev.wordpressConfig, [e.target.name]: e.target.value } }))}
                onAmazonConfigChange={(e) => setAppData(prev => ({ ...prev, amazonConfig: { ...prev.amazonConfig, [e.target.name]: e.target.value } }))}
                onAiConfigChange={(e) => setAppData(prev => ({ ...prev, aiConfig: { ...prev.aiConfig, [e.target.name]: e.target.value } }))}
                onGenerate={handleGenerate}
                onSaveConfig={handleSaveConfig}
                onClearConfig={handleClearConfig}
                saveStatus={saveStatus}
                error={error}
                onBack={() => setAppData(prev => ({ ...prev, currentStep: AppStep.BlueprintSelection }))}
                isGenerationDisabled={isBlocked}
            />
        )}

        {appData.currentStep === AppStep.Generating && (
            <div className="text-center py-20 px-4">
                <LoadingSpinner />
                <h2 className="text-xl sm:text-2xl font-bold mt-6 text-text-headings">Generating Your Article...</h2>
                <p className="text-text-secondary mt-2 text-sm sm:text-base">{statusMessage}</p>
                {error && (
                    <div className="mt-4 text-red-400 bg-red-900/20 p-4 rounded-lg max-w-xl mx-auto text-sm">
                        <p>Error: {error}</p>
                        <button onClick={() => setAppData(prev => ({ ...prev, currentStep: AppStep.Input }))} className="mt-2 underline">Go Back</button>
                    </div>
                )}
            </div>
        )}
    </div>
);
};

return (
    <LicenseGuard userEmail={user?.email} userTier={userProfile?.subscription_tier}>
        <MainLayout session={session} userRole={userRole} onLogoClick={handleLogoClick} userProfile={userProfile}>
            <Routes>
                <Route path="/" element={<LandingPage onStartCreate={handleStart} aiConfig={appData.aiConfig} />} />

                <Route path="/generator" element={
                    <ProtectedRoute user={user}>
                        <div className="space-y-8">{renderCurrentStep()}</div>
                    </ProtectedRoute>
                } />

                <Route path="/blog" element={<BlogPage session={session} onEdit={handleEditArticle} />} />
                <Route path="/blog/:slug" element={<BlogPostPage session={session} onEdit={handleEditArticle} />} />
                <Route path="/author/:userId" element={<AuthorProfilePage />} />

                <Route path="/my-articles" element={
                    <ProtectedRoute user={user}>
                        <MyArticlesPage onEdit={handleEditArticle} onNew={handleStart} />
                    </ProtectedRoute>
                } />

                <Route path="/profile" element={
                    <ProtectedRoute user={user}>
                        <MemberProfilePage session={session} />
                    </ProtectedRoute>
                } />

                <Route path="/admin" element={
                    <AdminRoute userRole={userRole}>
                        <React.Suspense fallback={<LoadingSpinner />}>
                            <AdminDashboard userRole={userRole} onEdit={handleEditArticle} onNew={handleStart} />
                        </React.Suspense>
                    </AdminRoute>
                } />

                <Route path="/settings" element={
                    <ProtectedRoute user={user}>
                        <SettingsPage
                            session={session}
                            initialProfile={userProfile}
                            initialStyleConfig={appData.styleConfig}
                            onProfileUpdated={setUserProfile}
                            onStyleConfigUpdated={(config) => setAppData(prev => ({ ...prev, styleConfig: config }))}
                        />
                    </ProtectedRoute>
                } />

                <Route path="/analytics" element={
                    <ProRoute userProfile={userProfile}>
                        {user ? <AnalyticsDashboard userId={user.id} /> : <Navigate to="/login" replace />}
                    </ProRoute>
                } />

                <Route path="/support" element={
                    <PremiumRoute userProfile={userProfile}>
                        <PremiumSupportForm
                            userEmail={user?.email}
                            userName={userProfile?.full_name || ''}
                        />
                    </PremiumRoute>
                } />

                <Route path="/login" element={session ? <Navigate to="/dashboard" replace /> : <AuthPage />} />
                <Route path="/signup" element={session ? <Navigate to="/dashboard" replace /> : <AuthPage />} />
                <Route path="/dashboard" element={<Navigate to="/my-articles" replace />} />
                
                <Route path="/features" element={<FeaturesPage />} />
                <Route path="/pricing" element={<PricingPage session={session} />} />
                <Route path="/success" element={<SuccessPage session={session} />} />
                <Route path="/about" element={<AboutPage />} />
                <Route path="/contact" element={<ContactPage />} />
                <Route path="/faq" element={<FaqPage />} />
                <Route path="/privacy-policy" element={<PrivacyPolicyPage />} />
                <Route path="/terms" element={<TermsOfServicePage />} />
                <Route path="/affiliate-disclosure" element={<AffiliateDisclosurePage />} />
                <Route path="*" element={<NotFoundPage />} />
            </Routes >
        </MainLayout >
    </LicenseGuard>
);
}

export default App;





