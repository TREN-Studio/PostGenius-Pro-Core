import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Article, Blueprint } from '../types';
import { getPublishedArticles } from '../services/articleService';
import LoadingSpinner from './LoadingSpinner';
import Meta from './Meta';

interface LandingPageProps {
    onStartCreate?: () => void;
    aiConfig?: unknown;
}

const placeholderImage = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4MDAiIGhlaWdodD0iNDUwIiB2aWV3Qm94PSIwIDAgODAwIDQ1MCI+PHJlY3Qgd2lkdGg9IjEwMCUiIGhlaWdodD0iMTAwJSIgZmlsbD0iI2ZlZmJmOCIvPjwvc3ZnPg==';

const categoryDescriptions: Record<string, string> = {
    'Kitchen Gear': 'Appliances, cookware, and countertop picks that help readers compare performance and value faster.',
    Electronics: 'Screens, audio, accessories, and connected tech explained through practical use cases and buyer context.',
    'Home Essentials': 'Everyday home upgrades, comfort products, and durable picks curated for real-life spaces.',
    'Best Deals': 'Shortlists that surface value, not just discounts, with enough context to buy confidently.',
    'Product Reviews': 'Hands-on review stories, side-by-side verdicts, and buyer-first comparisons.',
};

const palette = [
    { shell: 'from-[#ffd4dd] via-[#f9e8ff] to-[#c7e7ff]', accent: 'from-[#ffb9cb] to-[#ffcf9f]', button: 'text-[#7a477a]' },
    { shell: 'from-[#dff4ff] via-[#eef2ff] to-[#ffe6f0]', accent: 'from-[#a9ddff] to-[#d9c5ff]', button: 'text-[#4f4aa2]' },
    { shell: 'from-[#fff1d6] via-[#fff9ee] to-[#e5f7ec]', accent: 'from-[#ffd692] to-[#bfe7c8]', button: 'text-[#7f5b1f]' },
    { shell: 'from-[#f0e6ff] via-[#fff6fb] to-[#dff6ff]', accent: 'from-[#d0baff] to-[#a8dfff]', button: 'text-[#6c4a8a]' },
];

const formatDate = (value: string | null | undefined): string => {
    if (!value) return 'Recently updated';
    return new Date(value).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
    });
};

const cleanDisplayText = (value: string | null | undefined): string => {
    const cleaned = String(value || '')
        .replace(/https?:\/\/\S+/gi, ' ')
        .replace(/www\.\S+/gi, ' ')
        .replace(/\b(?:dp|gp\/product)\/[A-Z0-9]{10}\b/gi, ' ')
        .replace(/\s{2,}/g, ' ')
        .replace(/\s+([,.:;!?])/g, '$1')
        .trim();

    return cleaned || String(value || '').trim();
};

const getDisplayTitle = (article: Article): string => cleanDisplayText(article.title);

const getExcerpt = (article: Article, fallback?: string): string => {
    const meta = String(article.seo?.metaDescription || '').trim();
    if (meta) return cleanDisplayText(meta);
    return cleanDisplayText(fallback || 'Trusted reviews, clear comparisons, and practical context designed to make buying decisions easier.');
};

const getEditorialLabel = (type: Blueprint): string => {
    if (type === 'review') return 'Trusted Review';
    if (type === 'roundup') return 'Top Picks';
    return 'Buying Guide';
};

const uniqueById = (items: Article[]): Article[] => {
    const seen = new Set<string>();
    return items.filter((item) => {
        if (seen.has(item.id)) return false;
        seen.add(item.id);
        return true;
    });
};

const takeUnique = (items: Article[], count: number, excluded = new Set<string>()): Article[] => {
    const seen = new Set<string>(excluded);
    const next: Article[] = [];
    for (const item of items) {
        if (seen.has(item.id)) continue;
        seen.add(item.id);
        next.push(item);
        if (next.length >= count) break;
    }
    return next;
};

const idsOf = (items: Array<Article | null | undefined>): Set<string> => (
    new Set(items.filter(Boolean).map((item) => item!.id))
);

