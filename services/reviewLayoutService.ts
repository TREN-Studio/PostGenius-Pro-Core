const normalizeHeadingText = (value: string): string =>
    String(value || '')
        .replace(/<[^>]*>/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();

const stripStyleBlocks = (html: string): string =>
    String(html || '').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '').trim();

const splitIntoH2Sections = (input: string): { preamble: string; sections: Array<{ headingText: string; html: string }> } => {
    const h2 = /<h2\b[^>]*>[\s\S]*?<\/h2>/gi;
    const matches = Array.from(input.matchAll(h2));

    if (!matches.length) {
        return { preamble: input.trim(), sections: [] };
    }

    const preamble = input.slice(0, matches[0].index || 0).trim();
    const sections = matches.map((match, index) => {
        const start = match.index || 0;
        const end = index + 1 < matches.length ? (matches[index + 1].index || input.length) : input.length;
        const html = input.slice(start, end).trim();

        return {
            headingText: normalizeHeadingText(match[0]),
            html,
        };
    });

    return { preamble, sections };
};

const replaceFirstH2Text = (sectionHtml: string, newText: string): string =>
    sectionHtml.replace(/<h2\b([^>]*)>[\s\S]*?<\/h2>/i, `<h2$1>${newText}</h2>`);

const stripIntroSectionImages = (sectionHtml: string): string =>
    sectionHtml
        .replace(/<figure[\s\S]*?<\/figure>/gi, '')
        .replace(/<p>\s*<img[^>]*>\s*<\/p>/gi, '')
        .replace(/<div[^>]*>\s*<img[^>]*>\s*<\/div>/gi, '')
        .replace(/<p>\s*<\/p>/gi, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();

const escapeHtml = (value: string): string =>
    String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

const normalizeText = (value: string): string =>
    String(value || '').replace(/\s+/g, ' ').trim();

const findAmazonCta = (root: ParentNode): HTMLAnchorElement | null =>
    root.querySelector<HTMLAnchorElement>(
        '.amazon-cta-button-full, .amazon-cta-button, .amazon-table-cta-button, a[href*="amazon."], a[href*="amzn.to"]'
    );

const collectListItems = (list: Element | null, maxItems: number): string[] =>
    list
        ? Array.from(list.querySelectorAll(':scope > li'))
            .map(item => item.innerHTML.trim())
            .filter(Boolean)
            .slice(0, maxItems)
        : [];

const toEditorialReviewSection = (doc: Document, card: Element): HTMLElement => {
    const productId = normalizeText(card.getAttribute('data-product-id') || '');
    const titleNode =
        card.querySelector('.amazon-review-title span:last-child')
        || card.querySelector('.amazon-review-title')
        || card.querySelector('h3');
    const title = normalizeText(titleNode?.textContent || 'Amazon Product');
    const badge = normalizeText(card.querySelector('.amazon-review-badge')?.textContent || '');
    const summary = card.querySelector('.amazon-review-summary')?.innerHTML.trim() || '';
    const price = normalizeText(card.querySelector('.amazon-review-price')?.textContent || '');
    const tradeoff = card.querySelector('.amazon-review-tradeoff')?.innerHTML.trim() || '';
    const image = card.querySelector<HTMLImageElement>('.amazon-review-image-wrap img');
    const imageSrc = image?.getAttribute('src') || '';
    const imageAlt = normalizeText(image?.getAttribute('alt') || title);
    const highlights = collectListItems(card.querySelector('.amazon-review-features ul'), 4);
    const pros = collectListItems(card.querySelector('.pros-box ul'), 3);
    const cons = collectListItems(card.querySelector('.cons-box ul'), 3);
    const keyPoints = (pros.length ? pros : highlights).slice(0, 3);
    const cta = findAmazonCta(card);
    const ctaText = normalizeText(cta?.textContent || 'Check Price on Amazon');
    const ctaHref = cta?.getAttribute('href') || '';

    const section = doc.createElement('section');
    section.className = 'amazon-editorial-pick';
    if (productId) section.setAttribute('data-product-id', productId);

    const ctaMarkup = ctaHref
        ? `
            <div class="amazon-editorial-actions">
                <a href="${escapeHtml(ctaHref)}" class="amazon-cta-button-full" target="_blank" rel="noopener noreferrer sponsored">${escapeHtml(ctaText)}</a>
            </div>
        `
        : '';
    const pointBlock = (label: string, items: string[], extraClass = ''): string => {
        if (!items.length) return '';
        return `
            <div class="amazon-editorial-point ${extraClass}">
                <strong class="amazon-editorial-point-label">${escapeHtml(label)}</strong>
                <ul>
                    ${items.map(item => `<li>${item}</li>`).join('')}
                </ul>
            </div>
        `;
    };

    section.innerHTML = `
        <header class="amazon-editorial-head">
            <div class="amazon-editorial-title-wrap">
                ${badge ? `<span class="amazon-editorial-badge">${escapeHtml(badge)}</span>` : ''}
                <h3 class="amazon-editorial-title">${escapeHtml(title)}</h3>
            </div>
            ${price ? `<div class="amazon-editorial-meta"><span class="amazon-editorial-price">${escapeHtml(price)}</span></div>` : ''}
        </header>
        ${imageSrc ? `
            <figure class="amazon-editorial-image">
                <img src="${escapeHtml(imageSrc)}" alt="${escapeHtml(imageAlt)}" loading="lazy" />
            </figure>
        ` : ''}
        ${summary ? `<p class="amazon-editorial-summary">${summary}</p>` : ''}
        <div class="amazon-editorial-points">
            ${pointBlock('Pros', keyPoints)}
            ${pointBlock('Cons', cons, 'is-cons')}
        </div>
        ${tradeoff ? `<p class="amazon-editorial-tradeoff">${tradeoff}</p>` : ''}
        ${ctaMarkup}
    `;

    return section;
};

export const normalizeAmazonMasterArticleHtml = (html: string): string => {
    if (!html) return html;

    let next = stripStyleBlocks(html)
        .replace(/<!-- wp:html -->\s*<div\b[^>]*class="[^"]*product-verdict-box[^"]*"[^>]*>[\s\S]*?<!-- \/wp:html -->/gi, '')
        .replace(/<div\b[^>]*class="[^"]*product-verdict-box[^"]*"[^>]*>[\s\S]*?<\/div>\s*<\/div>/gi, '')
        .replace(/<div\b[^>]*class="[^"]*product-verdict-box[^"]*"[^>]*>[\s\S]*?<\/div>/gi, '');

    const { preamble, sections } = splitIntoH2Sections(next);
    if (!sections.length) return next;

    const contentSections: string[] = [];
    const comparisonSections: string[] = [];
    const faqSections: string[] = [];
    const conclusionSections: string[] = [];

    for (const section of sections) {
        const heading = section.headingText;
        if (heading.includes('beginner')) continue;
        if (heading.includes('amazon product comparison') || heading.includes('product comparison') || heading.includes('comparison table') || heading === 'comparison') {
            comparisonSections.push(replaceFirstH2Text(section.html, 'Amazon Product Comparison'));
            continue;
        }
        if (heading.includes('faq')) {
            faqSections.push(replaceFirstH2Text(section.html, 'FAQ Section'));
            continue;
        }
        if (heading.includes('conclusion')) {
            conclusionSections.push(replaceFirstH2Text(section.html, 'Conclusion'));
            continue;
        }
        if (heading.includes('introduction')) {
            contentSections.push(replaceFirstH2Text(section.html, 'Introduction'));
            continue;
        }
        if (heading.includes('why choose')) {
            contentSections.push(replaceFirstH2Text(section.html, 'Why Choose This Selection?'));
            continue;
        }
        if (heading.includes('how to choose')) {
            contentSections.push(replaceFirstH2Text(section.html, 'How to Choose'));
            continue;
        }
        if (heading.includes('product reviews') || heading === 'reviews') {
            contentSections.push(replaceFirstH2Text(section.html, 'Product Reviews'));
            continue;
        }
        contentSections.push(section.html);
    }

    const orderedSections = [
        ...contentSections,
        ...comparisonSections,
        ...faqSections,
        ...conclusionSections,
    ].filter(Boolean);

    if (!orderedSections.length) return next;

    next = [preamble, ...orderedSections].filter(Boolean).join('\n\n');
    return next.replace(/\n{3,}/g, '\n\n').trim();
};

export const reshapeAmazonMasterArticleForPortal = (html: string): string => {
    if (!html || typeof DOMParser === 'undefined') return html;

    try {
        const doc = new DOMParser().parseFromString(`<div id="root">${html}</div>`, 'text/html');
        const root = doc.getElementById('root');
        if (!root) return html;

        const reviewCards = Array.from(root.querySelectorAll('.amazon-review-card'));
        reviewCards.forEach(card => {
            const section = toEditorialReviewSection(doc, card);
            card.replaceWith(section);
        });

        root.querySelectorAll('.amazon-comparison-grid').forEach(grid => {
            const cards = Array.from(grid.querySelectorAll(':scope > .amazon-compare-card'));
            cards.forEach((card, index) => {
                if (index >= 3) {
                    card.remove();
                    return;
                }
            });
        });

        return root.innerHTML.replace(/\n{3,}/g, '\n\n').trim();
    } catch {
        return html;
    }
};

export const prepareArticleHtmlForEditing = (html: string, blueprintType?: string | null): string => {
    const cleaned = stripStyleBlocks(html)
        .replace(
            /<figure[^>]*content-section-image-block[^>]*>[\s\S]*?<img[^>]*alt="Content section\s*(\d+)"[^>]*>[\s\S]*?<\/figure>/gi,
            (_match, sectionId) => `[CONTENT_SECTION_IMAGE_${sectionId}]`
        )
        .replace(/(<!-- wp:html -->\s*<!-- \/wp:html -->\s*)+/gi, '')
        .replace(/(\[CONTENT_SECTION_IMAGE_\d+\])(?:\s*\1)+/gi, '$1')
        .trim();
    if (!cleaned) return cleaned;

    if (blueprintType !== 'review') {
        return cleaned.replace(/\n{3,}/g, '\n\n').trim();
    }

    const withoutGeneratedSections = cleaned
        .replace(/<!-- wp:html -->\s*<section class="amazon-reviews-section"[\s\S]*?<!-- \/wp:html -->/gi, '')
        .replace(/<!-- wp:html -->\s*<div class="amazon-comparison-grid"[\s\S]*?<!-- \/wp:html -->/gi, '')
        .replace(/<!-- wp:html -->\s*<div class="postgenius-faq-section"[\s\S]*?<!-- \/wp:html -->/gi, '')
        .replace(/<!-- wp:html -->\s*<div\b[^>]*class="[^"]*(?:product-verdict-box|cta-container)[^"]*"[^>]*>[\s\S]*?<!-- \/wp:html -->/gi, '')
        .replace(/<section class="amazon-reviews-section"[\s\S]*?<\/section>/gi, '')
        .replace(/<div class="amazon-comparison-grid"[\s\S]*?<\/div>/gi, '')
        .replace(/<article class="amazon-review-card"[\s\S]*?<\/article>/gi, '')
        .replace(/<article class="amazon-compare-card"[\s\S]*?<\/article>/gi, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();

    return normalizeAmazonMasterArticleHtml(withoutGeneratedSections);
};
