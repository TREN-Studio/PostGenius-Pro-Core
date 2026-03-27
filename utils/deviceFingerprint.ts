/**
 * Device Fingerprinting Utility
 * Generates a unique identifier for the user's device to enforce usage limits
 */

export const generateDeviceFingerprint = async (): Promise<string> => {
    const components: string[] = [];

    // Screen resolution
    components.push(`${window.screen.width}x${window.screen.height}x${window.screen.colorDepth}`);

    // Timezone
    components.push(Intl.DateTimeFormat().resolvedOptions().timeZone);

    // Language
    components.push(navigator.language);

    // Platform
    components.push(navigator.platform);

    // User Agent
    components.push(navigator.userAgent);

    // Hardware concurrency (CPU cores)
    components.push(String(navigator.hardwareConcurrency || 0));

    // Device memory (if available)
    const deviceMemory = (navigator as any).deviceMemory;
    if (deviceMemory) {
        components.push(String(deviceMemory));
    }

    // Canvas fingerprint
    try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (ctx) {
            ctx.textBaseline = 'top';
            ctx.font = '14px Arial';
            ctx.fillStyle = '#f60';
            ctx.fillRect(125, 1, 62, 20);
            ctx.fillStyle = '#069';
            ctx.fillText('PostGenius Pro', 2, 15);
            components.push(canvas.toDataURL());
        }
    } catch (e) {
        // Canvas fingerprinting failed, skip
    }

    // WebGL fingerprint
    try {
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
        if (gl && gl instanceof WebGLRenderingContext) {
            const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
            if (debugInfo) {
                components.push(gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL));
                components.push(gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL));
            }
        }
    } catch (e) {
        // WebGL fingerprinting failed, skip
    }

    // Combine all components
    const fingerprint = components.join('|');

    // Hash the fingerprint using SubtleCrypto API
    const encoder = new TextEncoder();
    const data = encoder.encode(fingerprint);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    return hashHex;
};

/**
 * Store device fingerprint in localStorage
 */
export const storeDeviceFingerprint = async (): Promise<string> => {
    const FINGERPRINT_KEY = 'pgp_device_fp';

    // Check if fingerprint already exists
    let fingerprint = localStorage.getItem(FINGERPRINT_KEY);

    if (!fingerprint) {
        fingerprint = await generateDeviceFingerprint();
        localStorage.setItem(FINGERPRINT_KEY, fingerprint);
    }

    return fingerprint;
};

/**
 * Get stored device fingerprint
 */
export const getDeviceFingerprint = (): string | null => {
    return localStorage.getItem('pgp_device_fp');
};
