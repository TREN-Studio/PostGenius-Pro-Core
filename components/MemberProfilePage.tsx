import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Session } from '../types';
import {
    getNewsletterSetting,
    getSavedReviews,
    getTrackedProducts,
    removeSavedReview,
    setNewsletterSetting,
    toggleTrackedProduct,
    type SavedReview,
    type TrackedProduct,
} from '../services/memberCollectionService';

interface MemberProfilePageProps {
    session: Session;
}

const cardClass = 'rounded-xl border border-border-color bg-card-bg/90 p-5';

const MemberProfilePage: React.FC<MemberProfilePageProps> = ({ session }) => {
    const userEmail = session.user?.email || '';
    const [savedReviews, setSavedReviews] = useState<SavedReview[]>([]);
    const [trackedProducts, setTrackedProducts] = useState<TrackedProduct[]>([]);
    const [newsletterEnabled, setNewsletterEnabled] = useState(true);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const loadMemberData = async (userId: string) => {
        const [reviews, products, newsletter] = await Promise.all([
            getSavedReviews(userId),
            getTrackedProducts(userId),
            getNewsletterSetting(userId),
        ]);
        setSavedReviews(reviews);
        setTrackedProducts(products);
        setNewsletterEnabled(newsletter);
    };

    useEffect(() => {
        let active = true;
        const userId = session.user?.id;
        if (!userId) {
            setIsLoading(false);
            return;
        }

        const initialize = async () => {
            setIsLoading(true);
            setError(null);
            try {
                await loadMemberData(userId);
            } catch (err: any) {
                if (!active) return;
                setError(err?.message || 'Failed to load member data.');
            } finally {
                if (active) setIsLoading(false);
            }
        };

        initialize();
        return () => {
            active = false;
        };
    }, [session.user?.id]);

    const stats = useMemo(() => ([
        { label: 'Saved Reviews', value: savedReviews.length },
        { label: 'Tracked Products', value: trackedProducts.length },
        { label: 'Newsletter', value: newsletterEnabled ? 'On' : 'Off' },
    ]), [savedReviews.length, trackedProducts.length, newsletterEnabled]);

    const handleRemoveSavedReview = async (slug: string) => {
        const userId = session.user?.id;
        if (!userId) return;
        try {
            await removeSavedReview(slug, userId);
            setSavedReviews(await getSavedReviews(userId));
        } catch (err: any) {
            setError(err?.message || 'Failed to remove saved review.');
        }
    };

    const handleToggleTracked = async (product: TrackedProduct) => {
        const userId = session.user?.id;
        if (!userId) return;
        try {
            await toggleTrackedProduct({ title: product.title, url: product.url }, userId);
            setTrackedProducts(await getTrackedProducts(userId));
        } catch (err: any) {
            setError(err?.message || 'Failed to update tracked product.');
        }
    };

    const handleNewsletterToggle = async (enabled: boolean) => {
        const userId = session.user?.id;
        if (!userId) return;
        try {
            await setNewsletterSetting(enabled, userId);
            setNewsletterEnabled(enabled);
        } catch (err: any) {
            setError(err?.message || 'Failed to update newsletter settings.');
        }
    };

    return (
        <div className="max-w-5xl mx-auto w-full animate-fade-in space-y-6">
            {error && (
                <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                    {error}
                </div>
            )}
            <section className={`${cardClass} bg-gradient-to-br from-cyan-500/10 via-card-bg/90 to-amber-400/10`}>
                <p className="text-xs uppercase tracking-[0.15em] text-accent mb-2">Member Profile</p>
                <h1 className="text-3xl sm:text-4xl font-black text-text-headings">Smart Shopper Dashboard</h1>
                <p className="text-text-secondary mt-3 max-w-2xl">
                    Join our community of smart shoppers. Save verified reviews, track favorite Amazon products, and get price-drop updates.
                </p>
                <p className="text-sm text-text-secondary mt-2">Signed in as <span className="text-text-primary font-semibold">{userEmail || 'member'}</span></p>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-5">
                    {stats.map(item => (
                        <div key={item.label} className="rounded-lg border border-border-color bg-background/40 px-4 py-3">
                            <p className="text-xs uppercase tracking-[0.12em] text-text-secondary">{item.label}</p>
                            <p className="text-xl font-bold text-text-headings mt-1">{item.value}</p>
                        </div>
                    ))}
                </div>
            </section>

            <section className={cardClass}>
                <div className="flex items-center justify-between gap-3">
                    <h2 className="text-xl font-bold text-text-headings">My Saved Reviews</h2>
                    <Link to="/blog" className="text-sm text-accent hover:underline">Browse Reviews</Link>
                </div>
                {isLoading ? (
                    <p className="text-text-secondary mt-3">Loading your collection...</p>
                ) : savedReviews.length === 0 ? (
                    <p className="text-text-secondary mt-3">You have not saved any reviews yet. Use "Save to My Collection" on article cards.</p>
                ) : (
                    <div className="mt-4 space-y-3">
                        {savedReviews.map(review => (
                            <div key={review.slug} className="flex items-center justify-between gap-3 rounded-lg border border-border-color bg-background/40 px-4 py-3">
                                <div className="min-w-0">
                                    <Link to={`/blog/${review.slug}`} className="font-semibold text-text-primary hover:text-accent line-clamp-1">{review.title}</Link>
                                    <p className="text-xs text-text-secondary mt-1">Saved on {new Date(review.savedAt).toLocaleDateString('en-US')}</p>
                                </div>
                                <button
                                    onClick={() => handleRemoveSavedReview(review.slug)}
                                    className="text-xs px-3 py-1.5 rounded-full border border-red-400/40 text-red-300 hover:bg-red-500/10"
                                >
                                    Remove
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </section>

            <section className={cardClass}>
                <h2 className="text-xl font-bold text-text-headings">Tracked Products</h2>
                {isLoading ? (
                    <p className="text-text-secondary mt-3">Loading tracked products...</p>
                ) : trackedProducts.length === 0 ? (
                    <p className="text-text-secondary mt-3">No tracked products yet. Use "Save to My Collection" next to Amazon product cards.</p>
                ) : (
                    <div className="mt-4 space-y-3">
                        {trackedProducts.map((product, idx) => (
                            <div key={`${product.url}-${idx}`} className="flex items-center justify-between gap-3 rounded-lg border border-border-color bg-background/40 px-4 py-3">
                                <div className="min-w-0">
                                    <p className="font-semibold text-text-primary line-clamp-1">{product.title}</p>
                                    <a href={product.url} target="_blank" rel="noopener noreferrer sponsored nofollow" className="text-xs text-accent hover:underline break-all">{product.url}</a>
                                </div>
                                <button
                                    onClick={() => handleToggleTracked(product)}
                                    className="text-xs px-3 py-1.5 rounded-full border border-border-color text-text-secondary hover:text-text-primary hover:border-accent/40"
                                >
                                    Untrack
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </section>

            <section className={cardClass}>
                <h2 className="text-xl font-bold text-text-headings">Newsletter Settings</h2>
                <p className="text-text-secondary mt-2">
                    Enable updates for fresh buying guides and price alerts. New members also get the free guide:
                    <span className="text-accent font-semibold"> Best 10 Kitchen Products for 2026</span>.
                </p>
                <label className="mt-4 inline-flex items-center gap-3 text-sm text-text-primary">
                    <input
                        type="checkbox"
                        checked={newsletterEnabled}
                        onChange={(e) => handleNewsletterToggle(e.target.checked)}
                        className="h-4 w-4 rounded border-border-color bg-background text-accent focus:ring-accent"
                    />
                    Send me weekly smart shopper updates
                </label>
            </section>
        </div>
    );
};

export default MemberProfilePage;

