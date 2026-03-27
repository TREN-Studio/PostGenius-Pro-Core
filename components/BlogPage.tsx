import React, { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { Article, Blueprint, Session } from '../types';
import { getPublishedArticles } from '../services/articleService';
import { getSavedReviews, toggleSavedReview } from '../services/memberCollectionService';
import LoadingSpinner from './LoadingSpinner';
import Meta from './Meta';

interface BlogPageProps {
    session: Session | null;
    onEdit?: (article: Article) => void;
}

const filters: Array<{ id: Blueprint | 'all'; label: string }> = [
    { id: 'all', label: 'Latest Stories' },
    { id: 'review', label: 'Trusted Reviews' },
    { id: 'recipe', label: 'Buying Guides' },
    { id: 'roundup', label: 'Top Picks' },
];

const conversionHighlights = ['Trusted Reviews', 'Clear Comparisons', 'Practical Buying Guides'];

const getBlueprintLabel = (type: Blueprint): string => {
    if (type === 'review') return 'Trusted Review';
    if (type === 'recipe') return 'Buying Guide';
    return 'Top Picks';
};

const getCardBadges = (type: Blueprint): string[] => {
    if (type === 'review') return ['Trusted Review', 'Expert Pick'];
    if (type === 'recipe') return ['Buying Guide', 'How to Choose'];
    return ['Top Picks', 'Comparison Roundup'];
};

const getPrimaryCta = (type: Blueprint): string => {
    if (type === 'review') return 'Read Review';
    if (type === 'recipe') return 'Open Buying Guide';
    return 'See Top Picks';
};

const normalizeFilterValue = (value: string | null | undefined): string =>
    String(value || '').trim().toLowerCase();

const BlogPage: React.FC<BlogPageProps> = ({ session, onEdit }) => {
    const [articles, setArticles] = useState<Article[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedFilter, setSelectedFilter] = useState<Blueprint | 'all'>('all');
    const [savedSlugs, setSavedSlugs] = useState<Set<string>>(new Set());

    const [searchParams, setSearchParams] = useSearchParams();
    const tagFilter = searchParams.get('tag');
    const categoryFilter = searchParams.get('category');
    const searchFilter = searchParams.get('search') || '';
    const typeFilter = searchParams.get('type');

    useEffect(() => {
        setSearchQuery(searchFilter);
    }, [searchFilter]);

    useEffect(() => {
        if (typeFilter === 'review' || typeFilter === 'recipe' || typeFilter === 'roundup') {
            setSelectedFilter(typeFilter);
            return;
        }
        setSelectedFilter('all');
    }, [typeFilter]);

    useEffect(() => {
        const fetchArticles = async () => {
            try {
                const data = await getPublishedArticles();
                setArticles(data);
            } catch (err: any) {
                setError(err.message || 'Failed to fetch articles.');
            } finally {
                setIsLoading(false);
            }
        };
        fetchArticles();
    }, []);

    useEffect(() => {
        let active = true;
        const userId = session?.user?.id;
        if (!userId) {
            setSavedSlugs(new Set());
            return;
        }

        const loadSaved = async () => {
            try {
                const saved = (await getSavedReviews(userId)).map(item => item.slug);
                if (active) setSavedSlugs(new Set(saved));
            } catch {
                if (active) setSavedSlugs(new Set());
            }
        };

        loadSaved();
        return () => {
            active = false;
        };
    }, [session?.user?.id, articles.length]);

    const filteredArticles = useMemo(() => {
        const q = searchQuery.toLowerCase();
        const normalizedTagFilter = normalizeFilterValue(tagFilter);
        const normalizedCategoryFilter = normalizeFilterValue(categoryFilter);
        return articles.filter(article => {
            const matchesSearch = article.title.toLowerCase().includes(q) || article.category.toLowerCase().includes(q);
            const matchesFilter = selectedFilter === 'all' || article.blueprint_type === selectedFilter;
            const normalizedArticleCategory = normalizeFilterValue(article.category);
            const normalizedArticleTags = Array.isArray(article.tags)
                ? article.tags.map((tag) => normalizeFilterValue(tag))
                : [];

            const matchesTag = !normalizedTagFilter
                || normalizedArticleCategory === normalizedTagFilter
                || normalizedArticleTags.includes(normalizedTagFilter);

            const matchesCategory = !normalizedCategoryFilter
                || normalizedArticleCategory === normalizedCategoryFilter
                || normalizedArticleTags.includes(normalizedCategoryFilter);

            return matchesSearch && matchesFilter && matchesTag && matchesCategory;
        });
    }, [articles, searchQuery, selectedFilter, tagFilter, categoryFilter]);

    const handleSaveReview = async (article: Article) => {
        const userId = session?.user?.id;
        if (!userId) return;
        try {
            const nextSaved = await toggleSavedReview(article, userId);
            setSavedSlugs(prev => {
                const next = new Set(prev);
                if (nextSaved) next.add(article.slug);
                else next.delete(article.slug);
                return next;
            });
        } catch (err: any) {
            setError(err?.message || 'Failed to update your collection.');
        }
    };

    const getCount = (id: Blueprint | 'all') => {
        if (id === 'all') return articles.length;
        return articles.filter(a => a.blueprint_type === id).length;
    };

    const featuredArchiveStory = filteredArticles[0] || null;
    const archiveGridStories = featuredArchiveStory ? filteredArticles.slice(1) : filteredArticles;

    const updateQuery = (next: { search?: string; type?: Blueprint | 'all'; clearTag?: boolean; }) => {
        const params = new URLSearchParams(searchParams);
        if (typeof next.search === 'string') {
            if (next.search.trim()) params.set('search', next.search.trim());
            else params.delete('search');
        }
        if (typeof next.type !== 'undefined') {
            if (next.type === 'all') params.delete('type');
            else params.set('type', next.type);
        }
        if (next.clearTag) {
            params.delete('tag');
            params.delete('category');
        }
        setSearchParams(params);
    };

    if (isLoading) {
        return <div className="text-center py-16"><LoadingSpinner /></div>;
    }

    if (error) {
        return <div className="text-red-400 p-4 bg-red-900/50 rounded-md text-center">{error}</div>;
    }

    return (
        <>
            <Meta
                title="Trusted Reviews and Buying Guides"
                description="Explore trusted product reviews, practical buying guides, and clear comparisons from Postgenius Pro."
            />
            <div className="w-full animate-fade-in min-h-screen space-y-10 pb-16">
                <section className="relative overflow-hidden rounded-[3rem] border border-[#eadbe8] bg-gradient-to-r from-[#f5b4cf] via-[#b6b7f0] to-[#8cd8f8] px-6 py-8 shadow-[0_24px_70px_rgba(90,49,96,0.10)] sm:px-8 sm:py-10">
                    <div className="absolute left-10 top-10 h-16 w-16 rounded-t-full bg-white/30"></div>
                    <div className="absolute right-12 top-12 h-24 w-24 rounded-full bg-white/18"></div>
                    <div className="absolute bottom-0 left-0 right-0 h-20 bg-white [clip-path:ellipse(80%_100%_at_50%_100%)]"></div>
                    <div className="relative">
                        <div className="mx-auto max-w-4xl text-center">
                            <h2 className="mb-4 text-4xl font-black tracking-[-0.04em] text-white sm:text-5xl md:text-6xl">
                                Explore reviews, comparisons, and guides with a calmer archive experience.
                            </h2>
                            <p className="mx-auto max-w-3xl text-base leading-relaxed text-white/88 sm:text-lg md:text-xl">
                                The archive borrows Babylist's gentle browse rhythm, but stays fully multi-niche for every Amazon category we publish.
                            </p>
                            <div className="mt-6 flex flex-wrap justify-center gap-2 sm:gap-3">
                            {conversionHighlights.map((item) => (
                                <span key={item} className="px-3 py-1.5 rounded-full border border-white/50 bg-white/14 text-white text-[11px] sm:text-xs font-semibold tracking-[0.08em] uppercase">
                                    {item}
                                </span>
                            ))}
                            </div>
                        </div>

                        {featuredArchiveStory && (
                            <div className="mt-10 grid gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(320px,0.72fr)]">
                                <Link to={`/blog/${featuredArchiveStory.slug}`} className="group overflow-hidden rounded-[2.3rem] bg-white p-4 shadow-[0_24px_60px_rgba(90,49,96,0.12)]">
                                    <div className="overflow-hidden rounded-[1.8rem] bg-[#f7f1f7]">
                                        <img
                                            src={featuredArchiveStory.image_url || 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4MDAiIGhlaWdodD0iNDUwIiB2aWV3Qm94PSIwIDAgODAwIDQ1MCI+PHJlY3Qgd2lkdGg9IjEwMCUiIGhlaWdodD0iMTAwJSIgZmlsbD0iI2ZlZmJmOCIvPjwvc3ZnPg=='}
                                            alt={featuredArchiveStory.title}
                                            className="aspect-[16/9] h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                                        />
                                    </div>
                                    <div className="p-2 pt-5 sm:px-4 sm:pb-4">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span className="rounded-full border border-[#eadbe8] bg-[#fff6fb] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#7a477a]">
                                                Featured Story
                                            </span>
                                            <span className="text-[11px] uppercase tracking-[0.14em] text-[#8d8096]">{getBlueprintLabel(featuredArchiveStory.blueprint_type)}</span>
                                        </div>
                                        <h3 className="mt-4 text-[2.1rem] font-black leading-[1.04] tracking-[-0.04em] text-[#4f315a] sm:text-[2.6rem] [text-wrap:balance]">
                                            {featuredArchiveStory.title}
                                        </h3>
                                        <p className="mt-4 max-w-2xl text-base leading-relaxed text-[#6b5a73]">
                                            {featuredArchiveStory.seo?.metaDescription}
                                        </p>
                                    </div>
                                </Link>

                                <div className="grid gap-4">
                                    {archiveGridStories.slice(0, 3).map((article) => (
                                        <Link key={article.id} to={`/blog/${article.slug}`} className="group grid grid-cols-[112px_minmax(0,1fr)] items-center gap-4 rounded-[1.8rem] border border-white/50 bg-white/82 p-4 shadow-[0_20px_45px_rgba(90,49,96,0.10)]">
                                            <div className="overflow-hidden rounded-[1.2rem]">
                                                <img
                                                    src={article.image_url || 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4MDAiIGhlaWdodD0iNDUwIiB2aWV3Qm94PSIwIDAgODAwIDQ1MCI+PHJlY3Qgd2lkdGg9IjEwMCUiIGhlaWdodD0iMTAwJSIgZmlsbD0iI2ZlZmJmOCIvPjwvc3ZnPg=='}
                                                    alt={article.title}
                                                    className="aspect-[4/3] h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                                                />
                                            </div>
                                            <div>
                                                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#7a477a]">{getBlueprintLabel(article.blueprint_type)}</p>
                                                <h3 className="mt-2 line-clamp-2 text-lg font-black leading-[1.08] text-[#4f315a]">{article.title}</h3>
                                            </div>
                                        </Link>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </section>

                <div className="mb-7 overflow-x-auto scrollbar-hide -mx-4 px-4 sm:mx-0 sm:px-0">
                    <div className="flex gap-2 min-w-max pb-2">
                        {filters.map(filter => {
                            const active = selectedFilter === filter.id;
                            return (
                                <button
                                    key={filter.id}
                                    onClick={() => updateQuery({ type: filter.id, clearTag: false })}
                                    className={`px-4 py-2 rounded-full text-sm font-semibold whitespace-nowrap transition ${active ? 'bg-[#7a477a] text-white' : 'bg-white text-[#6b5a73] border border-[#eadbe8] hover:border-[#c695c4] hover:text-[#7a477a]'}`}
                                >
                                    {filter.label} <span className="opacity-70 ml-1">({getCount(filter.id)})</span>
                                </button>
                            );
                        })}
                    </div>
                </div>

                <div className="max-w-xl mx-auto mb-8 relative px-4 sm:px-0">
                    <input
                        type="text"
                        placeholder="Search reviews, comparisons, and buying guides..."
                        value={searchQuery}
                        onChange={(e) => {
                            setSearchQuery(e.target.value);
                            updateQuery({ search: e.target.value });
                        }}
                        className="w-full px-5 py-3 rounded-full bg-white border border-[#eadbe8] text-[#402247] placeholder:text-[#8d8096] focus:outline-none focus:border-[#b985b7] transition-all shadow-[0_12px_34px_rgba(90,49,96,0.08)]"
                    />
                </div>

                {(tagFilter || categoryFilter) && (
                    <div className="max-w-xl mx-auto mb-8 text-center">
                        <div className="inline-flex items-center gap-2 px-4 py-2 bg-[#fff5fb] text-[#7a477a] rounded-full text-sm font-medium border border-[#eadbe8]">
                            <span>Filtered by: <strong>{tagFilter || categoryFilter}</strong></span>
                            <button onClick={() => setSearchParams({})} className="hover:text-[#5b3061] transition-colors">Clear</button>
                        </div>
                    </div>
                )}

                {filteredArticles.length === 0 ? (
                    <div className="text-center py-16">
                        <p className="text-xl text-text-secondary">No articles matched this filter.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3 lg:gap-8">
                        {archiveGridStories.map(article => {
                            const isAuthor = session?.user?.id === article.user_id;
                            const saved = savedSlugs.has(article.slug);

                            return (
                                <div key={article.id} className="group overflow-hidden rounded-[2rem] border border-[#eadbe8] bg-white transition-all duration-300 hover:-translate-y-1 hover:border-[#c695c4] shadow-[0_22px_55px_rgba(90,49,96,0.08)] flex flex-col">
                                    <Link to={`/blog/${article.slug}`} className="block flex-grow">
                                        <div className="aspect-video overflow-hidden bg-gradient-to-br from-[#fff0f7] via-[#f6f9ff] to-[#eef7ff] p-4">
                                            <img
                                                src={article.image_url || 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4MDAiIGhlaWdodD0iNDUwIiB2aWV3Qm94PSIwIDAgODAwIDQ1MCI+PHJlY3Qgd2lkdGg9IjEwMCUiIGhlaWdodD0iMTAwJSIgZmlsbD0iIzBmMTcyYSIvPjwvc3ZnPg=='}
                                                alt={article.title}
                                                className="w-full h-full rounded-[1.5rem] object-cover group-hover:scale-105 transition-transform duration-500 shadow-[0_14px_26px_rgba(90,49,96,0.10)]"
                                            />
                                        </div>
                                        <div className="p-5">
                                            <div className="flex flex-wrap gap-2 mb-3">
                                                {getCardBadges(article.blueprint_type).map(badge => (
                                                    <span key={badge} className="text-[10px] px-2 py-1 rounded-full border border-[#ead3e7] bg-[#fff5fb] text-[#7a477a] uppercase tracking-[0.08em]">
                                                        {badge}
                                                    </span>
                                                ))}
                                            </div>
                                            <p className="text-sm text-[#7a477a] font-semibold mb-2 uppercase tracking-wider">{article.category}</p>
                                            <h3 className="text-2xl font-black tracking-[-0.03em] text-[#402247] group-hover:text-[#7a477a] transition-colors line-clamp-2">{article.title}</h3>
                                            <p className="text-[#6b5a73] mt-3 text-sm line-clamp-3 leading-relaxed">
                                                {article.seo?.metaDescription}
                                            </p>
                                            <div className="mt-3 flex items-center justify-between gap-2">
                                                <span className="inline-flex items-center rounded-full border border-[#ead3e7] bg-[#fff5fb] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#7a477a]">
                                                    Editorial Selection
                                                </span>
                                                <span className="text-[10px] uppercase tracking-[0.1em] text-[#8d8096]">
                                                    {getBlueprintLabel(article.blueprint_type)}
                                                </span>
                                            </div>
                                            <p className="text-xs text-[#6b5a73] mt-4 border-t border-[#f0e5ed] pt-4 flex flex-wrap justify-between items-center gap-2">
                                                <span>{article.published_at ? new Date(article.published_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : 'Recently'}</span>
                                                <span className="font-medium text-[#7a477a]">
                                                    {article.author_role === 'admin' ? 'Postgenius Pro' : (article.author_name || article.author_username || 'Reviewer')}
                                                </span>
                                            </p>
                                        </div>
                                    </Link>

                                    <div className="p-4 border-t border-[#f0e5ed] bg-[#fffafc] space-y-2">
                                        <Link
                                            to={`/blog/${article.slug}`}
                                            className="block w-full text-center py-3 px-4 min-h-[44px] rounded-full text-sm font-extrabold bg-[#7a477a] text-white hover:bg-[#693366] transition-all"
                                        >
                                            {getPrimaryCta(article.blueprint_type)}
                                        </Link>

                                        {session ? (
                                            <button
                                                onClick={() => handleSaveReview(article)}
                                                className={`w-full py-3 px-4 min-h-[44px] rounded-full text-sm font-semibold transition-colors border ${saved ? 'bg-[#fff5fb] border-[#d9b2d8] text-[#7a477a]' : 'bg-white border-[#eadbe8] text-[#6b5a73] hover:border-[#c695c4] hover:text-[#7a477a]'}`}
                                            >
                                                {saved ? 'Saved to Reading List' : 'Save to Reading List'}
                                            </button>
                                        ) : (
                                            <Link to="/signup" className="block w-full text-center py-3 px-4 min-h-[44px] rounded-full text-sm font-semibold bg-white border border-[#eadbe8] text-[#6b5a73] hover:border-[#c695c4] hover:text-[#7a477a]">
                                                Save to Reading List
                                            </Link>
                                        )}

                                        {isAuthor && onEdit && (
                                            <button
                                                onClick={() => onEdit(article)}
                                                className="w-full py-3 px-4 min-h-[44px] bg-[#fff5fb] text-[#7a477a] hover:bg-[#f9ebf7] rounded-full text-sm font-medium transition-colors border border-[#eadbe8]"
                                            >
                                                Edit / Republish
                                            </button>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </>
    );
};

export default BlogPage;