const SoftSectionHeading: React.FC<{
    eyebrow: string;
    title: string;
    description: string;
    align?: 'left' | 'center';
    ctaLabel?: string;
    ctaTo?: string;
}> = ({ eyebrow, title, description, align = 'left', ctaLabel, ctaTo }) => (
    <div className={`flex flex-col gap-5 ${align === 'center' ? 'items-center text-center' : 'lg:flex-row lg:items-end lg:justify-between'}`}>
        <div className={align === 'center' ? 'max-w-3xl' : 'max-w-3xl'}>
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#7a477a]">{eyebrow}</p>
            <h2 className="mt-4 text-3xl font-black leading-[0.98] tracking-[-0.04em] text-[#402247] sm:text-4xl xl:text-[3.15rem]">
                {title}
            </h2>
            <p className="mt-4 text-base leading-relaxed text-[#6b5a73] sm:text-lg">
                {description}
            </p>
        </div>
        {ctaLabel && ctaTo && (
            <Link
                to={ctaTo}
                className="inline-flex shrink-0 self-start whitespace-nowrap rounded-full border border-[#dbc0d5] bg-[#fff6fb] px-6 py-3 text-sm font-semibold text-[#6b3667] shadow-[0_10px_26px_rgba(105,59,111,0.08)] transition hover:border-[#b985b7] hover:bg-white lg:self-center"
            >
                {ctaLabel}
            </Link>
        )}
    </div>
);

const HeroMiniCard: React.FC<{ article: Article; index: number }> = ({ article, index }) => {
    const theme = palette[index % palette.length];
    const displayTitle = getDisplayTitle(article);
    return (
        <Link
            to={`/blog/${article.slug}`}
            className={`group grid grid-cols-[92px_minmax(0,1fr)] items-center gap-4 rounded-[1.7rem] border border-white/70 bg-gradient-to-br ${theme.shell} p-4 shadow-[0_18px_44px_rgba(90,49,96,0.10)] transition hover:-translate-y-1`}
        >
            <div className="overflow-hidden rounded-[1.35rem] bg-white/80 shadow-sm">
                <img
                    src={article.image_url || placeholderImage}
                    alt={displayTitle}
                    className="aspect-[4/3] h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                />
            </div>
            <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#7a477a]">{getEditorialLabel(article.blueprint_type)}</p>
                <h3 className="mt-2 line-clamp-2 text-lg font-black leading-[1.08] tracking-[-0.03em] text-[#402247] [text-wrap:balance]">
                    {displayTitle}
                </h3>
                <p className="mt-2 text-xs text-[#6b5a73]">{formatDate(article.updated_at || article.published_at || article.created_at)}</p>
            </div>
        </Link>
    );
};

