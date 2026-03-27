import React, { useState, useEffect, useCallback, useMemo } from 'react';
import type { Article, BlogPostData, ArticleStatus, Blueprint } from '../types';
import { getAllArticles, deleteArticle } from '../services/articleService';
import {
    cancelContentJob,
    createContentJob,
    getAutomationState,
    retryContentJob,
    runAutomationWorkerNow,
    setAutomationAutoTrigger,
    setAutomationGenerateEndpoint,
    setAutomationNiches,
    type AutomationState,
    type ContentInputType,
} from '../services/automationWorkflowService';
import LoadingSpinner from './LoadingSpinner';
import NVIDIAProductImageGenerator from './NVIDIAProductImageGenerator';

interface AdminDashboardProps {
    userRole: 'admin' | 'user';
    onEdit: (article: Article) => void;
    onNew: () => void;
}

const DEFAULT_NICHES = ['amazon-master', 'kitchen', 'electronics', 'home'];

const blueprintIcons: { [key: string]: string } = {
    recipe: 'R',
    roundup: 'U',
    review: 'A',
    howto: 'H',
    default: 'P',
};

const formatDate = (value: string | null | undefined): string => {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleString();
};

const normalizeArticlesPayload = (payload: unknown): Article[] => {
    if (Array.isArray(payload)) {
        return payload.filter(Boolean) as Article[];
    }

    if (payload && typeof payload === 'object' && Array.isArray((payload as any).articles)) {
        return (payload as any).articles.filter(Boolean) as Article[];
    }

    return [];
};

const normalizeAutomationState = (payload: AutomationState | null | undefined): AutomationState | null => {
    if (!payload || typeof payload !== 'object') return null;

    const settings = payload.settings && typeof payload.settings === 'object'
        ? payload.settings
        : {
            autoTrigger: false,
            workerIntervalSeconds: 600,
            generateEndpoint: '',
            enabledNiches: {},
            lastWorkerRunAt: null,
            updatedAt: null,
        };

    const snapshot = payload.snapshot && typeof payload.snapshot === 'object'
        ? payload.snapshot
        : {
            counts: {},
            jobs: [],
            events: [],
        };

    return {
        settings: {
            autoTrigger: Boolean(settings.autoTrigger),
            workerIntervalSeconds: Number.isFinite(Number(settings.workerIntervalSeconds))
                ? Number(settings.workerIntervalSeconds)
                : 600,
            generateEndpoint: typeof settings.generateEndpoint === 'string' ? settings.generateEndpoint : '',
            enabledNiches: settings.enabledNiches && typeof settings.enabledNiches === 'object'
                ? settings.enabledNiches
                : {},
            lastWorkerRunAt: settings.lastWorkerRunAt ?? null,
            updatedAt: settings.updatedAt ?? null,
        },
        snapshot: {
            counts: snapshot.counts && typeof snapshot.counts === 'object' ? snapshot.counts : {},
            jobs: Array.isArray(snapshot.jobs) ? snapshot.jobs : [],
            events: Array.isArray(snapshot.events) ? snapshot.events : [],
        },
    };
};

const getJobStatusClass = (status: string): string => {
    switch (status) {
        case 'queued':
            return 'bg-yellow-500/10 text-yellow-300 border border-yellow-500/30';
        case 'processing':
            return 'bg-blue-500/10 text-blue-300 border border-blue-500/30';
        case 'completed':
            return 'bg-green-500/10 text-green-300 border border-green-500/30';
        case 'failed':
            return 'bg-red-500/10 text-red-300 border border-red-500/30';
        case 'cancelled':
            return 'bg-white/5 text-text-secondary border border-white/10';
        default:
            return 'bg-white/5 text-text-secondary border border-white/10';
    }
};

