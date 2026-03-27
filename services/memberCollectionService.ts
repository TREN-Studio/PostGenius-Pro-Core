import type { Article } from '../types';
import { api } from './apiClient';

export interface SavedReview {
    id: string;
    slug: string;
    title: string;
    imageUrl: string | null;
    savedAt: string;
}

export interface TrackedProduct {
    title: string;
    url: string;
    trackedAt: string;
}

const MEMBER_ENDPOINT = '/member_data.php';

const canUseStorage = (): boolean => typeof window !== 'undefined' && typeof localStorage !== 'undefined';

const normalizeUrl = (value: string): string => {
    const raw = String(value || '').trim();
    if (!raw) return '';
    try {
        const u = new URL(raw);
        u.hash = '';
        return u.toString();
    } catch {
        return raw;
    }
};

export const getCurrentUserId = (): string | null => {
    if (!canUseStorage()) return null;
    try {
        const raw = localStorage.getItem('user_data');
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        const id = String(parsed?.id || '').trim();
        return id || null;
    } catch {
        return null;
    }
};

const toSavedReviews = (value: any): SavedReview[] => {
    if (!Array.isArray(value)) return [];
    return value.map((item: any) => ({
        id: String(item?.id || item?.slug || ''),
        slug: String(item?.slug || ''),
        title: String(item?.title || 'Saved Review'),
        imageUrl: item?.imageUrl ? String(item.imageUrl) : null,
        savedAt: String(item?.savedAt || new Date().toISOString()),
    })).filter((item: SavedReview) => item.slug);
};

const toTrackedProducts = (value: any): TrackedProduct[] => {
    if (!Array.isArray(value)) return [];
    return value.map((item: any) => ({
        title: String(item?.title || 'Tracked Product'),
        url: String(item?.url || ''),
        trackedAt: String(item?.trackedAt || new Date().toISOString()),
    })).filter((item: TrackedProduct) => item.url);
};

export const getSavedReviews = async (_userId?: string | null): Promise<SavedReview[]> => {
    const response = await api.get(`${MEMBER_ENDPOINT}?action=get_saved_reviews`);
    return toSavedReviews(response?.savedReviews);
};

export const isReviewSaved = async (slug: string, userId?: string | null): Promise<boolean> => {
    const normalized = String(slug || '').trim();
    if (!normalized) return false;
    const saved = await getSavedReviews(userId);
    return saved.some(item => item.slug === normalized);
};

export const toggleSavedReview = async (
    article: Pick<Article, 'id' | 'slug' | 'title' | 'image_url'>,
    _userId?: string | null
): Promise<boolean> => {
    const slug = String(article?.slug || '').trim();
    if (!slug) return false;

    const response = await api.post(`${MEMBER_ENDPOINT}?action=toggle_saved_review`, {
        id: String(article.id || ''),
        article_id: String(article.id || ''),
        slug,
        title: String(article.title || 'Saved Review'),
        image_url: article.image_url || null,
    });

    return Boolean(response?.saved);
};

export const removeSavedReview = async (slug: string, _userId?: string | null): Promise<void> => {
    const normalized = String(slug || '').trim();
    if (!normalized) return;
    await api.post(`${MEMBER_ENDPOINT}?action=remove_saved_review`, { slug: normalized });
};

export const getTrackedProducts = async (_userId?: string | null): Promise<TrackedProduct[]> => {
    const response = await api.get(`${MEMBER_ENDPOINT}?action=get_tracked_products`);
    return toTrackedProducts(response?.trackedProducts);
};

export const isProductTracked = async (url: string, userId?: string | null): Promise<boolean> => {
    const normalized = normalizeUrl(url);
    if (!normalized) return false;
    const tracked = await getTrackedProducts(userId);
    return tracked.some(item => normalizeUrl(item.url) === normalized);
};

export const toggleTrackedProduct = async (
    product: { title: string; url: string },
    _userId?: string | null
): Promise<boolean> => {
    const normalizedUrl = normalizeUrl(product?.url || '');
    if (!normalizedUrl) return false;

    const response = await api.post(`${MEMBER_ENDPOINT}?action=toggle_tracked_product`, {
        title: String(product?.title || 'Tracked Product'),
        url: normalizedUrl,
    });

    return Boolean(response?.tracked);
};

export const getNewsletterSetting = async (_userId?: string | null): Promise<boolean> => {
    const response = await api.get(`${MEMBER_ENDPOINT}?action=get_newsletter`);
    return Boolean(response?.newsletterEnabled ?? true);
};

export const setNewsletterSetting = async (enabled: boolean, _userId?: string | null): Promise<void> => {
    await api.post(`${MEMBER_ENDPOINT}?action=set_newsletter`, {
        enabled: Boolean(enabled),
    });
};
