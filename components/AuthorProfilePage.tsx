import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import type { Article, UserProfile } from '../types';
import { getPublishedArticlesByUserId, getUserProfileById } from '../services/articleService';
import LoadingSpinner from './LoadingSpinner';
import Meta from './Meta';
import NotFoundPage from './NotFoundPage';

const AuthorProfilePage: React.FC = () => {
    const { userId } = useParams<{ userId: string }>();
    const [articles, setArticles] = useState<Article[]>([]);
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!userId) {
            setError("User ID is missing.");
            setIsLoading(false);
            return;
        }

        const fetchData = async () => {
            setIsLoading(true);
            setError(null);
            try {
                const [userProfile, userArticles] = await Promise.all([
                    getUserProfileById(userId),
                    getPublishedArticlesByUserId(userId)
                ]);

                if (userProfile) {
                    setProfile(userProfile);
                    setArticles(userArticles);
                } else {
                    setProfile(null);
                }
            } catch (err: any) {
                console.error("Failed to fetch author data:", err);
                setError(err.message || 'Failed to fetch author profile.');
            } finally {
                setIsLoading(false);
            }
        };

        fetchData();
    }, [userId]);

    const handleImageError = (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
        e.currentTarget.src = `data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4MDAiIGhlaWdodD0iNDUwIiB2aWV3Qm94PSIwIDAgODAwIDQ1MCI+PHJlY3Qgd2lkdGg9IjEwMCUiIGhlaWdodD0iMTAwJSIgZmlsbD0iIzFmMjAzYSIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBmb250LWZhbWlseT0ic2Fucy1zZXJpZiIgZm9udC1zaXplPSIyNCIgZmlsbD0iIzU1NSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZG9taW5hbnQtYmFzZWxpbmU9Im1pZGRsZSI+Tm8gSW1hZ2UgQXZhaWxhYmxlPC90ZXh0Pjwvc3ZnPg==`;
        e.currentTarget.onerror = null;
    };

    if (isLoading) {
        return <div className="text-center py-16"><LoadingSpinner /></div>;
    }

    if (error) {
        return <div className="text-red-400 p-4 bg-red-900/50 rounded-md text-center">{error}</div>;
    }

    if (!profile) {
        return <NotFoundPage />;
    }

    return (
        <>
            <Meta
                title={`${profile.full_name || 'Author'} - Postgenius Pro`}
                description={`Read articles by ${profile.full_name || 'this author'} on Postgenius Pro.`}
            />
            <div className="max-w-6xl mx-auto p-4 sm:p-8 animate-fade-in">
                {/* Author Header */}
                <div className="bg-card-bg rounded-xl shadow-xl border border-border-color p-8 mb-12 flex flex-col md:flex-row items-center gap-8 text-center md:text-left">
                    <div className="w-32 h-32 rounded-full overflow-hidden border-4 border-accent shadow-lg flex-shrink-0 bg-gray-800">
                        {profile.avatar_url ? (
                            <img src={profile.avatar_url} alt={profile.full_name || 'Author'} className="w-full h-full object-cover" />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center bg-accent text-white text-4xl font-bold">
                                {(profile.full_name || 'A').charAt(0).toUpperCase()}
                            </div>
                        )}
                    </div>
                    <div className="flex-1">
                        <h1 className="text-3xl sm:text-4xl font-black text-text-headings mb-2">
                            {profile.full_name || 'PostGenius Author'}
                        </h1>
                        {profile.bio && (
                            <p className="text-text-secondary text-lg mb-4 max-w-2xl">{profile.bio}</p>
                        )}
                        <div className="flex flex-wrap gap-4 justify-center md:justify-start text-sm text-text-secondary">
                            {profile.country && (
                                <span className="flex items-center gap-1">
                                    📍 {profile.country}
                                </span>
                            )}
                            <span className="flex items-center gap-1">
                                📝 {articles.length} Article{articles.length !== 1 ? 's' : ''} Published
                            </span>
                        </div>
                    </div>
                </div>

                {/* Articles Grid */}
                <h2 className="text-2xl font-bold text-text-headings mb-6 border-b border-border-color pb-2">
                    Latest Articles
                </h2>

                {articles.length === 0 ? (
                    <div className="text-center py-16">
                        <p className="text-xl text-text-secondary">This author hasn't published any articles yet.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
                        {articles.map(article => (
                            <div key={article.id} className="group bg-card-bg rounded-xl border border-border-color overflow-hidden hover:border-accent/50 transition-all duration-300 transform hover:-translate-y-1 shadow-lg flex flex-col">
                                <Link to={`/blog/${article.slug}`} className="block flex-grow">
                                    <div className="aspect-video overflow-hidden bg-black/20">
                                        <img
                                            src={article.image_url || `data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4MDAiIGhlaWdodD0iNDUwIiB2aWV3Qm94PSIwIDAgODAwIDQ1MCI+PHJlY3Qgd2lkdGg9IjEwMCUiIGhlaWdodD0iMTAwJSIgZmlsbD0iIzFmMjAzYSIvPjwvc3ZnPg==`}
                                            alt={article.title}
                                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                            onError={handleImageError}
                                        />
                                    </div>
                                    <div className="p-6">
                                        <p className="text-sm text-accent font-semibold mb-2 uppercase tracking-wider">{article.category}</p>
                                        <h3 className="text-xl font-bold text-text-headings group-hover:text-accent transition-colors line-clamp-2">{article.title}</h3>
                                        <p className="text-text-secondary mt-3 text-sm line-clamp-3 leading-relaxed">
                                            {article.seo.metaDescription}
                                        </p>
                                        <p className="text-xs text-text-secondary mt-4 border-t border-border-color pt-4">
                                            {new Date(article.published_at!).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
                                        </p>
                                    </div>
                                </Link>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </>
    );
};

export default AuthorProfilePage;
