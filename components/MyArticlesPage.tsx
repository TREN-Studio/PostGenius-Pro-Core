import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import type { Article, ArticleStatus, ArticleContent } from '../types';
import { getUserArticles, deleteArticle } from '../services/articleService';
import LoadingSpinner from './LoadingSpinner';
import Meta from './Meta';

interface MyArticlesPageProps {
    onEdit: (article: Article) => void;
    onNew: () => void;
}

const MyArticlesPage: React.FC<MyArticlesPageProps> = ({ onEdit, onNew }) => {
    const [articles, setArticles] = useState<Article[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchArticles = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const data = await getUserArticles();
            setArticles(data);
        } catch (err: any) {
            setError(err.message || 'Failed to fetch your articles.');
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchArticles();
    }, [fetchArticles]);

    const handleDelete = async (articleId: string) => {
        if (!window.confirm('Are you sure you want to permanently delete this article? This action cannot be undone.')) {
            return;
        }
        try {
            await deleteArticle(articleId);
            setArticles(prev => prev.filter(a => a.id !== articleId));
        } catch (err: any) {
            setError(err.message || 'Failed to delete the article.');
        }
    };
    
    const renderContent = () => {
        if (isLoading) {
            return (
                <div className="text-center py-16">
                    <LoadingSpinner />
                </div>
            );
        }

        if (error) {
            return <div className="text-red-400 p-4 bg-red-900/50 rounded-md text-center">{error}</div>;
        }

        if (articles.length === 0) {
            return (
                <div className="text-center py-16 px-6 border-2 border-dashed border-border-color rounded-xl">
                    <h3 className="text-xl font-semibold text-text-primary">No Articles Found</h3>
                    <p className="text-text-secondary mt-2">You haven't generated any articles yet. Let's create your first one!</p>
                    <Link to="/generator" onClick={onNew} className="cta-button mt-6 inline-block">
                        Create New Article
                    </Link>
                </div>
            );
        }

        const statusStyles: { [key in ArticleStatus]: string } = {
            Draft: 'bg-gray-700 text-gray-300',
            'Awaiting Admin Review': 'bg-yellow-800 text-yellow-200',
            'Published to WP Draft': 'bg-blue-800 text-blue-200',
            Published: 'bg-green-800 text-green-200',
            Rejected: 'bg-red-800 text-red-200',
        };

        return (
            <div className="space-y-4">
                {articles.map(article => (
                    <div key={article.id} className="p-4 bg-background/50 rounded-lg border border-border-color flex flex-col sm:flex-row justify-between sm:items-center gap-4 hover:border-accent/50 transition-colors">
                        <div className="w-full text-left">
                            <h4 className="font-bold text-lg text-text-primary">{article.title}</h4>
                            <div className="text-xs text-text-secondary mt-1 flex items-center flex-wrap gap-x-4 gap-y-1">
                                <span>
                                    Status: 
                                    <span className={`ml-1 font-semibold px-2 py-0.5 rounded-full ${statusStyles[article.status]}`}>
                                        {article.status}
                                    </span>
                                </span>
                                <span>Created: {new Date(article.created_at).toLocaleDateString()}</span>
                            </div>
                        </div>
                        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto flex-shrink-0">
                            <button onClick={() => onEdit(article)} className="secondary-button !text-sm !px-4 !py-2 w-full sm:w-auto text-center">
                                {article.status === 'Draft' ? 'Edit Draft' : 'View'}
                            </button>
                            <button onClick={() => handleDelete(article.id)} className="secondary-button !text-sm !px-4 !py-2 w-full sm:w-auto !border-red-500/50 !text-red-400 hover:!bg-red-500/10 hover:!border-red-500">Delete</button>
                        </div>
                    </div>
                ))}
            </div>
        );
    };

    return (
        <>
            <Meta 
                title="My Articles"
                description="View, manage, and edit all the articles you have generated with Postgenius Pro."
            />
            <div className="max-w-4xl mx-auto p-4 sm:p-8 bg-card-bg rounded-xl shadow-2xl border border-border-color animate-fade-in">
                <div className="flex flex-col sm:flex-row justify-between items-center mb-6 gap-4">
                    <h2 className="text-4xl font-black text-text-headings">My <span className="chameleon-text">Articles</span></h2>
                    <Link to="/generator" onClick={onNew} className="cta-button w-full sm:w-auto">
                        + New Article
                    </Link>
                </div>
                {renderContent()}
            </div>
        </>
    );
};

export default MyArticlesPage;