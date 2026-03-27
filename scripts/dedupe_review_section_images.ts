import fs from 'node:fs';
import path from 'node:path';

type RawArticleRow = {
  id: string;
  slug: string;
  title: string;
  blueprint_type: string;
  content: string;
  generated_html: string;
};

type ArticleContent = {
  blogPostData?: {
    htmlContent?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

type Patch = {
  id: string;
  slug: string;
  title: string;
  beforeGeneratedFigureCount: number;
  afterGeneratedFigureCount: number;
  beforeContentFigureCount: number;
  afterContentFigureCount: number;
  duplicateKinds: number;
  content: ArticleContent;
  generated_html: string;
};

const readJson = <T>(filePath: string): T => {
  const raw = fs.readFileSync(path.resolve(filePath), 'utf8').replace(/^\uFEFF/, '');
  return JSON.parse(raw) as T;
};

const CONTENT_SECTION_FIGURE_REGEX =
  /<figure[^>]*content-section-image-block[^>]*>[\s\S]*?<img[^>]*src="([^"]*)"[^>]*alt="([^"]*)"[^>]*>[\s\S]*?<\/figure>/gi;

const dedupeContentSectionFigures = (html: string): { html: string; figureCount: number; duplicateKinds: number } => {
  const seen = new Set<string>();
  const duplicateKinds = new Set<string>();
  let kept = 0;

  const next = String(html || '').replace(CONTENT_SECTION_FIGURE_REGEX, (match, src, alt) => {
    const key = `${String(alt || '').trim()}||${String(src || '').trim()}`;
    if (seen.has(key)) {
      duplicateKinds.add(key);
      return '';
    }
    seen.add(key);
    kept += 1;
    return match;
  });

  return {
    html: next
      .replace(/<p>\s*<\/p>/gi, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim(),
    figureCount: kept,
    duplicateKinds: duplicateKinds.size,
  };
};

const countFigures = (html: string): number =>
  [...String(html || '').matchAll(new RegExp(CONTENT_SECTION_FIGURE_REGEX.source, 'gi'))].length;

const main = () => {
  const inputPath = process.argv[2];
  const outputPath = process.argv[3];
  if (!inputPath || !outputPath) {
    throw new Error('Usage: npx tsx scripts/dedupe_review_section_images.ts <input.json> <output.json>');
  }

  const rows = readJson<RawArticleRow[]>(inputPath);
  const patches: Patch[] = [];

  for (const row of rows) {
    if (row.blueprint_type !== 'review') continue;

    const generatedBeforeCount = countFigures(row.generated_html || '');
    if (!generatedBeforeCount) continue;

    const content = JSON.parse(row.content || '{}') as ArticleContent;
    const contentHtml = String(content.blogPostData?.htmlContent || '');
    const contentBeforeCount = countFigures(contentHtml);

    const generatedDedupe = dedupeContentSectionFigures(row.generated_html || '');
    if (!generatedDedupe.duplicateKinds) continue;

    const contentDedupe = dedupeContentSectionFigures(contentHtml);
    const patchedContent: ArticleContent = {
      ...content,
      blogPostData: {
        ...(content.blogPostData || {}),
        htmlContent: contentDedupe.html,
      },
    };

    patches.push({
      id: row.id,
      slug: row.slug,
      title: row.title,
      beforeGeneratedFigureCount: generatedBeforeCount,
      afterGeneratedFigureCount: generatedDedupe.figureCount,
      beforeContentFigureCount: contentBeforeCount,
      afterContentFigureCount: contentDedupe.figureCount,
      duplicateKinds: generatedDedupe.duplicateKinds,
      content: patchedContent,
      generated_html: generatedDedupe.html,
    });
  }

  fs.writeFileSync(
    path.resolve(outputPath),
    JSON.stringify(
      {
        totalRows: rows.length,
        patchCount: patches.length,
        patches,
      },
      null,
      2
    ),
    'utf8'
  );

  console.log(
    JSON.stringify(
      {
        totalRows: rows.length,
        patchCount: patches.length,
        compact: patches.map((patch) => ({
          slug: patch.slug,
          beforeGeneratedFigureCount: patch.beforeGeneratedFigureCount,
          afterGeneratedFigureCount: patch.afterGeneratedFigureCount,
          beforeContentFigureCount: patch.beforeContentFigureCount,
          afterContentFigureCount: patch.afterContentFigureCount,
          duplicateKinds: patch.duplicateKinds,
        })),
      },
      null,
      2
    )
  );
};

main();