const EditorialCard: React.FC<{
    article: Article;
    index?: number;
}> = ({ article, index = 0 }) => {
    const theme = palette[index % palette.length];
    const displayTitle = getDisplayTitle(article);
    return (
        <Link
            to={`/blog/${article.slug}`}
            className="group overflow-hidden rounded-[2rem] border border-[#eadbe8] bg-white shadow-[0_24px_60px_rgba(90,49,96,0.08)] transition hover:-translate-y-1"
        >
            <div className={`bg-gradient-to-br ${theme.shell} p-4`}>
                <div className="overflow-hidden rounded-[1.55rem] bg-white/70">
                    <img
                        src={article.image_url || placeholderImage}
                        alt={article.title}
                        className="aspect-[16/11] h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                </div>
            </div>
            <div className="p-6">
                <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-[#ebd3e7] bg-[#fff6fb] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#7a477a]">
                        {getEditorialLabel(article.blueprint_type)}
                    </span>
                    <span className="text-[11px] uppercase tracking-[0.14em] text-[#8d8096]">{article.category || 'Magazine'}</span>
                </div>
                <h3 className="mt-4 line-clamp-4 text-[1.32rem] font-black leading-[1.02] tracking-[-0.03em] text-[#402247] transition-colors group-hover:text-[#7a477a] sm:text-[1.42rem] [text-wrap:balance]">
                    {displayTitle}
                </h3>
                <p className="mt-4 line-clamp-3 text-sm leading-relaxed text-[#6b5a73] sm:text-base">
                    {getExcerpt(article)}
                </p>
                <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                    <span className="text-sm font-medium text-[#8d8096]">{formatDate(article.updated_at || article.published_at || article.created_at)}</span>
                    <span className={`rounded-full bg-gradient-to-r ${theme.accent} px-4 py-2 text-sm font-semibold ${theme.button}`}>
                        Open Story
                    </span>
                </div>
            </div>
        </Link>
    );
};

const GuideTile: React.FC<{ article: Article; index: number }> = ({ article, index }) => {
    const theme = palette[index % palette.length];
    return (
        <Link to={`/blog/${article.slug}`} className="group block">
            <div className={`overflow-hidden rounded-[2rem] border border-[#eadbe8] bg-gradient-to-br ${theme.shell} p-3 shadow-[0_20px_45px_rgba(90,49,96,0.08)] transition hover:-translate-y-1`}>
                <div className="overflow-hidden rounded-[1.6rem] bg-white/75">
                    <img
                        src={article.image_url || placeholderImage}
                        alt={getDisplayTitle(article)}
                        className="aspect-[4/3] h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                </div>
            </div>
            <h3 className="mt-4 text-[1.45rem] font-black leading-[1.1] tracking-[-0.03em] text-[#4f315a] [text-wrap:balance]">
                {getDisplayTitle(article)}
            </h3>
        </Link>
    );
};

const CategoryFeatureCard: React.FC<{
    label: string;
    count: number;
    article?: Article;
    index: number;
}> = ({ label, count, article, index }) => {
    const theme = palette[index % palette.length];
    return (
        <Link
            to={`/blog?tag=${encodeURIComponent(label)}`}
            className="group flex h-full flex-col items-center rounded-[2rem] border border-[#eadbe8] bg-white px-6 py-8 text-center shadow-[0_20px_48px_rgba(90,49,96,0.08)] transition hover:-translate-y-1"
        >
            <div className={`relative mb-6 flex h-40 w-40 items-center justify-center rounded-full bg-gradient-to-br ${theme.shell}`}>
                <div className={`absolute -bottom-2 left-1/2 h-10 w-20 -translate-x-1/2 rounded-full bg-gradient-to-r ${theme.accent} opacity-70 blur-xl`} />
                <div className="relative overflow-hidden rounded-[1.5rem] border border-white/60 bg-white p-2 shadow-md">
                    <img
                        src={article?.image_url || placeholderImage}
                        alt={label}
                        className="h-24 w-24 rounded-[1rem] object-cover"
                    />
                </div>
            </div>
            <h3 className="text-[1.9rem] font-black tracking-[-0.04em] text-[#5b3061]">{label}</h3>
            <p className="mt-4 text-base leading-relaxed text-[#6b5a73]">
                {categoryDescriptions[label] || 'Editorially selected stories and category guides built to help readers choose faster.'}
            </p>
            <p className="mt-5 text-sm font-semibold text-[#1f9784]">Explore {count}+ stories</p>
        </Link>
    );
};

const LandingPage: React.FC<LandingPageProps> = () => {
    const [articles, setArticles] = useState<Article[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let active = true;

        const load = async () => {
            try {
                const data = await getPublishedArticles();
                if (!active) return;
                setArticles(uniqueById(data));
            } catch (err: any) {
                if (!active) return;
                setError(err?.message || 'Failed to load homepage stories.');
            } finally {
                if (active) setIsLoading(false);
            }
        };

        load();
        return () => {
            active = false;
        };
    }, []);

    const homepageData = useMemo(() => {
        const ordered = uniqueById(articles);
        const updated = [...ordered].sort(
            (a, b) => new Date(b.updated_at || b.published_at || b.created_at).getTime() - new Date(a.updated_at || a.published_at || a.created_at).getTime()
        );

        const reviews = ordered.filter((article) => article.blueprint_type === 'review');
        const comparisons = ordered.filter((article) => article.blueprint_type === 'roundup');
        const guides = ordered.filter((article) => article.blueprint_type !== 'review' && article.blueprint_type !== 'roundup');

        const leadStory = ordered[0] || null;
        const heroSupport = takeUnique(updated, 3, idsOf([leadStory]));
        const discoveryStories = takeUnique(updated, 6, idsOf([leadStory, ...heroSupport]));
        const featuredStories = takeUnique(updated, 3, idsOf([leadStory, ...heroSupport, ...discoveryStories]));
        const comparisonStories = takeUnique(uniqueById([...comparisons, ...updated]), 2, idsOf([leadStory, ...heroSupport, ...discoveryStories, ...featuredStories]));
        const guideStories = takeUnique(uniqueById([...guides, ...updated]), 2, idsOf([leadStory, ...heroSupport, ...discoveryStories, ...featuredStories, ...comparisonStories]));
        const editorsPicks = takeUnique(uniqueById([...reviews, ...updated]), 3, idsOf([leadStory, ...heroSupport, ...discoveryStories, ...featuredStories, ...comparisonStories, ...guideStories]));
        const quickReads = takeUnique(updated, 4, idsOf([leadStory, ...heroSupport, ...discoveryStories, ...featuredStories, ...comparisonStories, ...guideStories, ...editorsPicks]));

        const groupedCategories = ordered.reduce((acc, article) => {
            const label = String(article.category || '').trim();
            if (!label) return acc;
            if (!acc.has(label)) acc.set(label, []);
            acc.get(label)!.push(article);
            return acc;
        }, new Map<string, Article[]>());

        const categoryFronts = [...groupedCategories.entries()]
            .sort((a, b) => b[1].length - a[1].length)
            .slice(0, 4)
            .map(([label, items]) => ({
                label,
                count: items.length,
                article: items[0],
            }));

        return {
            leadStory,
            heroSupport,
            discoveryStories,
            featuredStories,
            comparisonStories,
            guideStories,
            editorsPicks,
            quickReads,
            categoryFronts,
            totalStories: ordered.length,
            totalCategories: groupedCategories.size,
        };
    }, [articles]);

    const {
        leadStory,
        heroSupport,
        discoveryStories,
        featuredStories,
        comparisonStories,
        guideStories,
        editorsPicks,
        quickReads,
        categoryFronts,
        totalStories,
        totalCategories,
    } = homepageData;

    return (
        <>
            <Meta
                title="Trusted Reviews, Comparisons, and Buying Guides"
                description="Discover trusted product reviews, practical buying guides, and clearer comparisons across kitchen gear, electronics, home essentials, and every niche worth shopping well."
            />

            <div className="space-y-16 pb-16 sm:space-y-20 sm:pb-24">
                <section className="relative overflow-hidden rounded-[3rem] border border-[#ead9e5] bg-gradient-to-r from-[#f5b4cf] via-[#b3baf2] to-[#88d8f8] shadow-[0_32px_90px_rgba(105,59,111,0.14)]">
                    <div className="absolute -left-20 top-28 h-56 w-56 rounded-full bg-white/18" />
                    <div className="absolute left-[34%] top-10 h-24 w-24 rounded-t-full bg-white/20" />
                    <div className="absolute right-14 top-20 h-40 w-40 rounded-full bg-white/14" />
                    <div className="absolute bottom-0 left-0 right-0 h-28 bg-white [clip-path:ellipse(78%_100%_at_50%_100%)]" />

                    <div className="relative grid gap-10 px-6 pb-24 pt-8 sm:px-8 sm:pb-28 sm:pt-10 lg:px-10 xl:grid-cols-[minmax(0,1fr)_minmax(0,0.95fr)] xl:px-14 xl:pt-14">
                        <div className="relative order-2 xl:order-1">
                            {isLoading ? (
                                <div className="rounded-[2.5rem] border border-white/40 bg-white/60 p-12 text-center">
                                    <LoadingSpinner />
                                </div>
                            ) : error ? (
                                <div className="rounded-[2.5rem] border border-red-200 bg-white/90 p-6 text-red-700">
                                    {error}
                                </div>
                            ) : leadStory ? (
                                <div className="relative">
                                    <div className="overflow-hidden rounded-[2.8rem] border border-white/65 bg-white/22 p-4 shadow-[0_26px_70px_rgba(90,49,96,0.16)] backdrop-blur-[2px]">
                                        <img
                                            src={leadStory.image_url || placeholderImage}
                                            alt={leadStory.title}
                                            className="aspect-[16/11] w-full rounded-[2.2rem] object-cover"
                                        />
                                    </div>

                                    {heroSupport.length > 0 && (
                                        <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:absolute xl:-bottom-10 xl:right-2 xl:w-[520px] xl:grid-cols-1">
                                            {heroSupport.slice(0, 2).map((article, index) => (
                                                <HeroMiniCard key={article.id} article={article} index={index} />
                                            ))}
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="rounded-[2.5rem] border border-white/40 bg-white/70 p-8 text-[#5b3061]">
                                    Fresh coverage will appear here as soon as publication updates are available.
                                </div>
                            )}
                        </div>

                        <div className="order-1 flex flex-col justify-center xl:order-2 xl:pl-4">
                            <div className="rounded-[2.7rem] border border-white/30 bg-[linear-gradient(135deg,rgba(87,41,107,0.18),rgba(255,255,255,0.10))] p-6 shadow-[0_18px_46px_rgba(77,34,93,0.12)] backdrop-blur-[2px] sm:p-8 xl:p-10">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-white/90 drop-shadow-sm">The Shopping Publication</p>
                                <h1 className="mt-5 max-w-3xl text-[2.7rem] font-black leading-[0.96] tracking-[-0.05em] text-white drop-shadow-[0_22px_36px_rgba(52,18,69,0.3)] sm:text-[3.55rem] xl:text-[5.2rem] [text-wrap:balance]">
                                    Expert Picks. Honest Reviews. Smarter Shopping.
                                </h1>
                                <p className="mt-6 max-w-2xl text-[1.1rem] font-medium leading-[1.65] text-white/95 sm:text-[1.3rem] drop-shadow-md">
                                    Discover curated guides and unbiased comparisons for the products that matter most to you, instantly. We turn broad discovery into a calmer editorial experience across every niche.
                                </p>
                                <div className="mt-8 flex flex-wrap gap-4">
                                    <Link to="/blog" className="inline-flex items-center rounded-full bg-[#7a477a] px-7 py-4 text-base font-semibold text-white shadow-[0_16px_34px_rgba(122,71,122,0.22)] transition hover:bg-[#693366]">
                                        Explore the Magazine
                                    </Link>
                                    <Link to="/pricing" className="inline-flex items-center rounded-full border border-white/65 bg-white/12 px-7 py-4 text-base font-semibold text-white transition hover:bg-white/20">
                                        Join Free Membership
                                    </Link>
                                </div>
                                <div className="mt-8 grid gap-3 sm:grid-cols-3">
                                    {[
                                        `${totalStories || 0}+ published stories`,
                                        `${totalCategories || 0}+ active categories`,
                                        'Multi-niche Amazon discovery',
                                    ].map((item) => (
                                        <span key={item} className="inline-flex items-center justify-center rounded-[1.4rem] border border-white/45 bg-white/88 px-4 py-4 text-sm font-semibold text-[#5c3565] shadow-sm">
                                            {item}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                <section className="space-y-8">
                    <SoftSectionHeading
                        eyebrow="Shop By Category"
                        title="Shop the best across every Amazon niche"
                        description="Borrowing Babylist's welcoming rhythm, these category fronts keep discovery visual and friendly while still covering every kind of Amazon shopper."
                        align="center"
                    />
                    <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
                        {categoryFronts.map((category, index) => (
                            <CategoryFeatureCard
                                key={category.label}
                                label={category.label}
                                count={category.count}
                                article={category.article}
                                index={index}
                            />
                        ))}
                    </div>
                </section>

                <section className="relative overflow-hidden rounded-[3rem] border border-[#ead9e5] bg-gradient-to-r from-[#ffd2aa] via-[#ffcedc] to-[#d6d7ff] px-6 py-10 shadow-[0_24px_80px_rgba(105,59,111,0.12)] sm:px-8 sm:py-12 xl:px-14">
                    <div className="absolute left-10 top-12 h-12 w-12 rounded-full bg-white/28" />
                    <div className="absolute right-12 bottom-12 h-16 w-16 rounded-t-full bg-white/24" />
                    <SoftSectionHeading
                        eyebrow="We've Got You Covered"
                        title="Soft, confidence-building sections that guide readers into the right story faster"
                        description="The visual language stays warm and consumer-friendly, but the structure still serves serious reviews, comparisons, and buying decisions across every category."
                        align="center"
                    />
                    <div className="mt-10 grid gap-6 xl:grid-cols-2">
                        {[comparisonStories[0], guideStories[0]].filter(Boolean).map((article, index) => (
                            <div key={article!.id} className="rounded-[2.3rem] bg-white p-6 shadow-[0_22px_54px_rgba(90,49,96,0.10)]">
                                <div className="flex flex-col gap-6 lg:flex-row lg:items-center">
                                    <div className={`relative mx-auto flex h-44 w-44 shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${palette[index % palette.length].shell}`}>
                                        <div className={`absolute -bottom-2 left-1/2 h-12 w-24 -translate-x-1/2 rounded-full bg-gradient-to-r ${palette[index % palette.length].accent} opacity-80 blur-xl`} />
                                        <img
                                            src={article!.image_url || placeholderImage}
                                            alt={getDisplayTitle(article!)}
                                            className="relative h-36 w-36 rounded-[2rem] object-cover shadow-lg"
                                        />
                                    </div>
                                    <div className="min-w-0 text-center lg:text-left">
                                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#7a477a]">{getEditorialLabel(article!.blueprint_type)}</p>
                                        <h3 className="mt-3 text-[2rem] font-black leading-[1.05] tracking-[-0.04em] text-[#4f315a] [text-wrap:balance]">
                                            {getDisplayTitle(article!)}
                                        </h3>
                                        <p className="mt-4 text-base leading-relaxed text-[#6b5a73]">{getExcerpt(article!)}</p>
                                        <Link to={`/blog/${article!.slug}`} className="mt-6 inline-flex rounded-full bg-[#7a477a] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#693366]">
                                            Read the Story
                                        </Link>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>

                <section className="space-y-8">
                    <SoftSectionHeading
                        eyebrow="Explore Guides by Category"
                        title="A visual grid that feels more like a consumer guide publication than a stack of cards"
                        description="These tiles stay broad and category-neutral, giving the homepage a friendlier browse path across kitchen gear, electronics, home, wellness, office, and more."
                        align="center"
                    />
                    <div className="grid gap-7 md:grid-cols-2 xl:grid-cols-3">
                        {discoveryStories.map((article, index) => (
                            <GuideTile key={article.id} article={article} index={index} />
                        ))}
                    </div>
                </section>

                <section className="grid gap-8 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
                    <div className="rounded-[2.5rem] border border-[#eadbe8] bg-white p-6 shadow-[0_24px_60px_rgba(90,49,96,0.08)] sm:p-8 xl:p-10">
                        <SoftSectionHeading
                            eyebrow="Fresh From the Magazine"
                            title="Feature stories arranged with calmer scan paths and clearer emphasis"
                            description="Instead of repeating tall cards, this section keeps image-led articles broader, lighter, and easier to move through."
                            ctaLabel="Browse All Stories"
                            ctaTo="/blog"
                        />
                        <div className="mt-8 grid gap-6 md:grid-cols-2 2xl:grid-cols-3">
                            {featuredStories.map((article, index) => (
                                <EditorialCard key={article.id} article={article} index={index} />
                            ))}
                        </div>
                    </div>

                    <div className="rounded-[2.5rem] border border-[#eadbe8] bg-gradient-to-br from-[#fff4fb] via-white to-[#edf7ff] p-6 shadow-[0_24px_60px_rgba(90,49,96,0.08)] sm:p-8 xl:p-10">
                        <SoftSectionHeading
                            eyebrow="Trending Now"
                            title="Short editorial entries that surface what is moving right now"
                            description="Compact supporting stories keep the homepage lively without turning it into a thin card wall."
                        />
                        <div className="mt-8 space-y-4">
                            {quickReads.map((article, index) => (
                                <HeroMiniCard key={article.id} article={article} index={index} />
                            ))}
                        </div>
                    </div>
                </section>

                <section className="rounded-[2.5rem] border border-[#eadbe8] bg-white p-6 shadow-[0_24px_60px_rgba(90,49,96,0.08)] sm:p-8 xl:p-10">
                        <SoftSectionHeading
                            eyebrow="Why Readers Trust Us"
                            title="A friendlier, Babylist-inspired surface that still works for serious product decisions"
                            description="The interface borrows the warmth, rounded geometry, and calm scan paths of Babylist, but it stays completely generic and ready for every Amazon niche."
                            align="center"
                        />
                    <div className="mt-10 grid gap-5 md:grid-cols-3">
                        {[
                            {
                                title: 'Editorial structure first',
                                copy: 'Each section is organized to reduce scanning fatigue and help readers find the right story type quickly.',
                            },
                            {
                                title: 'Multi-niche by design',
                                copy: 'The layout is generic enough for kitchen, electronics, home, office, fitness, and any future Amazon niche.',
                            },
                            {
                                title: 'Search-friendly hierarchy',
                                copy: 'Clear categories, stronger entry points, and image-led sections support both reader discovery and crawl clarity.',
                            },
                        ].map((item, index) => (
                            <div key={item.title} className={`rounded-[2rem] bg-gradient-to-br ${palette[index % palette.length].shell} p-6`}>
                                <p className="text-sm font-semibold uppercase tracking-[0.14em] text-[#7a477a]">{item.title}</p>
                                <p className="mt-4 text-base leading-relaxed text-[#6b5a73]">{item.copy}</p>
                            </div>
                        ))}
                    </div>
                </section>
            </div>
        </>
    );
};

export default LandingPage;
