const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const API_URL = isLocal ? "https://www.postgeniuspro.com/api" : "/api";

export const api = {
    async post(endpoint: string, data: any) {
        const token = localStorage.getItem('auth_token');
        const res = await fetch(`${API_URL}${endpoint}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': token || ''
            },
            body: JSON.stringify(data)
        });

        // Check if response is OK
        if (!res.ok) {
            const text = await res.text();
            console.error('API Error Response:', text);
            throw new Error(`HTTP ${res.status}: ${text.substring(0, 200)}`);
        }

        // Try to parse JSON, handle empty responses
        const text = await res.text();
        if (!text || text.trim() === '') {
            throw new Error('Empty response from server');
        }

        try {
            // Debugging: Check for common PHP echo error
            if (text === '[object Object]') {
                console.error('CRITICAL API ERROR: Server returned string "[object Object]". This usually means a PHP script echoed an array/object directly.');
                throw new Error('Server error: Invalid response format ([object Object])');
            }
            return JSON.parse(text);
        } catch (e: any) {
            console.error('Failed to parse JSON:', text.substring(0, 500));
            // Preserve specific error if we threw it
            if (e.message && e.message.includes('Server error')) throw e;
            throw new Error(`Invalid JSON response: ${text.substring(0, 200)}`);
        }
    },

    async get(endpoint: string) {
        const token = localStorage.getItem('auth_token');
        const res = await fetch(`${API_URL}${endpoint}`, {
            headers: { 'Authorization': token || '' }
        });

        if (!res.ok) {
            const text = await res.text();
            console.error('API Error Response:', text);
            throw new Error(`HTTP ${res.status}: ${text.substring(0, 200)}`);
        }

        const text = await res.text();
        if (!text || text.trim() === '') {
            throw new Error('Empty response from server');
        }

        try {
            return JSON.parse(text);
        } catch (e) {
            console.error('Failed to parse JSON:', text.substring(0, 500));
            throw new Error(`Invalid JSON response: ${text.substring(0, 200)}`);
        }
    }
};
