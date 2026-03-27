import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { filterProductsToDominantFamily } from '../services/productFamilyService';

const require = createRequire(import.meta.url);
const cheerio = require('cheerio') as typeof import('cheerio');

type RawArticleRow = {
  id: string;
  slug: string;
  title: string;
  blueprint_type: string;
  content: string;
  generated_html: string;
  image_url?: string | null;
  style_config?: string | null;
  author_name?: string | null;
  author_role?: string | null;
};

type ProductSpec = { key: string; value: string };

type RawProduct = {
  id: number;
  productName: string;
  isPrimary?: boolean;
  price?: string;
  specs?: ProductSpec[];
  imageUrl?: string;
  url?: string;
  [key: string]: unknown;
};

type ArticleContent = {
  blogPostData?: {
    title?: string;
    htmlContent?: string;
    [key: string]: unknown;
  };
  productData?: RawProduct[];
  productImageUrls?: Record<string, string>;
  productImageVariants?: Record<string, string[]>;
  stepImageUrls?: Record<string, string>;
  [key: string]: unknown;
};

type FixResult = {
  id: string;
  slug: string;
  title: string;
  beforeCount: number;
  afterCount: number;
  removedProducts: string[];
  content: ArticleContent;
  generated_html: string;
};

const AMAZON_TAG_REGEX = /(?:\?|&)tag=([a-z0-9-]+)/gi;
const PRODUCT_URL_REGEX = /https?:\/\/(?:www\.)?amazon\.[a-z.]+\/[^\s"')]+|https?:\/\/[^\s"')]+|www\.[^\s"')]+/gi;

const parseJsonField = <T>(value: string | null | undefined, fallback: T): T => {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};

const extractAffiliateTag = (html: string, content: ArticleContent): string => {
  const tags = new Map<string, number>();
  const register = (value?: string | null) => {
    if (!value) return;
    for (const match of value.matchAll(AMAZON_TAG_REGEX)) {
      const tag = (match[1] || '').trim();
      if (!tag) continue;
      tags.set(tag, (tags.get(tag) || 0) + 1);
    }
  };

  register(html);
  for (const product of content.productData || []) {
    register(product.url);
  }

  const ranked = [...tags.entries()].sort((a, b) => b[1] - a[1]);
  return ranked[0]?.[0] || 'foodjot-20';
};

