import type { AmazonProduct } from '../types';

const PRODUCT_FAMILY_STOPWORD_VALUES = [
    'a', 'an', 'and', 'at', 'by', 'for', 'from', 'in', 'into', 'of', 'on', 'or', 'the', 'to', 'with',
    'best', 'overall', 'runner', 'runnerup', 'value', 'top', 'review', 'reviews', 'comparison', 'comparisons',
    'buying', 'guide', 'guides', 'versus', 'vs', 'side', 'format', 'trusted', 'story', 'stories',
    'amazon', 'www', 'com', 'https', 'http', 'dp', 'gp', 'product', 'products', 'source', 'url',
    'featured', 'choice', 'pick', 'picks', 'our', 'this', 'that', 'these', 'those',
    'edition', 'model', 'series', 'pack', 'set', 'piece', 'pcs',
];

const PRODUCT_FAMILY_GENERIC_TOKEN_VALUES = [
    'adjustable', 'advanced', 'affordable', 'air', 'all', 'auto', 'automatic', 'basics', 'black', 'blue',
    'capacity', 'carafe', 'classic', 'compact', 'complete', 'control', 'controls', 'cool', 'daily', 'deluxe',
    'design', 'digital', 'durable', 'easy', 'edition', 'electric', 'electronics', 'essential', 'essentials',
    'everyday', 'family', 'finish', 'foldable', 'free', 'full', 'gear', 'glass', 'gray', 'grey', 'guide',
    'gadget', 'gadgets', 'heavy', 'home', 'household', 'indoor', 'item', 'kitchen', 'kit', 'large', 'light',
    'manual', 'metal', 'mini', 'modern',
    'multi', 'new', 'nonstick', 'office', 'outdoor', 'portable', 'power', 'premium', 'preset', 'presets', 'pro',
    'product', 'products', 'professional', 'quality', 'quick', 'rechargeable', 'removable', 'room', 'smart',
    'small', 'speed', 'stainless', 'steel', 'strong', 'style', 'system', 'temperature', 'travel', 'ultra',
    'universal', 'upgrade', 'upgraded', 'use', 'value', 'versatile', 'white', 'wireless', 'wood', 'xl',
    'accessory', 'accessories', 'packaging', 'may', 'vary', 'must', 'have', 'included',
];

const PRODUCT_FAMILY_URL_LIKE_REGEX = /^(?:https?:\/\/|www\.|amazon\.)/i;

const singularizeFamilyToken = (token: string): string => {
    const value = String(token || '').trim().toLowerCase();
    if (value.endsWith('ies') && value.length > 4) return `${value.slice(0, -3)}y`;
    if (/(ches|shes|sses|xes|zes|oes)$/.test(value) && value.length > 4) return value.slice(0, -2);
    if (value.endsWith('s') && !value.endsWith('ss') && value.length > 4) return value.slice(0, -1);
    return value;
};

const PRODUCT_FAMILY_STOPWORDS = new Set(
    PRODUCT_FAMILY_STOPWORD_VALUES.map(singularizeFamilyToken)
);

const PRODUCT_FAMILY_GENERIC_TOKENS = new Set(
    PRODUCT_FAMILY_GENERIC_TOKEN_VALUES.map(singularizeFamilyToken)
);

const isMeaningfulFamilyToken = (token: string): boolean => {
    const normalized = singularizeFamilyToken(token);
    if (normalized.length < 3) return false;
    if (PRODUCT_FAMILY_STOPWORDS.has(normalized) || PRODUCT_FAMILY_GENERIC_TOKENS.has(normalized)) return false;
    if (/^\d+$/.test(normalized)) return false;
    if (/^[a-z]{0,3}\d+[a-z0-9-]*$/i.test(normalized)) return false;
    return true;
};

