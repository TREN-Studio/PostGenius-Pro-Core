// Google Analytics Integration Service
// This service tracks real user events and can be connected to GA4 Realtime API

interface AnalyticsEvent {
    eventName: string;
    location?: {
        city: string;
        country: string;
        lat: number;
        lng: number;
    };
    timestamp: Date;
    topic?: string;
}

class AnalyticsService {
    private events: AnalyticsEvent[] = [];
    private listeners: ((event: AnalyticsEvent) => void)[] = [];

    // Track article generation event
    trackArticleGeneration(topic: string, location?: { city: string; country: string; lat: number; lng: number }) {
        const event: AnalyticsEvent = {
            eventName: 'article_generated',
            location,
            timestamp: new Date(),
            topic
        };

        this.events.push(event);
        this.notifyListeners(event);

        // Send to Google Analytics
        if (typeof window !== 'undefined' && (window as any).gtag) {
            (window as any).gtag('event', 'article_generated', {
                topic: topic,
                city: location?.city,
                country: location?.country
            });
        }
    }

    // Subscribe to new events
    subscribe(callback: (event: AnalyticsEvent) => void) {
        this.listeners.push(callback);
        return () => {
            this.listeners = this.listeners.filter(l => l !== callback);
        };
    }

    private notifyListeners(event: AnalyticsEvent) {
        this.listeners.forEach(listener => listener(event));
    }

    // Get recent events
    getRecentEvents(limit: number = 10): AnalyticsEvent[] {
        return this.events.slice(-limit);
    }

    // Get user's approximate location using IP geolocation
    async getUserLocation(): Promise<{ city: string; country: string; lat: number; lng: number } | null> {
        try {
            // Using ipapi.co for free IP geolocation
            // Using ipapi.co for free IP geolocation (via Proxy to avoid CORS)
            const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
            const proxyUrl = isLocal ? "http://localhost:5000/api/proxy?url=" : "/api/proxy.php?url=";
            const response = await fetch(`${proxyUrl}${encodeURIComponent('https://ipapi.co/json/')}`);
            const data = await response.json();

            return {
                city: data.city || 'Unknown',
                country: data.country_name || 'Unknown',
                lat: data.latitude || 0,
                lng: data.longitude || 0
            };
        } catch (error) {
            console.error('Failed to get user location:', error);
            return null;
        }
    }
}

export const analyticsService = new AnalyticsService();
export default analyticsService;
