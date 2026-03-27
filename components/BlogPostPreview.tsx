
import React, { useMemo, useCallback, useRef, useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import LoadingSpinner from './LoadingSpinner';
import { RECIPE_CARD_CSS, PRODUCT_VERDICT_BOX_CSS, MAIN_CTA_BUTTON_CSS, FAQ_SECTION_CSS } from '../styles/postStyles';
import type { BlogPostData, StyleConfig, AmazonProduct, AmazonConfig } from '../types';
import { defaultStyleConfig, isAmazonHostedImage, isPlatformHostedImage, resolvePreferredProductImageUrl, sanitizeProductCardTitlesInHtml } from '../services/styleService';
import { normalizeAmazonMasterArticleHtml } from '../services/reviewLayoutService';
import { buildAmazonProductSearchQueries, hasVerifiableAmazonIdentity } from '../services/amazonService';

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

interface ImageWithRegenerateProps {
  imageKey: string;
  imageUrl: string;
  alt: string;
  onRegenerateImage: (imageKey: string) => void;
  isLoading: boolean;
  containerClassName?: string;
  imageClassName?: string;
  children?: React.ReactNode;
}

const ImageWithRegenerate: React.FC<ImageWithRegenerateProps> = ({
  imageKey,
  imageUrl,
  alt,
  onRegenerateImage,
  isLoading,
  containerClassName = "w-full my-4 relative group aspect-video bg-gray-900/50 rounded-lg overflow-hidden",
  imageClassName = "w-full h-full object-cover rounded-lg shadow-md block",
  children,
}) => {
  const isPlaceholder = imageUrl?.startsWith('data:image/svg+xml');

  return (
    <div className={containerClassName}>
      <img src={imageUrl} alt={alt} className={imageClassName} />
      {children}
      {isLoading && (
        <div className="absolute inset-0 bg-black/80 flex items-center justify-center z-10 rounded-lg">
          <LoadingSpinner />
          <span className="ml-2 animate-pulse font-medium text-gray-200">Generating...</span>
        </div>
      )}
      {!isLoading && onRegenerateImage && (
        <div className={`absolute inset-0 bg-black/60 flex items-center justify-center transition-opacity rounded-lg z-20 ${isPlaceholder ? 'opacity-100 pointer-events-auto' : 'opacity-0 group-hover:opacity-100 pointer-events-none'}`}>
          <button
            type="button"
            onClick={() => onRegenerateImage(imageKey)}
            className="pointer-events-auto px-5 py-3 bg-accent hover:bg-cyan-400 text-white font-bold rounded-lg shadow-lg transition-all duration-300 ease-in-out text-sm transform hover:scale-105"
          >
            Regenerate
          </button>
        </div>
      )}
    </div>
  );
};

interface BlogPostPreviewProps {
  htmlContent: string;
  blogPostData: BlogPostData;
  heroImageUrl: string;
  stepImageUrls: Record<string, string>;
  productImageUrls: Record<string, string>;
  productImageVariants?: Record<string, string[]>;
  productData?: AmazonProduct[];
  onRegenerateImage: (imageKey: string) => void;
  onSwapImage: (imageKey: string) => void;
  loadingImages: Set<string>;
  styleConfig?: StyleConfig;
  onUpdateHtml?: (newHtml: string) => void;
  amazonConfig?: AmazonConfig;
  authorName?: string;
  authorId?: string;
  blueprintType?: string;
}

const BlogPostPreview: React.FC<BlogPostPreviewProps> = ({
  htmlContent,
  blogPostData,
  heroImageUrl,
  stepImageUrls,
  productImageUrls,
  productImageVariants,
  productData,
  onRegenerateImage,
  loadingImages,
  styleConfig,
  onUpdateHtml,
  amazonConfig,
  authorName,
  authorId,
  blueprintType,
  ...props
}) => {



  const { title, category, tags } = blogPostData;
  const allTags = [...tags.course, ...tags.cuisine, ...tags.keywords];
  const hasAmazonMasterMarkup = useMemo(() => {
    const lower = String(htmlContent || '').toLowerCase();
    return (
      lower.includes('amazon-comparison-grid') ||
      lower.includes('amazon-review-card') ||
      lower.includes('amazon product comparison') ||
      lower.includes('data-product-id=')
    );
  }, [htmlContent]);
  const isAmazonMasterPreview = blogPostData.niche === 'review' && hasAmazonMasterMarkup;
  const isRecipePreview = blueprintType === 'recipe';
  const contentRef = useRef<HTMLDivElement>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editableHtml, setEditableHtml] = useState(htmlContent);

  useEffect(() => {
    if (!isEditing) {
      setEditableHtml(htmlContent);
    }
  }, [htmlContent, isEditing]);

  const handleEditToggle = () => {
    if (isEditing && onUpdateHtml) {
      onUpdateHtml(editableHtml);
    }
    setIsEditing(!isEditing);
  };

  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setEditableHtml(e.target.value);
  };

  const currentConfig = { ...defaultStyleConfig, ...(styleConfig || {}) };
  const getProductVariantImages = useCallback((productId: number | string): string[] => {
    const direct = productImageVariants?.[String(productId)] || productImageVariants?.[productId as keyof typeof productImageVariants] || [];
    return (direct || []).filter(url => isAmazonHostedImage(url) || isPlatformHostedImage(url));
  }, [productImageVariants]);
  const collectOrderedAmazonMasterSectionImages = useCallback((): string[] => {
    const perProductImages = (productData || [])
      .slice()
      .sort((left, right) => (Number(left.id) || 0) - (Number(right.id) || 0))
      .map(product => {
        const primary = resolvePreferredProductImageUrl(product, productImageUrls, '1200x1200');
        const variants = getProductVariantImages(product.id).filter(url => url !== primary);
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
  }, [getProductVariantImages, productData, productImageUrls]);
  const amazonMasterProductImages = useMemo(() => {
    return collectOrderedAmazonMasterSectionImages();
  }, [collectOrderedAmazonMasterSectionImages]);
  const previewHeroImageUrl = useMemo(() => String(heroImageUrl || '').trim(), [heroImageUrl]);
  const canManageRecipeProductImage = useCallback((productId: string): boolean => {
    if (!isRecipePreview) return true;

    const product = productData?.find(item => item.id === parseInt(productId, 10));
    if (!product) return false;

    if (hasVerifiableAmazonIdentity(product)) return true;

    const queries = buildAmazonProductSearchQueries(product, {
      blueprintType,
      articleTitle: blogPostData?.title || '',
    });

    return queries.length > 0;
  }, [blogPostData?.title, blueprintType, isRecipePreview, productData]);

  const cssVariables = `
    :root {
        --pgp-primary-color: ${currentConfig.custom_primary_color};
        --pgp-secondary-color: ${currentConfig.custom_secondary_color};
        --pgp-font-family: ${currentConfig.custom_font_family};
        
        /* Dynamic Theme vars */
        --pgp-text-color: ${currentConfig.custom_background_style === 'Dark' ? '#E5E7EB' : '#374151'};
        --pgp-heading-color: ${currentConfig.custom_background_style === 'Dark' ? '#FFFFFF' : '#111827'};
        --pgp-text-secondary: ${currentConfig.custom_background_style === 'Dark' ? '#9CA3AF' : '#6B7280'};
        --pgp-card-bg: ${currentConfig.custom_background_style === 'Dark' ? '#1F2937' : '#FFFFFF'};
        --pgp-secondary-bg: ${currentConfig.custom_background_style === 'Dark' ? '#111827' : '#F9FAFB'};
        --pgp-border-color: ${currentConfig.custom_background_style === 'Dark' ? '#374151' : '#E5E7EB'};
    }
  `;

  const handleContentClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;

    // Handle Regenerate Buttons
    const button = target.closest('button[data-regenerate]');
    if (button) {
      e.preventDefault();
      e.stopPropagation();
      const imageKey = button.getAttribute('data-regenerate');
      if (imageKey) {
        onRegenerateImage(imageKey);
      }
      return;
    }

    // Handle Swap Buttons (Human-in-the-loop)
    const swapBtn = target.closest('button[data-swap]');
    if (swapBtn) {
      e.preventDefault();
      e.stopPropagation();
      const imageKey = swapBtn.getAttribute('data-swap');
      if (imageKey && props.onSwapImage) {
        props.onSwapImage(imageKey);
      }
      return;
    }

    // Handle Links
    const link = target.closest('a');
    if (link) {
      const href = link.getAttribute('href');

      // Prevent navigation for empty links, hash links, or javascript:void(0)
      if (!href || href === '#' || href.startsWith('javascript:') || href.trim() === '') {
        e.preventDefault();
        console.warn('Blocked navigation for empty/invalid link');
        return;
      }

      // Force external links to open in new tab
      if (!link.getAttribute('target')) {
        link.setAttribute('target', '_blank');
        link.setAttribute('rel', 'noopener noreferrer');
      }
    }
  }, [onRegenerateImage]);

  const processedHtml = useMemo(() => {
    let content = editableHtml || '';

    const constructImageHtml = (
      type: 'step' | 'product' | 'section',
      id: string,
      url: string,
      isLoading: boolean,
      originalTag: string,
      wrapperClassOverride?: string,
      imgClassOverride?: string
    ) => {
      const productInfo = productData?.find(p => p.id === parseInt(id));
      const altMatch = originalTag.match(/alt="([^"]*)"/);

      let alt = '';
      if (productInfo?.productName) alt = productInfo.productName;
      else if (altMatch?.[1]) alt = altMatch[1];
      else if (type === 'step') alt = `Step ${id}`;
      else if (type === 'section') alt = `Section ${id}`;
      else alt = `Product ${id}`;

      const fallbackSvg = `data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4MDAiIGhlaWdodD0iNDUwIiB2aWV3Qm94PSIwIDAgODAwIDQ1MCI+PHJlY3Qgd2lkdGg9IjEwMCUiIGhlaWdodD0iMTAwJSIgZmlsbD0iIzFmMjAzYSIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBmb250LWZhbWlseT0ic2Fucy1zZXJpZiIgZm9udC1zaXplPSIyNCIgZmlsbD0iIzU1NSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZG9taW5hbnQtYmFzZWxpbmU9Im1pZGRsZSI+SW1hZ2UgR2VuZXJhdGlvbiBQZW5kaW5nPC90ZXh0Pjwvc3ZnPg==`;
      const resolvedUrl = type === 'product'
        ? (() => {
            if (productInfo) {
              const preferred = resolvePreferredProductImageUrl(productInfo, productImageUrls, '600x600');
              if (preferred && (isAmazonHostedImage(preferred) || isPlatformHostedImage(preferred))) return preferred;
            }

            const mappedImage = String(url || '').trim();
            if (isAmazonHostedImage(mappedImage) || isPlatformHostedImage(mappedImage)) return mappedImage;
            return '';
          })()
        : url;
      const displayUrl = resolvedUrl || fallbackSvg;
      const isPlaceholder = displayUrl.startsWith('data:image/svg+xml');

      let imageKey: string;
      if (type === 'step') {
        imageKey = `step_${parseInt(id) - 1}`;
      } else if (type === 'section') {
        imageKey = `section_${id}`;
      } else {
        imageKey = `product_${id}`;
      }

      const spinner = `
            <div class="absolute inset-0 bg-black/80 flex items-center justify-center z-20 rounded-lg">
                <svg class="animate-spin h-8 w-8 text-cyan-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
            </div>
        `;

      const overlayClass = `absolute inset-0 bg-black/60 flex items-center justify-center transition-opacity rounded-lg z-10 ${isPlaceholder ? 'opacity-100 pointer-events-auto' : 'opacity-0 group-hover:opacity-100 pointer-events-none'}`;
      const buttonClass = `pointer-events-auto px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-white font-bold rounded shadow transition-transform transform hover:scale-105 text-sm`;
      const allowProductImageActions = type !== 'product' || canManageRecipeProductImage(id);

      const regenerateOverlay = allowProductImageActions ? `
            <div class="${overlayClass} gap-2">
                <button type="button" data-regenerate="${imageKey}" class="${buttonClass}">
                    Regenerate
                </button>
                <button type="button" data-swap="${imageKey}" class="pointer-events-auto px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded shadow transition-transform transform hover:scale-105 text-sm flex items-center gap-1">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
                    Swap
                </button>
            </div>
  ` : '';

      // Defaults for standard blog images
      const wrapperClass = wrapperClassOverride || "relative group w-full my-6 rounded-lg overflow-hidden shadow-md bg-gray-100 aspect-video";
      const imgClass = imgClassOverride || "absolute inset-0 w-full h-full object-cover";

      const onErrorHandler = `
this.onerror = null;
this.src = '${fallbackSvg}';
const overlay = this.parentElement.querySelector('.bg-black\\\\/60');
if (overlay) {
  overlay.classList.remove('opacity-0', 'group-hover:opacity-100', 'pointer-events-none');
  overlay.classList.add('opacity-100', 'pointer-events-auto');
}
`.replace(/\s+/g, ' ');

      return `
  <div class="${wrapperClass}">
    <img src="${displayUrl}" alt="${alt}" class="${imgClass}" loading="lazy" onError="${onErrorHandler}" />
                ${!isLoading ? regenerateOverlay : ''}
                ${isLoading ? spinner : ''}
            </div>
  `;
    };

    // 1. Handle Step Images
    content = content.replace(/(\[STEP_IMAGE_\s*(\d+)\s*\])|(<img[^>]*src="\[STEP_IMAGE_\s*(\d+)\s*\]"[^>]*>)/g, (match, rawGroup, rawId, imgGroup, imgId) => {
      const id = rawId || imgId;
      const index = parseInt(id, 10) - 1;
      const url = stepImageUrls[index];
      const imageKey = `step_${index}`;
      return constructImageHtml('step', id, url, loadingImages.has(imageKey), match);
    });

    // 1b. Handle Content Section Images (Roundup/Review/HowTo)
    content = content.replace(/(\[CONTENT_SECTION_IMAGE_\s*(\d+)\s*\])|(<img[^>]*src="\[CONTENT_SECTION_IMAGE_\s*(\d+)\s*\]"[^>]*>)/g, (match, rawGroup, rawId, imgGroup, imgId) => {
      const id = rawId || imgId;
      const imageKey = `section_${id}`;
      const url = isAmazonMasterPreview
        ? (amazonMasterProductImages[Math.max(0, (parseInt(id, 10) || 1) - 1)] || stepImageUrls[imageKey] || '')
        : stepImageUrls[imageKey];
      return constructImageHtml('section', id, url, loadingImages.has(imageKey), match);
    });

    // 2. Handle Standard Product Images (in text)
    content = content.replace(/(\[PRODUCT_IMAGE_URL_\s*(\d+)\s*\])|(<img[^>]*src="\[PRODUCT_IMAGE_URL_\s*(\d+)\s*\]"[^>]*>)/g, (match, rawGroup, rawId, imgGroup, imgId) => {
      const id = rawId || imgId;
      const url = productImageUrls[id];
      const imageKey = `product_${id}`;
      return constructImageHtml('product', id, url, loadingImages.has(imageKey), match);
    });

    // 3. Handle Product Box Images (marked with data-product-id from styleService)
    content = content.replace(/<img[^>]*data-product-id="(\d+)"[^>]*>/g, (match, id) => {
      const url = productImageUrls[id];
      const imageKey = `product_${id}`;
      // Use styles that fit inside the product-verdict-image container (180x180 flex centered)
      // Use object-contain to ensure the full product image is visible
      return constructImageHtml(
        'product',
        id,
        url,
        loadingImages.has(imageKey),
        match,
        "relative group w-full h-full flex items-center justify-center",
        "max-w-full max-h-full object-contain"
      );
    });

    // Capture legacy [PRODUCT_AFFILIATE_LINK_X]
    const affiliateLinkRegex = /(href\s*=\s*["']?)\s*\[\s*PRODUCT_AFFILIATE_LINK_(\d+)\s*\]|\[\s*PRODUCT_AFFILIATE_LINK_(\d+)\s*\]/gi;
    content = content.replace(affiliateLinkRegex, (match, hrefPrefix, idInside, idStandalone) => {
      const idStr = idInside || idStandalone;
      if (!idStr) return match;

      const product = productData?.find(p => p.id === parseInt(idStr));
      let url = product?.url;

      // Fallback to search URL if specific product URL is missing
      if (!url || url === '#' || url.trim() === '') {
        const affiliateTag = amazonConfig?.associateTag || 'yourtag-20';
        if (product?.productName) {
          url = `https://www.amazon.com/s?k=${encodeURIComponent(product.productName)}&tag=${affiliateTag}`;
        } else {
          url = '#';
        }
      }

      // If it's inside an href, we keep the link logic (placeholder mostly)
      if (hrefPrefix) {
        // Inject target="_blank" for affiliate links to ensure they open in new tab
        return `target="_blank" rel="noopener noreferrer" ${hrefPrefix}${url}`;
      }

      // If it's a standalone placeholder, we remove it entirely
      return '';
    });

    content = content.replace(/<a\b(?![^>]*\btarget=)/gi, '<a target="_blank" rel="noopener noreferrer" ');

    const finalContent = isAmazonMasterPreview ? normalizeAmazonMasterArticleHtml(content) : content;
    return sanitizeProductCardTitlesInHtml(finalContent, productData || []);
  }, [editableHtml, isAmazonMasterPreview, stepImageUrls, productImageUrls, loadingImages, productData, amazonMasterProductImages, canManageRecipeProductImage]);


  return (
    <>
      <style>{cssVariables}</style>
      <style>{`
        .post-content { font-family: var(--pgp-font-family); color: var(--pgp-text-color); }
        .post-content h2 { font-size: ${isAmazonMasterPreview ? '1.35rem' : '1.5rem'}; font-weight: 700; color: var(--pgp-heading-color); margin-top: ${isAmazonMasterPreview ? '1.7rem' : '2rem'}; margin-bottom: 0.8rem; }
        @media (min-width: 640px) { .post-content h2 { font-size: 1.8rem; margin-top: 2.5rem; margin-bottom: 1rem; } }
        
        .post-content h3 { font-size: ${isAmazonMasterPreview ? '1.08rem' : '1.25rem'}; font-weight: 600; color: var(--pgp-text-color); margin-top: 1.5rem; margin-bottom: 0.6rem; }
        @media (min-width: 640px) { .post-content h3 { font-size: 1.4rem; margin-top: 2.0rem; margin-bottom: 0.8rem; } }
        
        .post-content p { margin-bottom: 1rem; line-height: ${isAmazonMasterPreview ? '1.82' : '1.7'}; font-size: ${isAmazonMasterPreview ? '0.98rem' : '1rem'}; }
        @media (min-width: 640px) { .post-content p { margin-bottom: 1.2rem; font-size: ${isAmazonMasterPreview ? '1rem' : '1.05rem'}; } }
        
        .post-content ul, .post-content ol { margin-bottom: 1.5rem; padding-left: 1.2rem; }
        @media (min-width: 640px) { .post-content ul, .post-content ol { padding-left: 1.5rem; } }
        
        .post-content ul { list-style-type: disc; }
        .post-content ol { list-style-type: decimal; }
        .post-content li { margin-bottom: 0.5rem; line-height: 1.6; }
        .post-content a { color: ${isAmazonMasterPreview ? '#b7791f' : 'var(--pgp-secondary-color)'}; text-decoration: none; }
        .post-content a:hover { text-decoration: underline; }
        .post-content strong { color: var(--pgp-heading-color); font-weight: 700; }
        .post-content blockquote { border-left: 4px solid var(--pgp-secondary-color); padding-left: 1rem; font-style: italic; color: var(--pgp-text-secondary); margin: 1.5rem 0; }
        ${isAmazonMasterPreview ? `
        .post-content img{border-radius:0!important;border:1px solid #e4d8c5!important;box-shadow:0 10px 28px rgba(15,23,42,.06)!important}
        .post-content .amazon-review-title,.post-content .amazon-compare-title,.post-content .faq-question,.post-content .amazon-key-features h4,.post-content .pros-box h4,.post-content .cons-box h4{color:#111827!important}
        .post-content .amazon-review-summary,.post-content .amazon-review-tradeoff,.post-content .faq-answer,.post-content .faq-answer p,.post-content .amazon-compare-description,.post-content .amazon-compare-features,.post-content .amazon-compare-rating,.post-content .product-verdict-description,.post-content .amazon-key-features li,.post-content .pros-box li,.post-content .cons-box li{color:#475569!important}
        .post-content .amazon-table-cta-button,.post-content .amazon-cta-button-full,.post-content .amazon-cta-button,.post-content .pgp-cta-button{background:linear-gradient(180deg,#ffd66e 0%,#f7b733 52%,#eea91d 100%)!important;color:#3f2602!important;border-color:#d69b1b!important;box-shadow:0 10px 22px rgba(247,183,51,.28), inset 0 1px 0 rgba(255,255,255,.65)!important;border-radius:999px!important}
        .review-preview-head{margin-bottom:1.5rem;padding-bottom:1rem;border-bottom:1px solid #ece2d3}
        .review-preview-kicker{display:inline-flex;align-items:center;gap:.45rem;padding:.28rem .72rem;border-radius:999px;background:#fff4d6;border:1px solid #f6d48c;color:#9a6700;font:800 .72rem/1 Manrope,sans-serif;letter-spacing:.08em;text-transform:uppercase}
        .review-preview-title{margin:.9rem 0 .5rem;font:800 clamp(1.9rem,4vw,3rem)/1.08 Manrope,sans-serif;color:#111827}
        .review-preview-meta{display:flex;flex-wrap:wrap;gap:.75rem;color:#6b7280;font:600 .84rem/1.5 Manrope,sans-serif}
        ` : ''}
      `}</style>
      <style>{RECIPE_CARD_CSS}</style>
      <style>{PRODUCT_VERDICT_BOX_CSS}</style>
      <style>{MAIN_CTA_BUTTON_CSS}</style>
      <style>{FAQ_SECTION_CSS}</style>

      <div className={`relative overflow-hidden rounded-xl shadow-2xl border ${isAmazonMasterPreview ? 'bg-[#f4eee4] border-[#dbc9a8]' : 'bg-card-bg border-border-color'}`}>
        {onUpdateHtml && (
          <div className="absolute top-4 right-4 z-30">
            <button
              onClick={handleEditToggle}
              className="bg-card-bg/90 backdrop-blur border border-border-color text-text-primary px-3 py-1.5 sm:px-4 sm:py-2 rounded-full shadow-lg hover:border-accent hover:text-accent transition-all text-xs sm:text-sm font-medium flex items-center gap-2"
            >
              {isEditing ? '💾 Save & Preview' : '✏️ Edit Content'}
            </button>
          </div>
        )}

        {/* Hero Image Container - Updated to 2.8:1 Panoramic (35.71%) to match Kale Pro fix */}
        {previewHeroImageUrl && (
        <div className="relative w-full overflow-hidden" style={{ paddingBottom: '35.71%' }}>
          {previewHeroImageUrl && (
            <ImageWithRegenerate
              imageKey="hero"
              imageUrl={previewHeroImageUrl}
              alt={title || 'Blog post featured image'}
              onRegenerateImage={onRegenerateImage}
              isLoading={loadingImages.has('hero')}
              containerClassName="absolute inset-0 w-full h-full overflow-hidden"
              imageClassName="absolute inset-0 w-full h-full object-cover"
            >
              <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center text-center p-4">
                <p className="text-xs sm:text-sm uppercase text-white/80 font-semibold tracking-widest mb-2 sm:mb-4">
                  {new Date(new Date().setFullYear(2025)).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                </p>
                {title && (
                  <h1 className="text-2xl sm:text-3xl lg:text-5xl font-heading text-white mb-2 sm:mb-4 max-w-4xl mx-auto leading-tight text-shadow-lg px-2">
                    {title}
                  </h1>
                )}
                <div className="w-12 sm:w-16 h-0.5 bg-white/50 mx-auto"></div>
                <p className="text-xs sm:text-sm uppercase text-white/80 font-semibold tracking-widest mt-2 sm:mt-4">
                  0 Comments
                </p>
              </div>
            </ImageWithRegenerate>
          )}
        </div>
        )}

        <div
          className="p-4 sm:p-8 md:p-12"
          style={{
            backgroundColor: isAmazonMasterPreview ? '#fffdf9' : (currentConfig.custom_background_style === 'Dark' ? '#111827' : (currentConfig.custom_background_style === 'Transparent' ? 'transparent' : '#ffffff')),
            color: isAmazonMasterPreview ? '#374151' : (currentConfig.custom_background_style === 'Dark' ? '#E5E7EB' : '#374151')
          }}
        >
          {isAmazonMasterPreview && !isEditing && (
            <div className="review-preview-head">
              <span className="review-preview-kicker">{category || 'Amazon Reviews'}</span>
              {title && <h1 className="review-preview-title">{title}</h1>}
              <div className="review-preview-meta">
                <span>{new Date(new Date().setFullYear(2026)).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</span>
                <span>Authority Review Format</span>
              </div>
            </div>
          )}
          {isEditing ? (
            <div className="w-full">
              <label className="block text-sm font-medium text-text-secondary mb-2">Raw HTML Editor</label>
              <textarea
                value={editableHtml}
                onChange={handleContentChange}
                className="w-full h-[400px] sm:h-[600px] p-4 font-mono text-sm bg-gray-900 text-gray-200 border border-gray-700 rounded-lg focus:ring-2 focus:ring-accent focus:border-transparent"
              />
            </div>
          ) : (
            <div
              ref={contentRef}
              className="post-content max-w-none overflow-hidden"
              onClick={handleContentClick}
              dangerouslySetInnerHTML={{ __html: processedHtml }}
            />
          )}

          <hr className={`my-8 sm:my-12 border-t ${isAmazonMasterPreview ? 'border-[#ece2d3]' : (currentConfig.custom_background_style === 'Dark' ? 'border-gray-700' : 'border-gray-200')}`} />
          <div className={`post-meta text-sm space-y-2 ${isAmazonMasterPreview ? 'text-slate-500' : (currentConfig.custom_background_style === 'Dark' ? 'text-gray-400' : 'text-gray-600')}`}>
            <p>
              <strong className="font-semibold opacity-90">Author:</strong>{' '}
              {authorId ? (
                <Link to={`/author/${authorId}`} className="text-accent hover:underline font-medium">
                  {authorName || 'PostGenius Pro'}
                </Link>
              ) : (
                <span>{authorName || 'PostGenius Pro'}</span>
              )}
            </p>
            <p>
              <strong className="font-semibold opacity-90">Filed Under:</strong>
              <a href="#" onClick={(e) => e.preventDefault()} style={{ color: currentConfig.custom_secondary_color }} className="ml-1">{category}</a>
            </p>
            {allTags.length > 0 && (
              <p>
                <strong className="font-semibold opacity-90">Tags:</strong>
                {allTags.map((tag, index) => (
                  <React.Fragment key={tag}>
                    <a href="#" onClick={(e) => e.preventDefault()} style={{ color: currentConfig.custom_secondary_color }} className="ml-1">{tag}</a>
                    {index < allTags.length - 1 && ', '}
                  </React.Fragment>
                ))}
              </p>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

export default BlogPostPreview;