const normalizeProductTitle = (value: string | undefined, fallbackLabel: string): string => {
  const cleaned = String(value || '')
    .replace(PRODUCT_URL_REGEX, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || fallbackLabel;
};

const buildCompactProductDescription = (product: RawProduct): string => {
  const summary = (product.specs || [])
    .slice(0, 2)
    .map(spec => `${String(spec.value || '').trim()} ${String(spec.key || '').trim()}`.trim())
    .filter(Boolean)
    .join('. ')
    .trim();

  return summary || 'A practical Amazon pick for readers comparing this category.';
};

const resolveBestProductImageUrl = (
  product: RawProduct,
  imageUrls: Record<string, string>
): string => {
  const direct = String(product.imageUrl || '').trim();
  if (direct) return direct;
  const mapped = String(imageUrls[String(product.id)] || '').trim();
  if (mapped) return mapped;
  return '';
};

const pruneWpHeadingBefore = ($: import('cheerio').CheerioAPI, selector: string, headingPattern: RegExp) => {
  $(selector).each((_, element) => {
    const section = $(element);
    if (section.find('[data-product-id]').length > 0) return;
    const previous = section.prev();
    if (previous.is('h2') && headingPattern.test(previous.text().trim())) {
      previous.remove();
    }
    section.remove();
  });
};

const patchGeneratedHtml = (
  generatedHtml: string,
  keptProducts: RawProduct[],
  imageUrls: Record<string, string>
): string => {
  const $ = cheerio.load(generatedHtml || '', {}, false);
  const keepIds = new Set(keptProducts.map(product => String(product.id)));
  const primaryProduct = keptProducts.find(product => product.isPrimary) || keptProducts[0] || null;

  $('.amazon-review-card, .amazon-compare-card').each((_, element) => {
    const card = $(element);
    const productId = String(card.attr('data-product-id') || '').trim();
    if (!productId || !keepIds.has(productId)) {
      card.remove();
    }
  });

  pruneWpHeadingBefore($, '.amazon-reviews-section', /product reviews/i);
  pruneWpHeadingBefore($, '.amazon-comparison-grid', /amazon product comparison/i);

  $('.product-verdict-box').each((_, element) => {
    const box = $(element);
    const productId = String(box.find('img[data-product-id]').first().attr('data-product-id') || '').trim();

    if (productId && keepIds.has(productId)) {
      return;
    }

    if (!primaryProduct) {
      box.remove();
      return;
    }

    const nextTitle = normalizeProductTitle(primaryProduct.productName, `Amazon Product ${primaryProduct.id}`);
    const nextLink = String(primaryProduct.url || '').trim();
    const nextImage = resolveBestProductImageUrl(primaryProduct, imageUrls);
    const nextDescription = buildCompactProductDescription(primaryProduct);
    const nextPrice = String(primaryProduct.price || '').trim();

    const imageAnchor = box.find('.product-verdict-image a').first();
    if (imageAnchor.length && nextLink) {
      imageAnchor.attr('href', nextLink);
    }

    const image = box.find('.product-verdict-image img').first();
    if (image.length) {
      image.attr('data-product-id', String(primaryProduct.id));
      image.attr('alt', nextTitle);
      if (nextImage) {
        image.attr('src', nextImage);
      }
    }

    const titleAnchor = box.find('.product-verdict-content h4 a').first();
    if (titleAnchor.length) {
      titleAnchor.text(nextTitle);
      if (nextLink) {
        titleAnchor.attr('href', nextLink);
      }
    } else {
      const titleHeading = box.find('.product-verdict-content h4').first();
      if (titleHeading.length) {
        titleHeading.text(nextTitle);
      }
    }

    const priceNode = box.find('.product-verdict-price').first();
    if (nextPrice) {
      if (priceNode.length) {
        priceNode.text(nextPrice);
      } else {
        box.find('.product-verdict-content').first().prepend(`<span class="product-verdict-price">${nextPrice}</span>`);
      }
    } else {
      priceNode.remove();
    }

    const descriptionNode = box.find('.product-verdict-description').first();
    if (descriptionNode.length) {
      descriptionNode.text(nextDescription);
    }

    const ctaAnchor = box.find('.amazon-cta-button').first();
    if (ctaAnchor.length && nextLink) {
      ctaAnchor.attr('href', nextLink);
    }
  });

  return $.html().trim();
};

const fixArticle = (row: RawArticleRow): FixResult | null => {
  if (row.blueprint_type !== 'review') return null;

  const content = parseJsonField<ArticleContent>(row.content, {});
  if (!content.blogPostData?.htmlContent || !Array.isArray(content.productData) || content.productData.length < 2) {
    return null;
  }

  const family = filterProductsToDominantFamily(
    content.productData as never,
    content.blogPostData.title || row.title,
    row.blueprint_type || ''
  );
  if (family.rejectedProducts.length === 0 || family.filteredProducts.length < 2) {
    return null;
  }

  const removedNames = family.rejectedProducts.map(product => product.productName || `Product ${product.id}`);
  const filteredProducts = (family.filteredProducts as unknown as RawProduct[]).map(product => ({ ...product }));
  const keepIds = new Set(filteredProducts.map(product => String(product.id)));
  const hasPrimaryProduct = filteredProducts.some(product => product.isPrimary);
  const normalizedProducts = filteredProducts.map((product, index) => ({
    ...product,
    isPrimary: hasPrimaryProduct ? Boolean(product.isPrimary) : index === 0,
  }));
  const normalizedImageUrls = Object.fromEntries(
    Object.entries({ ...(content.productImageUrls || {}) }).filter(([key]) => keepIds.has(String(key)))
  ) as Record<string, string>;
  const normalizedVariants = Object.fromEntries(
    Object.entries({ ...(content.productImageVariants || {}) }).filter(([key]) => keepIds.has(String(key)))
  ) as Record<string, string[]>;
  const nextBlogPostData = content.blogPostData
    ? {
        ...content.blogPostData,
        productReviews: Array.isArray(content.blogPostData.productReviews)
          ? content.blogPostData.productReviews.filter(review => keepIds.has(String(review.productId)))
          : content.blogPostData.productReviews,
      }
    : content.blogPostData;

  const patchedContent: ArticleContent = {
    ...content,
    blogPostData: nextBlogPostData,
    productData: normalizedProducts,
    productImageUrls: normalizedImageUrls,
    productImageVariants: normalizedVariants,
  };

  const generatedHtml = patchGeneratedHtml(
    row.generated_html || '',
    normalizedProducts,
    normalizedImageUrls
  );

  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    beforeCount: content.productData.length,
    afterCount: patchedContent.productData.length,
    removedProducts: removedNames,
    content: patchedContent,
    generated_html: generatedHtml,
  };
};

const main = () => {
  const inputPath = process.argv[2];
  const outputPath = process.argv[3];
  if (!inputPath || !outputPath) {
    throw new Error('Usage: npx tsx scripts/fix_mixed_family_review_articles.ts <input.json> <output.json>');
  }

  const rawInput = fs.readFileSync(path.resolve(inputPath), 'utf8').replace(/^\uFEFF/, '');
  const parsed = JSON.parse(rawInput) as RawArticleRow[] | RawArticleRow;
  const rows = Array.isArray(parsed) ? parsed : [parsed];
  const results = rows.map(fixArticle).filter(Boolean) as FixResult[];

  fs.writeFileSync(path.resolve(outputPath), JSON.stringify({
    totalRows: rows.length,
    affectedRows: results.length,
    results,
  }, null, 2), 'utf8');

  console.log(JSON.stringify({
    totalRows: rows.length,
    affectedRows: results.length,
    slugs: results.map(item => ({
      slug: item.slug,
      beforeCount: item.beforeCount,
      afterCount: item.afterCount,
      removedProducts: item.removedProducts,
    })),
  }, null, 2));
};

main();
