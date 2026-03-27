/**
 * Web Search Service
 * Provides functionality to search the web for existing articles on a topic
 * to help avoid duplicate content during article generation
 */

import type { Blueprint } from '../types';

export interface SearchResult {
    title: string;
    url: string;
    snippet: string;
}

/**
 * Search the web for existing articles on a given topic
 * @param topic - The topic or keyword to search for
 * @param blueprint - The blueprint type (recipe, roundup, review, howto)
 * @returns Array of search results with title, URL, and snippet
 */
export const searchRelatedArticles = async (
    topic: string,
    blueprint: Blueprint
): Promise<SearchResult[]> => {
    try {
        let searchQuery = topic;

        // Only append blueprint keywords if it's NOT an ASIN search
        // ASIN searches should be pure to find the product page first
        const hasAsin = topic.includes('ASIN') || /B[0-9A-Z]{9}/.test(topic);

        if (!hasAsin) {
            const blueprintKeywords: Record<Blueprint, string> = {
                'recipe': 'recipe how to make',
                'roundup': 'article guide tutorial',
                'review': 'amazon comparison review',
                'howto': 'how to guide tutorial'
            };
            searchQuery = `${blueprintKeywords[blueprint]} ${topic}`;
        }

        console.log(`[Web Search] Searching for: "${searchQuery}"`);

        const searchResults = await performWebSearch(searchQuery);

        console.log(`[Web Search] Found ${searchResults.length} results`);

        return searchResults.slice(0, 10); // Return top 10 results
    } catch (error) {
        console.error('[Web Search] Search failed:', error);
        // Return empty array on failure - article generation will continue without search results
        return [];
    }
};

// Helper for proxy URL (duplicated from freeImageService to avoid circular deps or complex refactor)
const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const CORS_PROXY_URL = isLocal
    ? "http://localhost:5000/api/proxy?url="
    : "/api/proxy.php?url=";

/**
 * Perform the actual web search using DuckDuckGo Html (Free, No-API)
 */
const performWebSearch = async (query: string): Promise<SearchResult[]> => {
    try {
        // Use the HTML version of DuckDuckGo via our proxy
        const targetUrl = `https://html.duckduckgo.com/html?q=${encodeURIComponent(query)}`;
        const proxyUrl = `${CORS_PROXY_URL}${encodeURIComponent(targetUrl)}`;

        const response = await fetch(proxyUrl);

        if (!response.ok) {
            console.warn(`[Web Search] Proxy request failed: ${response.status} ${response.statusText}`);
            return [];
        }

        const htmlText = await response.text();

        // Parse HTML
        const parser = new DOMParser();
        const doc = parser.parseFromString(htmlText, 'text/html');

        const results: SearchResult[] = [];
        const resultNodes = doc.querySelectorAll('.result');

        resultNodes.forEach((node) => {
            const titleNode = node.querySelector('.result__a');
            const snippetNode = node.querySelector('.result__snippet');
            const urlNode = node.querySelector('.result__url');

            if (titleNode && snippetNode) {
                const title = titleNode.textContent?.trim() || 'Untitled';
                const snippet = snippetNode.textContent?.trim() || '';
                // The logical URL is often in the href of result__a, but DDG wraps it. 
                // .result__url usually has the display URL. 
                // Best to try extraction from result__a href (uddg param)
                let url = '';
                const href = titleNode.getAttribute('href');
                if (href && href.includes('uddg=')) {
                    const match = href.match(/uddg=([^&]+)/);
                    if (match && match[1]) url = decodeURIComponent(match[1]);
                } else if (href) {
                    url = href;
                }

                if (url && !url.includes('duckduckgo.com')) {
                    results.push({ title, url, snippet });
                }
            }
        });

        if (results.length === 0) {
            console.log('[Web Search] No results found via DuckDuckGo');
        }

        return results;

    } catch (error) {
        console.error('[Web Search] Search failed:', error);
        return [];
    }
};

/**
 * Format search results for inclusion in the AI prompt
 * @param results - Array of search results
 * @returns Formatted string for AI prompt
 */
export const formatSearchResultsForPrompt = (results: SearchResult[]): string => {
    if (!results || results.length === 0) {
        return 'No existing articles found on this topic.';
    }

    const formatted = results.map((result, index) => {
        return `${index + 1}. "${result.title}"
   URL: ${result.url}
   Summary: ${result.snippet}`;
    }).join('\n\n');

    return `The following ${results.length} articles already exist on similar topics:\n\n${formatted}`;
};

/**
 * Extract the main topic/keyword from user input
 * @param input - User input (string or extracted data)
 * @returns Clean topic string for searching
 */
export const extractTopicForSearch = (input: any): string => {
    if (typeof input === 'string') {
        // Check for ASIN pattern (B followed by 9 alphanumeric characters)
        const asinMatch = input.match(/\b(B[0-9A-Z]{9})\b/);
        if (asinMatch) {
            // CRITICAL: Return a specific search query for the ASIN
            // We want to find the Amazon listing or reviews to get the real product name
            return `${asinMatch[1]} amazon product`;
        }

        // If it's a URL or long text, extract key terms
        if (input.length > 100 || input.includes('http')) {
            // Extract first few meaningful words
            const words = input.split(/\s+/).filter(w => w.length > 3 && !w.startsWith('http'));
            return words.slice(0, 5).join(' ');
        }
        return input;
    } else if (input && input.title) {
        // CRITICAL FIX: If the title is the generic fallback "Amazon Product (ASIN: ...)", 
        // extract the ASIN and search for that to find the real product name via web search.
        const asinMatchInTitle = input.title.match(/ASIN:?\s*(B[0-9A-Z]{9})/i);
        if (asinMatchInTitle) {
            return `${asinMatchInTitle[1]} amazon product`;
        }
        return input.title;
    } else if (input && input.productName) {
        return input.productName;
    }

    return 'general topic';
};
