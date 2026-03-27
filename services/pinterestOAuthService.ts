/**
 * Pinterest OAuth Service
 * Handles OAuth flow for Pinterest API scopes
 * Manages token storage and refresh
 */

export interface PinterestOAuthConfig {
    clientId: string;
    clientSecret: string;
    redirectUri: string;
}

export interface PinterestScope {
    name: string;
    description: string;
    category: 'pins' | 'boards' | 'user' | 'ads';
    required: boolean;
}

export interface OAuthToken {
    accessToken: string;
    refreshToken?: string;
    expiresIn: number;
    expiresAt: number;
    scopes: string[];
}

/**
 * Pinterest API Scopes for PostGenius Pro Integration
 */
export const PINTEREST_SCOPES: PinterestScope[] = [
    {
        name: 'pins:read',
        description: 'View public pins',
        category: 'pins',
        required: false,
    },
    {
        name: 'pins:read_secret',
        description: 'View secret/private pins',
        category: 'pins',
        required: false,
    },
    {
        name: 'pins:write',
        description: 'Create, update pins with generated images',
        category: 'pins',
        required: true,
    },
    {
        name: 'pins:write_secret',
        description: 'Create secret/private pins',
        category: 'pins',
        required: false,
    },
    {
        name: 'boards:read',
        description: 'View public boards',
        category: 'boards',
        required: false,
    },
    {
        name: 'boards:read_secret',
        description: 'View secret/private boards',
        category: 'boards',
        required: false,
    },
    {
        name: 'boards:write',
        description: 'Create and organize product boards',
        category: 'boards',
        required: false,
    },
    {
        name: 'boards:write_secret',
        description: 'Create secret boards',
        category: 'boards',
        required: false,
    },
    {
        name: 'user_accounts:read',
        description: 'Read user account data for audience insights',
        category: 'user',
        required: true,
    },
];

/**
 * Generates the OAuth authorization URL
 */
export function generateAuthorizationUrl(clientId: string, redirectUri: string, scopes: string[]): string {
    const baseUrl = 'https://api.pinterest.com/oauth';
    const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: scopes.join(' '),
        state: generateRandomState(),
    });

    return `${baseUrl}?${params.toString()}`;
}

/**
 * Exchanges authorization code for access token
 */
export async function exchangeCodeForToken(
    code: string,
    clientId: string,
    clientSecret: string,
    redirectUri: string,
): Promise<OAuthToken> {
    try {
        const response = await fetch('https://api.pinterest.com/oauth/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                grant_type: 'authorization_code',
                code,
                client_id: clientId,
                client_secret: clientSecret,
                redirect_uri: redirectUri,
            }).toString(),
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`OAuth token exchange failed: ${error}`);
        }

        const data = await response.json() as any;

        const token: OAuthToken = {
            accessToken: data.access_token,
            refreshToken: data.refresh_token,
            expiresIn: data.expires_in,
            expiresAt: Date.now() + data.expires_in * 1000,
            scopes: (data.scope as string)?.split(' ') || [],
        };

        return token;
    } catch (error) {
        console.error('OAuth token exchange error:', error);
        throw error;
    }
}

/**
 * Refreshes an expired access token
 */
export async function refreshAccessToken(
    refreshToken: string,
    clientId: string,
    clientSecret: string,
): Promise<OAuthToken> {
    try {
        const response = await fetch('https://api.pinterest.com/oauth/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                grant_type: 'refresh_token',
                refresh_token: refreshToken,
                client_id: clientId,
                client_secret: clientSecret,
            }).toString(),
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Token refresh failed: ${error}`);
        }

        const data = await response.json() as any;

        const token: OAuthToken = {
            accessToken: data.access_token,
            refreshToken: data.refresh_token || refreshToken,
            expiresIn: data.expires_in,
            expiresAt: Date.now() + data.expires_in * 1000,
            scopes: (data.scope as string)?.split(' ') || [],
        };

        return token;
    } catch (error) {
        console.error('Token refresh error:', error);
        throw error;
    }
}

/**
 * Verifies token validity and expiry
 */
export function isTokenValid(token: OAuthToken): boolean {
    return token.expiresAt > Date.now();
}

/**
 * Gets required scopes for full automation
 */
export function getRequiredScopes(): string[] {
    return PINTEREST_SCOPES.filter((scope) => scope.required).map((scope) => scope.name);
}

/**
 * Gets all available scopes
 */
export function getAllAvailableScopes(): string[] {
    return PINTEREST_SCOPES.map((scope) => scope.name);
}

/**
 * Generates a random state for OAuth security
 */
function generateRandomState(): string {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

export default {
    PINTEREST_SCOPES,
    generateAuthorizationUrl,
    exchangeCodeForToken,
    refreshAccessToken,
    isTokenValid,
    getRequiredScopes,
    getAllAvailableScopes,
};
