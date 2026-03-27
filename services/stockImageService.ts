import type { AiConfig } from '../types';

/**
 * Stock Image Service
 * Retrieves high-quality real images from Pexels, Unsplash, and Pixabay
 */

interface StockImageResult {
    url: string;
    photographer: string;
    photographerUrl: string;
    source: 'pexels' | 'unsplash' | 'pixabay';
}

const CORS_PROXY_URL = window.location.hostname === 'localhost'
    ? "http://localhost:5000/api/proxy?url="
    : "/api/proxy.php?url=";

const fetchWithProxy = async (url: string, headers: HeadersInit = {}): Promise<Response> => {
    // Some APIs require headers that might be stripped by simple proxies, 
    // but our PHP proxy forwards common auth headers or we can embed them in the URL if needed.
    // We will use our trusted proxy.

    // STRATEGY: Use the proxy and pass Authorization header.
    // The PHP proxy needs to support forwarding headers. If not, we might need a workaround.
    // Workaround: Use query param auth where possible.
    // Pixabay: Uses ?key=... (Safe)
    // Unsplash: Uses ?client_id=... (Safe)
    // Pexels: Requires Authorization header. This is the tricky one with a simple proxy.

    const targetUrl = encodeURIComponent(url);
    const proxyUrl = `${CORS_PROXY_URL}${targetUrl}`;

    // We must pass the headers to the PROXY, which acts as the client.
    return fetch(proxyUrl, {
        method: 'GET',
        headers: headers
    });
};

export const searchStockImages = async (
    query: string,
    config: AiConfig,
    limit: number = 3
): Promise<StockImageResult[]> => {
    const provider = config.stockImageProvider;

    if (!provider || provider === 'none') return [];

    console.log(`[StockImage] Searching ${provider} for: "${query}" (Limit: ${limit})`);

    try {
        switch (provider) {
            case 'pexels':
                return await searchPexels(query, config.pexelsApiKey, limit);
            case 'unsplash':
                return await searchUnsplash(query, config.unsplashApiKey, limit);
            case 'pixabay':
                return await searchPixabay(query, config.pixabayApiKey, limit);
            default:
                return [];
        }
    } catch (error) {
        console.error(`[StockImage] Failed to search ${provider}:`, error);
        return [];
    }
};

const searchPexels = async (query: string, apiKey?: string, limit: number = 3): Promise<StockImageResult[]> => {
    if (!apiKey) throw new Error('Pexels API key missing');

    const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=${limit}&orientation=landscape`;

    const response = await fetchWithProxy(url, {
        'Authorization': apiKey
    });

    if (!response.ok) return [];

    const data = await response.json();
    if (data.photos && data.photos.length > 0) {
        return data.photos.map((photo: any) => ({
            url: photo.src.large2x || photo.src.large, // High quality
            photographer: photo.photographer,
            photographerUrl: photo.photographer_url,
            source: 'pexels'
        }));
    }
    return [];
};

const searchUnsplash = async (query: string, apiKey?: string, limit: number = 3): Promise<StockImageResult[]> => {
    if (!apiKey) throw new Error('Unsplash API key missing');

    const url = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=${limit}&orientation=landscape&client_id=${apiKey}`;

    const response = await fetchWithProxy(url);

    if (!response.ok) return [];

    const data = await response.json();
    if (data.results && data.results.length > 0) {
        return data.results.map((photo: any) => ({
            url: photo.urls.regular,
            photographer: photo.user.name,
            photographerUrl: photo.user.links.html,
            source: 'unsplash'
        }));
    }
    return [];
};

const searchPixabay = async (query: string, apiKey?: string, limit: number = 3): Promise<StockImageResult[]> => {
    if (!apiKey) throw new Error('Pixabay API key missing');

    const url = `https://pixabay.com/api/?key=${apiKey}&q=${encodeURIComponent(query)}&image_type=photo&orientation=horizontal&safesearch=true&per_page=${limit}`;

    const response = await fetchWithProxy(url);

    if (!response.ok) return [];

    const data = await response.json();
    if (data.hits && data.hits.length > 0) {
        return data.hits.map((photo: any) => ({
            url: photo.largeImageURL || photo.webformatURL,
            photographer: photo.user,
            photographerUrl: `https://pixabay.com/users/${photo.user}-${photo.user_id}/`,
            source: 'pixabay'
        }));
    }
    return [];
};