const ArticleRow: React.FC<{ article: Article; onEdit: (article: Article) => void; handleDelete: (articleId: string) => void }> = ({
    article,
    onEdit,
    handleDelete,
}) => {
    const { blueprint, parsedTitle } = useMemo(() => {
        try {
            const content: BlogPostData = JSON.parse(article.content);
            const blueprintKey = content.niche === 'food' ? 'recipe' : content.niche;
            return {
                blueprint: blueprintKey || 'default',
                parsedTitle: content.title || article.title,
            };
        } catch {
            return {
                blueprint: 'default',
                parsedTitle: article.title,
            };
        }
    }, [article.content, article.title]);

    const icon = blueprintIcons[blueprint] || blueprintIcons.default;

    const statusStyles: { [key in ArticleStatus]: string } = {
        Draft: 'bg-gray-700 text-gray-300',
        'Awaiting Admin Review': 'bg-yellow-800 text-yellow-200 animate-pulse',
        'Published to WP Draft': 'bg-blue-800 text-blue-200',
        Published: 'bg-green-800 text-green-200',
        Rejected: 'bg-red-800 text-red-200',
    };

    return (
        <div className="p-4 bg-background/50 rounded-lg border border-border-color flex flex-col md:flex-row md:items-center md:justify-between gap-4 hover:border-accent/50 transition-colors">
            <div className="flex items-center gap-4 flex-grow min-w-0">
                <div className="text-sm font-black w-8 h-8 rounded-full bg-accent/10 border border-accent/25 text-accent grid place-items-center" title={blueprint}>
                    {icon}
                </div>
                <p className="font-medium text-text-primary truncate">{parsedTitle}</p>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between md:justify-end gap-4 flex-shrink-0 border-t border-border-color md:border-t-0 pt-4 md:pt-0">
                <div className="flex items-center justify-between sm:justify-start gap-4 text-sm w-full sm:w-auto">
                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${statusStyles[article.status]}`}>
                        {article.status}
                    </span>
                    <span className="text-text-secondary text-right">{new Date(article.created_at).toLocaleDateString()}</span>
                </div>
                <div className="flex gap-2 w-full sm:w-auto">
                    <button onClick={() => onEdit(article)} className="flex-1 sm:flex-none secondary-button !text-sm !px-4 !py-2 text-center">
                        {article.status === 'Awaiting Admin Review' ? 'Review & Publish' : 'View / Edit'}
                    </button>
                    <button
                        onClick={() => handleDelete(article.id)}
                        className="flex-1 sm:flex-none secondary-button !text-sm !px-4 !py-2 !border-red-500/50 !text-red-400 hover:!bg-red-500/10 hover:!border-red-500"
                    >
                        Delete
                    </button>
                </div>
            </div>
        </div>
    );
};

const AdminDashboard: React.FC<AdminDashboardProps> = ({ userRole, onEdit, onNew }) => {
    const [articles, setArticles] = useState<Article[]>([]);
    const [activeTab, setActiveTab] = useState<'articles' | 'automation' | 'nvidia'>('articles');
    const [isLoading, setIsLoading] = useState(true);
    const [dashboardError, setDashboardError] = useState<string | null>(null);
    const [filter, setFilter] = useState<'all' | 'Awaiting Admin Review'>('Awaiting Admin Review');

    const [automationState, setAutomationState] = useState<AutomationState | null>(null);
    const [automationLoading, setAutomationLoading] = useState(false);
    const [automationBusy, setAutomationBusy] = useState(false);
    const [automationNotice, setAutomationNotice] = useState<string | null>(null);
    const [jobInputType, setJobInputType] = useState<ContentInputType>('asin');
    const [jobInputValue, setJobInputValue] = useState('');
    const [jobBlueprint] = useState<Blueprint>('review');
    const [jobNicheTag, setJobNicheTag] = useState('amazon-master');
    const [jobPriority, setJobPriority] = useState(100);
    const [generatorEndpoint, setGeneratorEndpoint] = useState('');

    const fetchArticles = useCallback(async () => {
        setIsLoading(true);
        setDashboardError(null);
        try {
            const data = await getAllArticles();
            const normalizedArticles = normalizeArticlesPayload(data);
            if (!Array.isArray(data) && !(data && typeof data === 'object' && Array.isArray((data as any).articles))) {
                console.warn('[AdminDashboard] Unexpected articles payload shape:', data);
            }
            setArticles(normalizedArticles);
        } catch (err: any) {
            setDashboardError(err.message || 'Failed to fetch articles.');
            setArticles([]);
        } finally {
            setIsLoading(false);
        }
    }, []);

    const fetchAutomation = useCallback(async () => {
        setAutomationLoading(true);
        setDashboardError(null);
        try {
            const state = await getAutomationState();
            const normalizedState = normalizeAutomationState(state);
            setAutomationState(normalizedState);
            setGeneratorEndpoint(normalizedState?.settings.generateEndpoint || '');
        } catch (err: any) {
            setDashboardError(err.message || 'Failed to fetch automation queue.');
            setAutomationState(null);
        } finally {
            setAutomationLoading(false);
        }
    }, []);

    const applyAutomationState = useCallback((state: AutomationState) => {
        const normalizedState = normalizeAutomationState(state);
        setAutomationState(normalizedState);
        setGeneratorEndpoint(normalizedState?.settings.generateEndpoint || '');
    }, []);

    const runAutomationMutation = useCallback(
        async (runner: () => Promise<AutomationState>) => {
            setAutomationBusy(true);
            setDashboardError(null);
            setAutomationNotice(null);
            try {
                const state = await runner();
                applyAutomationState(state);
            } catch (err: any) {
                setDashboardError(err.message || 'Automation update failed.');
            } finally {
                setAutomationBusy(false);
            }
        },
        [applyAutomationState]
    );

    useEffect(() => {
        if (userRole === 'admin') {
            if (activeTab === 'articles') fetchArticles();
            else if (activeTab === 'automation') fetchAutomation();
        }
    }, [userRole, activeTab, fetchArticles, fetchAutomation]);

    const handleDeleteArticleLocal = async (articleId: string) => {
        if (!window.confirm('Delete article?')) return;
        try {
            await deleteArticle(articleId);
            setArticles((prev) => prev.filter((a) => a.id !== articleId));
        } catch (err: any) {
            alert(`Error: ${err.message}`);
        }
    };

    const handleQueueJob = async () => {
        const trimmedValue = jobInputValue.trim();
        if (!trimmedValue) {
            setDashboardError('Input value is required.');
            return;
        }

        await runAutomationMutation(() =>
            createContentJob({
                inputType: jobInputType,
                inputValue: trimmedValue,
                blueprintType: jobBlueprint,
                nicheTag: jobNicheTag.trim() || undefined,
                priority: Number.isFinite(jobPriority) ? Math.max(1, Math.min(999, Math.round(jobPriority))) : 100,
            })
        );
        setJobInputValue('');
        setAutomationNotice('Job queued successfully.');
    };

    const handleToggleAutoTrigger = async () => {
        const enabled = !(automationState?.settings.autoTrigger ?? false);
        await runAutomationMutation(() => setAutomationAutoTrigger(enabled));
        setAutomationNotice(enabled ? 'Auto-trigger enabled.' : 'Auto-trigger disabled.');
    };

    const handleSaveEndpoint = async () => {
        const endpoint = generatorEndpoint.trim();
        await runAutomationMutation(() => setAutomationGenerateEndpoint(endpoint));
        setAutomationNotice(endpoint ? 'Generator endpoint saved.' : 'Generator endpoint cleared.');
    };

    const handleToggleNiche = async (nicheKey: string) => {
        const current = automationState?.settings.enabledNiches || {};
        const next = { ...current, [nicheKey]: !current[nicheKey] };
        await runAutomationMutation(() => setAutomationNiches(next));
        setAutomationNotice(`${nicheKey} automation updated.`);
    };

    const handleRunWorkerNow = async () => {
        setAutomationBusy(true);
        setDashboardError(null);
        setAutomationNotice(null);
        try {
            const data = await runAutomationWorkerNow();
            applyAutomationState({ settings: data.settings, snapshot: data.snapshot });

            const workerStatus = String(data.worker?.status || 'completed');
            const workerMessage = String(data.worker?.message || '');
            if (workerStatus === 'completed') {
                setAutomationNotice(`Worker run complete. Job #${data.worker?.jobId || '-'} finished.`);
            } else if (workerStatus === 'empty') {
                setAutomationNotice('Worker run complete. Queue is empty.');
            } else if (workerStatus === 'idle') {
                setAutomationNotice('Worker is idle (auto-trigger disabled).');
            } else if (workerMessage) {
                setAutomationNotice(workerMessage);
            } else {
                setAutomationNotice(`Worker status: ${workerStatus}`);
            }
        } catch (err: any) {
            setDashboardError(err.message || 'Worker run failed.');
        } finally {
            setAutomationBusy(false);
        }
    };

    const handleCancelJob = async (jobId: number) => {
        if (!window.confirm(`Cancel job #${jobId}?`)) return;
        await runAutomationMutation(() => cancelContentJob(jobId));
        setAutomationNotice(`Job #${jobId} cancelled.`);
    };

    const handleRetryJob = async (jobId: number) => {
        await runAutomationMutation(() => retryContentJob(jobId));
        setAutomationNotice(`Job #${jobId} re-queued.`);
    };

    const articleList = useMemo(() => normalizeArticlesPayload(articles), [articles]);

    const filteredArticles = useMemo(() => {
        if (filter === 'all') return articleList;
        return articleList.filter((a) => a.status === filter);
    }, [articleList, filter]);

    const automationCounts = automationState?.snapshot.counts || {};
    const queuedCount = Number(automationCounts.queued || 0);
    const processingCount = Number(automationCounts.processing || 0);
    const completedCount = Number(automationCounts.completed || 0);
    const failedCount = Number(automationCounts.failed || 0);
    const cancelledCount = Number(automationCounts.cancelled || 0);
    const enabledNiches = automationState?.settings.enabledNiches || {};
    const nicheKeys = Array.from(new Set([...DEFAULT_NICHES, ...Object.keys(enabledNiches)]));
    const jobs = Array.isArray(automationState?.snapshot.jobs) ? automationState!.snapshot.jobs : [];
    const events = Array.isArray(automationState?.snapshot.events) ? automationState!.snapshot.events : [];

    return (
        <div className="p-4 sm:p-8 bg-card-bg rounded-xl shadow-2xl border border-border-color">
            <div className="flex flex-col sm:flex-row justify-between items-start mb-8 gap-4 border-b border-border-color pb-6">
                <div>
                    <h2 className="text-3xl font-black text-text-headings tracking-tighter">
                        Admin <span className="text-accent">Console</span>
                    </h2>
                    <p className="text-text-secondary text-sm mt-1 uppercase tracking-widest font-bold opacity-50">PostGenius Pro v3.16 Management</p>
                </div>

                <div className="flex flex-wrap bg-background/50 p-1 rounded-xl border border-border-color w-full sm:w-auto shadow-inner">
                    <button
                        onClick={() => setActiveTab('articles')}
                        className={`px-4 py-2 text-xs font-black uppercase tracking-widest rounded-lg transition-all ${
                            activeTab === 'articles' ? 'bg-accent text-white shadow-lg' : 'text-text-secondary hover:text-white'
                        }`}
                    >
                        Articles
                    </button>
                    <button
                        onClick={() => setActiveTab('automation')}
                        className={`px-4 py-2 text-xs font-black uppercase tracking-widest rounded-lg transition-all ${
                            activeTab === 'automation' ? 'bg-accent text-white shadow-lg' : 'text-text-secondary hover:text-white'
                        }`}
                    >
                        Automation
                    </button>
                    <button
                        onClick={() => setActiveTab('nvidia')}
                        className={`px-4 py-2 text-xs font-black uppercase tracking-widest rounded-lg transition-all ${
                            activeTab === 'nvidia' ? 'bg-accent text-white shadow-lg' : 'text-text-secondary hover:text-white'
                        }`}
                    >
                        NVIDIA AI
                    </button>
                </div>
            </div>

            {dashboardError && (
                <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-6 py-4 rounded-xl mb-6 flex items-center gap-3">
                    <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
                    <span className="font-medium text-sm">{dashboardError}</span>
                </div>
            )}

            {activeTab === 'articles' ? (
                <div className="space-y-6">
                    <div className="flex flex-col sm:flex-row justify-between items-center gap-4 bg-background/30 p-4 rounded-2xl border border-border-color/50">
                        <div className="flex gap-2 p-1 bg-black/20 rounded-lg">
                            <button
                                onClick={() => setFilter('Awaiting Admin Review')}
                                className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all ${
                                    filter === 'Awaiting Admin Review' ? 'bg-white/10 text-white' : 'text-text-secondary hover:text-white'
                                }`}
                            >
                                Queue ({articleList.filter((a) => a.status === 'Awaiting Admin Review').length})
                            </button>
                            <button
                                onClick={() => setFilter('all')}
                                className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all ${
                                    filter === 'all' ? 'bg-white/10 text-white' : 'text-text-secondary hover:text-white'
                                }`}
                            >
                                All Articles
                            </button>
                        </div>
                        <div className="flex items-center gap-3">
                            <button
                                onClick={onNew}
                                className="bg-accent hover:brightness-110 text-white font-black px-4 py-2 rounded-lg uppercase text-xs tracking-widest shadow-lg shadow-accent/20"
                            >
                                + New Article
                            </button>
                            <button onClick={fetchArticles} className="text-xs font-black text-accent uppercase tracking-widest hover:brightness-125 transition-all">
                                Refresh Database
                            </button>
                        </div>
                    </div>

                    {isLoading ? (
                        <div className="flex justify-center items-center py-20">
                            <LoadingSpinner />
                        </div>
                    ) : (
                        <div className="grid gap-4">
                            {filteredArticles.length > 0 ? (
                                filteredArticles.map((article) => (
                                    <ArticleRow key={article.id} article={article} onEdit={onEdit} handleDelete={handleDeleteArticleLocal} />
                                ))
                            ) : (
                                <div className="text-center py-20 bg-background/20 rounded-3xl border border-dashed border-border-color opacity-50">
                                    <p className="text-sm font-bold uppercase tracking-widest">No articles found in this segment</p>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            ) : activeTab === 'automation' ? (
                <div className="space-y-6">
                    {automationNotice && <div className="bg-accent/10 border border-accent/30 text-accent px-4 py-3 rounded-xl text-sm">{automationNotice}</div>}

                    {automationLoading ? (
                        <div className="flex justify-center items-center py-20">
                            <LoadingSpinner />
                        </div>
                    ) : !automationState ? (
                        <div className="bg-background/30 border border-border-color rounded-2xl p-6">
                            <p className="text-text-secondary text-sm mb-3">Automation snapshot is unavailable.</p>
                            <button
                                onClick={fetchAutomation}
                                className="bg-accent hover:brightness-110 text-white font-black px-4 py-2 rounded-lg uppercase text-xs tracking-widest"
                            >
                                Retry
                            </button>
                        </div>
                    ) : (
                        <>
                            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                                <div className="p-4 rounded-xl border border-yellow-500/20 bg-yellow-500/5">
                                    <p className="text-[10px] uppercase tracking-widest text-text-secondary">Queued</p>
                                    <p className="text-2xl font-black text-yellow-300">{queuedCount}</p>
                                </div>
                                <div className="p-4 rounded-xl border border-blue-500/20 bg-blue-500/5">
                                    <p className="text-[10px] uppercase tracking-widest text-text-secondary">Processing</p>
                                    <p className="text-2xl font-black text-blue-300">{processingCount}</p>
                                </div>
                                <div className="p-4 rounded-xl border border-green-500/20 bg-green-500/5">
                                    <p className="text-[10px] uppercase tracking-widest text-text-secondary">Completed</p>
                                    <p className="text-2xl font-black text-green-300">{completedCount}</p>
                                </div>
                                <div className="p-4 rounded-xl border border-red-500/20 bg-red-500/5">
                                    <p className="text-[10px] uppercase tracking-widest text-text-secondary">Failed</p>
                                    <p className="text-2xl font-black text-red-300">{failedCount}</p>
                                </div>
                                <div className="p-4 rounded-xl border border-white/10 bg-white/5">
                                    <p className="text-[10px] uppercase tracking-widest text-text-secondary">Cancelled</p>
                                    <p className="text-2xl font-black text-text-primary">{cancelledCount}</p>
                                </div>
                            </div>

                            <div className="grid lg:grid-cols-2 gap-6">
                                <div className="bg-background/30 border border-border-color rounded-2xl p-5 space-y-4">
                                    <div className="flex items-center justify-between">
                                        <h3 className="text-lg font-black text-text-headings">Production Line</h3>
                                        <span
                                            className={`px-3 py-1 rounded-full text-[10px] uppercase tracking-widest font-black ${
                                                automationState.settings.autoTrigger
                                                    ? 'bg-green-500/10 text-green-300 border border-green-500/30'
                                                    : 'bg-white/5 text-text-secondary border border-white/10'
                                            }`}
                                        >
                                            Auto {automationState.settings.autoTrigger ? 'ON' : 'OFF'}
                                        </span>
                                    </div>

                                    <div className="grid sm:grid-cols-2 gap-3">
                                        <div>
                                            <label className="block text-[10px] uppercase tracking-widest text-text-secondary mb-1">Input Type</label>
                                            <select
                                                value={jobInputType}
                                                onChange={(e) => setJobInputType(e.target.value as ContentInputType)}
                                                className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm"
                                            >
                                                <option value="asin">ASIN</option>
                                                <option value="keyword">Keyword</option>
                                                <option value="url">URL</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-[10px] uppercase tracking-widest text-text-secondary mb-1">Blueprint</label>
                                            <div className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-text-primary">
                                                Amazon Multi-ASIN Master
                                            </div>
                                        </div>
                                    </div>

                                    <p className="text-xs text-text-secondary leading-relaxed">
                                        Automation is locked to the <span className="text-accent font-bold">Amazon Multi-ASIN Master</span> workflow only.
                                        Recipe, URL Replicator, and How-To blueprints stay manual and untouched.
                                    </p>

                                    <div>
                                        <label className="block text-[10px] uppercase tracking-widest text-text-secondary mb-1">Input Feed</label>
                                        <textarea
                                            value={jobInputValue}
                                            onChange={(e) => setJobInputValue(e.target.value)}
                                            rows={3}
                                            placeholder="Example: B0CGQP8K2T, B0D5FX6VRL, B0C9X57D5R"
                                            className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm resize-y"
                                        />
                                    </div>

                                    <div className="grid sm:grid-cols-2 gap-3">
                                        <div>
                                            <label className="block text-[10px] uppercase tracking-widest text-text-secondary mb-1">Niche Tag</label>
                                            <input
                                                value={jobNicheTag}
                                                onChange={(e) => setJobNicheTag(e.target.value)}
                                                className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-[10px] uppercase tracking-widest text-text-secondary mb-1">Priority (1-999)</label>
                                            <input
                                                type="number"
                                                min={1}
                                                max={999}
                                                value={jobPriority}
                                                onChange={(e) => setJobPriority(Number(e.target.value))}
                                                className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm"
                                            />
                                        </div>
                                    </div>

                                    <div className="flex flex-wrap gap-2">
                                        <button
                                            onClick={handleQueueJob}
                                            disabled={automationBusy}
                                            className="bg-accent hover:brightness-110 text-white font-black px-4 py-2 rounded-lg uppercase text-xs tracking-widest disabled:opacity-50"
                                        >
                                            Queue Job
                                        </button>
                                        <button
                                            onClick={handleToggleAutoTrigger}
                                            disabled={automationBusy}
                                            className="bg-white/5 hover:bg-white/10 border border-white/10 text-text-primary font-black px-4 py-2 rounded-lg uppercase text-xs tracking-widest disabled:opacity-50"
                                        >
                                            Auto Trigger: {automationState.settings.autoTrigger ? 'Disable' : 'Enable'}
                                        </button>
                                        <button
                                            onClick={handleRunWorkerNow}
                                            disabled={automationBusy}
                                            className="bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/30 text-blue-200 font-black px-4 py-2 rounded-lg uppercase text-xs tracking-widest disabled:opacity-50"
                                        >
                                            Run Next Now
                                        </button>
                                    </div>
                                </div>

                                <div className="bg-background/30 border border-border-color rounded-2xl p-5 space-y-4">
                                    <h3 className="text-lg font-black text-text-headings">Factory Settings</h3>
                                    <div>
                                        <label className="block text-[10px] uppercase tracking-widest text-text-secondary mb-1">Generator Endpoint</label>
                                        <input
                                            value={generatorEndpoint}
                                            onChange={(e) => setGeneratorEndpoint(e.target.value)}
                                            placeholder="https://postgeniuspro.com/api/your-generate-endpoint"
                                            className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm"
                                        />
                                        <p className="mt-1 text-xs text-text-secondary">
                                            Worker forwards queued payloads to this endpoint using the current generation engine.
                                        </p>
                                    </div>
                                    <button
                                        onClick={handleSaveEndpoint}
                                        disabled={automationBusy}
                                        className="bg-accent hover:brightness-110 text-white font-black px-4 py-2 rounded-lg uppercase text-xs tracking-widest disabled:opacity-50"
                                    >
                                        Save Endpoint
                                    </button>

                                    <div>
                                        <p className="text-[10px] uppercase tracking-widest text-text-secondary mb-2">Automation Niches</p>
                                        <div className="flex flex-wrap gap-2">
                                            {nicheKeys.map((niche) => {
                                                const enabled = !!enabledNiches[niche];
                                                return (
                                                    <button
                                                        key={niche}
                                                        onClick={() => handleToggleNiche(niche)}
                                                        disabled={automationBusy}
                                                        className={`px-3 py-1.5 rounded-full text-[11px] uppercase tracking-widest font-black border transition-all disabled:opacity-50 ${
                                                            enabled
                                                                ? 'bg-green-500/15 border-green-500/35 text-green-300'
                                                                : 'bg-white/5 border-white/10 text-text-secondary hover:text-text-primary'
                                                        }`}
                                                    >
                                                        {niche} {enabled ? 'ON' : 'OFF'}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    <div className="border-t border-white/10 pt-3 text-xs text-text-secondary space-y-1">
                                        <p>Worker interval: {automationState.settings.workerIntervalSeconds}s</p>
                                        <p>Last worker run: {formatDate(automationState.settings.lastWorkerRunAt)}</p>
                                        <p>Last settings update: {formatDate(automationState.settings.updatedAt)}</p>
                                    </div>
                                </div>
                            </div>

                            <div className="grid xl:grid-cols-3 gap-6">
                                <div className="xl:col-span-2 bg-background/30 border border-border-color rounded-2xl p-5">
                                    <div className="flex items-center justify-between mb-4">
                                        <h3 className="text-lg font-black text-text-headings">Queue</h3>
                                        <button
                                            onClick={fetchAutomation}
                                            disabled={automationBusy}
                                            className="text-xs uppercase tracking-widest font-black text-accent disabled:opacity-50"
                                        >
                                            Refresh
                                        </button>
                                    </div>
                                    <div className="space-y-3 max-h-[540px] overflow-auto pr-1">
                                        {jobs.length === 0 ? (
                                            <div className="text-sm text-text-secondary border border-dashed border-border-color rounded-xl p-6 text-center">
                                                Queue is empty.
                                            </div>
                                        ) : (
                                            jobs.map((job) => (
                                                <div key={job.id} className="rounded-xl border border-white/10 bg-black/20 p-4">
                                                    <div className="flex flex-wrap gap-2 items-center justify-between">
                                                        <div className="flex flex-wrap items-center gap-2">
                                                            <span className="text-sm font-black text-text-primary">#{job.id}</span>
                                                            <span className={`px-2 py-1 rounded-full text-[10px] uppercase tracking-widest font-black ${getJobStatusClass(job.status)}`}>
                                                                {job.status}
                                                            </span>
                                                            <span className="px-2 py-1 rounded-full text-[10px] uppercase tracking-widest font-black bg-white/5 border border-white/10 text-text-secondary">
                                                                {job.blueprintType}
                                                            </span>
                                                            <span className="px-2 py-1 rounded-full text-[10px] uppercase tracking-widest font-black bg-white/5 border border-white/10 text-text-secondary">
                                                                {job.inputType}
                                                            </span>
                                                            {job.nicheTag && (
                                                                <span className="px-2 py-1 rounded-full text-[10px] uppercase tracking-widest font-black bg-accent/10 border border-accent/30 text-accent">
                                                                    {job.nicheTag}
                                                                </span>
                                                            )}
                                                        </div>
                                                        <div className="flex gap-2">
                                                            {(job.status === 'queued' || job.status === 'processing' || job.status === 'failed') && (
                                                                <button
                                                                    onClick={() => handleCancelJob(job.id)}
                                                                    disabled={automationBusy}
                                                                    className="px-3 py-1 rounded-md bg-red-500/10 border border-red-500/25 text-red-300 text-[10px] uppercase tracking-widest font-black disabled:opacity-50"
                                                                >
                                                                    Cancel
                                                                </button>
                                                            )}
                                                            {(job.status === 'failed' || job.status === 'cancelled') && (
                                                                <button
                                                                    onClick={() => handleRetryJob(job.id)}
                                                                    disabled={automationBusy}
                                                                    className="px-3 py-1 rounded-md bg-blue-500/10 border border-blue-500/25 text-blue-300 text-[10px] uppercase tracking-widest font-black disabled:opacity-50"
                                                                >
                                                                    Retry
                                                                </button>
                                                            )}
                                                        </div>
                                                    </div>

                                                    <p className="mt-2 text-sm text-text-primary break-all">{job.inputValue}</p>

                                                    <div className="mt-2 grid sm:grid-cols-4 gap-2 text-[11px] text-text-secondary">
                                                        <p>Priority: {job.priority}</p>
                                                        <p>
                                                            Attempts: {job.attemptCount}/{job.maxAttempts}
                                                        </p>
                                                        <p>Created: {formatDate(job.createdAt)}</p>
                                                        <p>Updated: {formatDate(job.updatedAt)}</p>
                                                    </div>

                                                    {job.errorMessage && <p className="mt-2 text-xs text-red-300">Error: {job.errorMessage}</p>}
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </div>

                                <div className="bg-background/30 border border-border-color rounded-2xl p-5">
                                    <h3 className="text-lg font-black text-text-headings mb-4">Success Feed</h3>
                                    <div className="space-y-3 max-h-[540px] overflow-auto pr-1">
                                        {events.length === 0 ? (
                                            <div className="text-sm text-text-secondary border border-dashed border-border-color rounded-xl p-6 text-center">
                                                No events yet.
                                            </div>
                                        ) : (
                                            events.map((event) => (
                                                <div key={event.id} className="rounded-xl border border-white/10 bg-black/20 p-3">
                                                    <div className="flex items-center justify-between gap-2">
                                                        <p className="text-[10px] uppercase tracking-widest text-accent font-black">{event.eventType}</p>
                                                        <p className="text-[10px] text-text-secondary">{formatDate(event.createdAt)}</p>
                                                    </div>
                                                    <p className="mt-1 text-sm text-text-primary">{event.message}</p>
                                                    {event.jobId ? <p className="mt-1 text-[11px] text-text-secondary">Job #{event.jobId}</p> : null}
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            ) : (
                <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <NVIDIAProductImageGenerator />
                </div>
            )}
        </div>
    );
};

export default AdminDashboard;
