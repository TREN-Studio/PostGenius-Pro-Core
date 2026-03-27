import fs from 'node:fs';
import path from 'node:path';
import { prepareArticleHtmlForEditing } from '../services/reviewLayoutService';
import { generateFinalHtml } from '../services/styleService';

type RawArticleRow = {
  id: string;
  user_id: string;
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

type ArticleContent = {
  blogPostData?: {
    niche?: string;
    title?: string;
    category?: string;
    heroImage?: string;
    heroImageMetadata?: unknown;
    tags?: unknown;
    seo?: unknown;
    faq?: Array<{ question: string; answer: string }>;
    htmlContent?: string;
    [key: string]: unknown;
  };
  productData?: Array<{
    id: number;
    productName: string;
    isPrimary: boolean;
    price?: string;
    specs?: Array<{ key: string; value: string }>;
    imageUrl?: string;
    url?: string;
  }>;
  stepImageUrls?: Record<string, string>;
  productImageUrls?: Record<string, string>;
  heroImageUrl?: string;
};

type FixResult = {
  id: string;
  slug: string;
  title: string;
  affiliateTag: string;
  before: Record<string, number>;
  after: Record<string, number>;
  cleanedSectionPlaceholderCount: number;
  cleanedHtmlLength: number;
  regeneratedHtmlLength: number;
  content: ArticleContent;
  generated_html: string;
};

const AMAZON_TAG_REGEX = /(?:\?|&)tag=([a-z0-9-]+)/gi;

const count = (input: string, pattern: RegExp): number => {
  const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`;
  return [...input.matchAll(new RegExp(pattern.source, flags))].length;
};

const measureHtml = (html: string) => ({
  styleCount: count(html, /<style\b/gi),
  reviewsCount: count(html, /amazon-reviews-section/gi),
  comparisonCount: count(html, /amazon-comparison-grid/gi),
  faqCount: count(html, /postgenius-faq-section/gi),
  contentImgCount: count(html, /content-section-image-block/gi),
});

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

const parseJsonField = <T>(value: string | null | undefined, fallback: T): T => {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};

const buildUserProfile = (row: RawArticleRow) => ({
  full_name: row.author_name || 'Postgenius Pro Admin',
  role: row.author_role === 'admin' ? 'admin' : 'user',
});

const fixArticle = (row: RawArticleRow): FixResult | null => {
  if (row.blueprint_type !== 'review') return null;

  const content = parseJsonField<ArticleContent>(row.content, {});
  if (!content.blogPostData || !content.blogPostData.htmlContent) return null;

  const affiliateTag = extractAffiliateTag(row.generated_html || '', content);
  const cleanedHtml = prepareArticleHtmlForEditing(content.blogPostData.htmlContent, 'review');
  const cleanedSectionPlaceholderCount = count(cleanedHtml, /\[CONTENT_SECTION_IMAGE_\d+\]/gi);

  const patchedContent: ArticleContent = {
    ...content,
    blogPostData: {
      ...content.blogPostData,
      htmlContent: cleanedHtml,
    },
  };

  const regeneratedHtml = generateFinalHtml(
    patchedContent.blogPostData as never,
    (patchedContent.productData || []) as never,
    { associateTag: affiliateTag } as never,
    parseJsonField(row.style_config, null),
    buildUserProfile(row) as never,
    patchedContent.stepImageUrls || {},
    patchedContent.productImageUrls || {},
    false,
    'review' as never
  );

  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    affiliateTag,
    before: measureHtml(row.generated_html || ''),
    after: measureHtml(regeneratedHtml),
    cleanedSectionPlaceholderCount,
    cleanedHtmlLength: cleanedHtml.length,
    regeneratedHtmlLength: regeneratedHtml.length,
    content: patchedContent,
    generated_html: regeneratedHtml,
  };
};

const isAffected = (row: RawArticleRow): boolean => {
  const html = row.generated_html || '';
  const stats = measureHtml(html);
  return (
    stats.styleCount > 1 ||
    stats.reviewsCount > 1 ||
    stats.comparisonCount > 1 ||
    stats.faqCount > 1 ||
    stats.contentImgCount > 4
  );
};

const main = () => {
  const inputPath = process.argv[2];
  const outputPath = process.argv[3];
  if (!inputPath || !outputPath) {
    throw new Error('Usage: npx tsx scripts/batch_fix_review_articles.ts <input.json> <output.json>');
  }

  const rawInput = fs.readFileSync(path.resolve(inputPath), 'utf8').replace(/^\uFEFF/, '');
  const parsed = JSON.parse(rawInput) as RawArticleRow | RawArticleRow[];
  const rows = Array.isArray(parsed) ? parsed : [parsed];
  const results = rows.filter(isAffected).map(fixArticle).filter(Boolean) as FixResult[];

  const summary = {
    totalRows: rows.length,
    affectedRows: results.length,
    results: results.map(item => ({
      id: item.id,
      slug: item.slug,
      title: item.title,
      affiliateTag: item.affiliateTag,
      before: item.before,
      after: item.after,
      cleanedSectionPlaceholderCount: item.cleanedSectionPlaceholderCount,
      cleanedHtmlLength: item.cleanedHtmlLength,
      regeneratedHtmlLength: item.regeneratedHtmlLength,
      content: item.content,
      generated_html: item.generated_html,
    })),
  };

  fs.writeFileSync(path.resolve(outputPath), JSON.stringify(summary, null, 2), 'utf8');

  const compact = results.map(item => ({
    slug: item.slug,
    before: item.before,
    after: item.after,
    cleanedSectionPlaceholderCount: item.cleanedSectionPlaceholderCount,
  }));
  console.log(JSON.stringify({ totalRows: rows.length, affectedRows: results.length, compact }, null, 2));
};

main();