const normalizeProductFamilyText = (value: string): string =>
    String(value || '')
        .replace(/\bhttps?:\/\/\S+/gi, ' ')
        .replace(/\bwww\.[^\s]+/gi, ' ')
        .replace(/\bamazon\.[a-z.]+\S*/gi, ' ')
        .replace(/[^a-z0-9]+/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();

const tokenizeProductFamilyText = (value: string): string[] =>
    normalizeProductFamilyText(value)
        .split(' ')
        .map(token => singularizeFamilyToken(token.trim()))
        .filter(token => token.length >= 3)
        .filter(token => !PRODUCT_FAMILY_STOPWORDS.has(token))
        .filter(token => !/^\d+$/.test(token));

const tokenizeMeaningfulFamilyText = (value: string): string[] =>
    tokenizeProductFamilyText(value).filter(isMeaningfulFamilyToken);

const buildProductFamilyPhrases = (tokens: string[]): string[] => {
    const phrases: string[] = [];

    for (let index = 0; index < tokens.length - 1; index += 1) {
        phrases.push(`${tokens[index]} ${tokens[index + 1]}`);
    }

    for (let index = 0; index < tokens.length - 2; index += 1) {
        phrases.push(`${tokens[index]} ${tokens[index + 1]} ${tokens[index + 2]}`);
    }

    return phrases;
};

const toSet = (values: string[]): Set<string> => new Set(values.filter(Boolean));

const countIntersection = (left: Set<string>, right: Set<string>): number => {
    let total = 0;
    left.forEach(value => {
        if (right.has(value)) total += 1;
    });
    return total;
};

export type ProductFamilySignature = {
    normalized: string;
    tokens: string[];
    tokenSet: Set<string>;
    phrases: string[];
    phraseSet: Set<string>;
};

export const buildProductFamilySignature = (value: string): ProductFamilySignature => {
    const tokens = tokenizeMeaningfulFamilyText(value);
    const phrases = buildProductFamilyPhrases(tokens);
    return {
        normalized: normalizeProductFamilyText(value),
        tokens,
        tokenSet: toSet(tokens),
        phrases,
        phraseSet: toSet(phrases),
    };
};

export const collectDominantFamilyTokens = (values: string[]): string[] => {
    const counts = new Map<string, number>();

    values.forEach(value => {
        const uniqueTokens = new Set(tokenizeMeaningfulFamilyText(value));
        uniqueTokens.forEach(token => {
            counts.set(token, (counts.get(token) || 0) + 1);
        });
    });

    return Array.from(counts.entries())
        .filter(([, count]) => count >= 2)
        .sort((left, right) => right[1] - left[1] || right[0].length - left[0].length)
        .map(([token]) => token);
};

const looksLikeRawUrlProductTitle = (value: string): boolean => {
    const raw = String(value || '').trim();
    if (!raw) return true;
    if (PRODUCT_FAMILY_URL_LIKE_REGEX.test(raw)) return true;
    return tokenizeMeaningfulFamilyText(raw).length === 0 && /amazon|https?:\/\/|www\./i.test(raw);
};

const buildArticleAnchorTokens = (articleTitle: string, products: AmazonProduct[]): string[] => {
    const articleTokens = tokenizeMeaningfulFamilyText(articleTitle);
    const productTokenCounts = new Map<string, number>();

    products.forEach(product => {
        const uniqueTokens = new Set(tokenizeMeaningfulFamilyText(product.productName || ''));
        uniqueTokens.forEach(token => {
            productTokenCounts.set(token, (productTokenCounts.get(token) || 0) + 1);
        });
    });

    const anchoredArticleTokens = articleTokens.filter(token => (productTokenCounts.get(token) || 0) >= 1);
    const repeatedProductTokens = Array.from(productTokenCounts.entries())
        .filter(([, count]) => count >= 2)
        .sort((left, right) => right[1] - left[1] || right[0].length - left[0].length)
        .map(([token]) => token);

    const merged = Array.from(new Set([...anchoredArticleTokens, ...repeatedProductTokens]));
    if (merged.length > 0) {
        return merged.slice(0, 8);
    }

    return articleTokens.slice(0, 6);
};

const scoreSeedCandidate = (
    product: AmazonProduct,
    articleTitle: string,
    dominantTokens: string[],
    articleAnchorTokens: string[]
): number => {
    const signature = buildProductFamilySignature(product.productName || '');
    const articleSignature = buildProductFamilySignature(articleTitle);
    const anchorSet = toSet(articleAnchorTokens);
    const dominantSet = toSet(dominantTokens);

    return (
        countIntersection(signature.phraseSet, articleSignature.phraseSet) * 8
        + countIntersection(signature.tokenSet, articleSignature.tokenSet) * 5
        + countIntersection(signature.tokenSet, anchorSet) * 6
        + countIntersection(signature.tokenSet, dominantSet) * 2
    );
};

export const scoreProductFamilyMatch = (
    candidateText: string,
    referenceText: string,
    options?: {
        articleTitle?: string;
        dominantTokens?: string[];
    }
): number => {
    const candidate = buildProductFamilySignature(candidateText);
    const reference = buildProductFamilySignature(referenceText);
    const article = buildProductFamilySignature(options?.articleTitle || '');
    const dominantTokenSet = toSet((options?.dominantTokens || []).map(token => token.toLowerCase()));

    const phraseOverlap = countIntersection(candidate.phraseSet, reference.phraseSet);
    const tokenOverlap = countIntersection(candidate.tokenSet, reference.tokenSet);
    const candidateDominant = countIntersection(candidate.tokenSet, dominantTokenSet);
    const referenceDominant = countIntersection(reference.tokenSet, dominantTokenSet);
    const articleOverlap = article.tokens.length > 0 ? countIntersection(candidate.tokenSet, article.tokenSet) : 0;

    let score = 0;

    if (phraseOverlap > 0) score += phraseOverlap * 5;
    if (tokenOverlap > 0) score += tokenOverlap * 3;
    if (candidateDominant > 0) score += candidateDominant * 2;
    if (referenceDominant > 0) score += referenceDominant;
    if (articleOverlap > 0) score += articleOverlap * 2;

    if (
        candidate.normalized &&
        reference.normalized &&
        (candidate.normalized.includes(reference.normalized) || reference.normalized.includes(candidate.normalized))
    ) {
        score += 4;
    }

    return score;
};

export const titlesBelongToSameProductFamily = (
    candidateText: string,
    referenceText: string,
    options?: {
        articleTitle?: string;
        dominantTokens?: string[];
    }
): boolean => {
    const candidate = buildProductFamilySignature(candidateText);
    const reference = buildProductFamilySignature(referenceText);
    const article = buildProductFamilySignature(options?.articleTitle || '');
    const dominantTokenSet = toSet((options?.dominantTokens || []).map(token => token.toLowerCase()));

    if (candidate.tokens.length === 0 || reference.tokens.length === 0) {
        return false;
    }

    const phraseOverlap = countIntersection(candidate.phraseSet, reference.phraseSet);
    const tokenOverlap = countIntersection(candidate.tokenSet, reference.tokenSet);
    const articleOverlap = article.tokens.length > 0 ? countIntersection(candidate.tokenSet, article.tokenSet) : 0;
    const dominantOverlap = dominantTokenSet.size > 0 ? countIntersection(candidate.tokenSet, dominantTokenSet) : 0;
    const score = scoreProductFamilyMatch(candidateText, referenceText, options);

    return (
        phraseOverlap >= 1
        || tokenOverlap >= 2
        || (tokenOverlap >= 1 && dominantOverlap >= 1)
        || articleOverlap >= 2
        || score >= 6
    );
};

export const filterProductsToDominantFamily = (
    products: AmazonProduct[],
    articleTitle = '',
    blueprintType = ''
): {
    filteredProducts: AmazonProduct[];
    rejectedProducts: AmazonProduct[];
    dominantTokens: string[];
} => {
    const normalizedProducts = products.filter(Boolean);
    if (normalizedProducts.length <= 1) {
        return {
            filteredProducts: normalizedProducts,
            rejectedProducts: [],
            dominantTokens: collectDominantFamilyTokens([articleTitle, ...normalizedProducts.map(product => product.productName || '')]),
        };
    }

    const dominantTokens = collectDominantFamilyTokens([
        articleTitle,
        ...normalizedProducts.map(product => product.productName || ''),
    ]);
    const articleAnchorTokens = buildArticleAnchorTokens(articleTitle, normalizedProducts);
    const articleAnchorSet = toSet(articleAnchorTokens);
    const articleSignature = buildProductFamilySignature(articleTitle);

    let bestIndex = 0;
    let bestSeedScore = -1;
    normalizedProducts.forEach((product, index) => {
        const seedScore = scoreSeedCandidate(product, articleTitle, dominantTokens, articleAnchorTokens);
        if (seedScore > bestSeedScore) {
            bestSeedScore = seedScore;
            bestIndex = index;
        }
    });

    const seedProduct = normalizedProducts[bestIndex];
    const seedSignature = buildProductFamilySignature(seedProduct?.productName || '');

    const isStrictAmazonComparison = blueprintType === 'amazon_multi_asin';

    const filteredProducts = normalizedProducts.filter((product, index) => {
        if (index === bestIndex) return true;
        if (looksLikeRawUrlProductTitle(product.productName || '')) return false;

        const candidateSignature = buildProductFamilySignature(product.productName || '');
        const phraseOverlapWithSeed = countIntersection(candidateSignature.phraseSet, seedSignature.phraseSet);
        const tokenOverlapWithSeed = countIntersection(candidateSignature.tokenSet, seedSignature.tokenSet);
        const articleOverlap = countIntersection(candidateSignature.tokenSet, articleSignature.tokenSet);
        const anchorOverlap = countIntersection(candidateSignature.tokenSet, articleAnchorSet);
        const score = scoreProductFamilyMatch(product.productName || '', seedProduct.productName || '', {
            articleTitle,
            dominantTokens,
        });

        if (phraseOverlapWithSeed >= 1) return true;
        if (tokenOverlapWithSeed >= 2) return true;
        if (tokenOverlapWithSeed >= 1 && anchorOverlap >= 1) return true;

        if (isStrictAmazonComparison) {
            return false;
        }

        if (anchorOverlap >= 2) return true;
        if (articleOverlap >= 2 && score >= 4) return true;
        if (score >= 10) return true;
        return false;
    });

    const filteredIds = new Set(filteredProducts.map(product => product.id));
    const rejectedProducts = normalizedProducts.filter(product => !filteredIds.has(product.id));

    return {
        filteredProducts: filteredProducts.length > 0 ? filteredProducts : normalizedProducts.slice(0, 1),
        rejectedProducts,
        dominantTokens: Array.from(new Set([...articleAnchorTokens, ...dominantTokens])),
    };
};
