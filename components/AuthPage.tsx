import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import Meta from './Meta';
import PublicPageShell, { PublicPanel } from './PublicPageShell';
import { api } from '../services/apiClient';

declare global {
    interface Window {
        google: any;
    }
}

const GOOGLE_CLIENT_ID = '877623556231-20c2f7ts5u9kolvsmr4nd949q0tf2vhv.apps.googleusercontent.com';

type AuthMode = 'login' | 'signup';

const readModeFromLocation = (pathname: string, search: string): AuthMode => {
    if (pathname === '/signup') return 'signup';
    if (pathname === '/login') {
        const params = new URLSearchParams(search);
        return params.get('mode') === 'signup' ? 'signup' : 'login';
    }
    const params = new URLSearchParams(search);
    return params.get('mode') === 'signup' ? 'signup' : 'login';
};

const AuthPage: React.FC = () => {
    const navigate = useNavigate();
    const location = useLocation();

    const [mode, setMode] = useState<AuthMode>(() => readModeFromLocation(location.pathname, location.search));
    const [fullName, setFullName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [googleLoading, setGoogleLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        setMode(readModeFromLocation(location.pathname, location.search));
    }, [location.pathname, location.search]);

    useEffect(() => {
        const script = document.createElement('script');
        script.src = 'https://accounts.google.com/gsi/client';
        script.async = true;
        script.defer = true;
        script.onload = () => {
            if (window.google) {
                window.google.accounts.id.initialize({
                    client_id: GOOGLE_CLIENT_ID,
                    callback: handleGoogleCallback,
                    auto_select: false,
                    cancel_on_tap_outside: true,
                });
            }
        };
        document.body.appendChild(script);
        return () => {
            if (document.body.contains(script)) {
                document.body.removeChild(script);
            }
        };
    }, []);

    const subtitle = useMemo(() => (
        mode === 'signup'
            ? 'Create your free member account to save reviews, track products, and follow curated picks.'
            : 'Welcome back. Continue managing your reading list and tracked products.'
    ), [mode]);

    const persistSession = (res: any) => {
        localStorage.setItem('auth_token', res.token);
        localStorage.setItem('user_data', JSON.stringify(res.user));
        navigate('/dashboard');
        window.location.reload();
    };

    const handleGoogleCallback = async (response: any) => {
        setGoogleLoading(true);
        setError(null);
        try {
            const res = await api.post('/auth.php?action=google_login', {
                id_token: response.credential,
            });
            if (res.error) throw new Error(res.error);
            persistSession(res);
        } catch (err: any) {
            setError(err.message || 'Google authentication failed');
        } finally {
            setGoogleLoading(false);
        }
    };

    const handleGoogleSignIn = () => {
        if (window.google) window.google.accounts.id.prompt();
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        try {
            if (mode === 'signup') {
                const res = await api.post('/auth.php?action=register', {
                    full_name: fullName,
                    email,
                    password,
                });
                if (res.error) throw new Error(res.error);
                persistSession(res);
                return;
            }

            const res = await api.post('/auth.php?action=login', { email, password });
            if (res.error) throw new Error(res.error);
            persistSession(res);
        } catch (err: any) {
            setError(err.message || 'Authentication failed');
        } finally {
            setLoading(false);
        }
    };

    return (
        <>
            <Meta
                title={mode === 'signup' ? 'Join Postgenius Pro' : 'Member Login'}
                description="Create a Postgenius Pro member account to save reviews, track products, and keep your shortlist organized."
            />
            <PublicPageShell
                eyebrow="Reader Membership"
                title={mode === 'signup' ? 'Create your member account.' : 'Welcome back to your reading list.'}
                description={subtitle}
                badges={['Saved Reviews', 'Tracked Products', 'Curated Alerts']}
                aside={
                    <PublicPanel className="bg-white/90">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#7a477a]">Membership Benefits</p>
                        <h2 className="mt-3 text-2xl font-black leading-tight text-[#402247]">A lighter, more personal layer for readers who return often.</h2>
                        <ul className="mt-5 space-y-3 text-sm leading-relaxed text-[#6b5a73]">
                            <li>Save reviews and buying guides for later.</li>
                            <li>Track favorite products across many categories.</li>
                            <li>Follow a calmer, magazine-led shopping workflow.</li>
                        </ul>
                    </PublicPanel>
                }
            >
                <PublicPanel className="mx-auto max-w-3xl">
                    <div className="mx-auto max-w-2xl">
                        <div className="mb-6 flex items-center gap-2 rounded-full bg-[#faf4f8] p-1">
                            <button
                                type="button"
                                onClick={() => setMode('login')}
                                className={`flex-1 rounded-full px-5 py-3 text-sm font-semibold transition ${
                                    mode === 'login' ? 'bg-[#7a477a] text-white' : 'text-[#6b5a73]'
                                }`}
                            >
                                Member Login
                            </button>
                            <button
                                type="button"
                                onClick={() => setMode('signup')}
                                className={`flex-1 rounded-full px-5 py-3 text-sm font-semibold transition ${
                                    mode === 'signup' ? 'bg-[#7a477a] text-white' : 'text-[#6b5a73]'
                                }`}
                            >
                                Join Free
                            </button>
                        </div>

                        {error && (
                            <div className="mb-5 rounded-[1.4rem] border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                                {error}
                            </div>
                        )}

                        <form onSubmit={handleSubmit} className="space-y-4">
                            {mode === 'signup' && (
                                <div>
                                    <label htmlFor="full-name" className="mb-2 block text-sm font-semibold uppercase tracking-[0.14em] text-[#7a477a]">
                                        Full Name
                                    </label>
                                    <input
                                        id="full-name"
                                        type="text"
                                        value={fullName}
                                        onChange={(e) => setFullName(e.target.value)}
                                        placeholder="Your full name"
                                        className="w-full text-lg app-input"
                                        required
                                    />
                                </div>
                            )}
                            <div>
                                <label htmlFor="auth-email" className="mb-2 block text-sm font-semibold uppercase tracking-[0.14em] text-[#7a477a]">
                                    Email Address
                                </label>
                                <input
                                    id="auth-email"
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="you@example.com"
                                    className="w-full text-lg app-input"
                                    required
                                />
                            </div>
                            <div>
                                <label htmlFor="auth-password" className="mb-2 block text-sm font-semibold uppercase tracking-[0.14em] text-[#7a477a]">
                                    Password
                                </label>
                                <input
                                    id="auth-password"
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="Password"
                                    className="w-full text-lg app-input"
                                    required
                                />
                            </div>
                            <button
                                type="submit"
                                disabled={loading}
                                className="cta-button w-full text-lg disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                {loading ? 'Please wait...' : (mode === 'signup' ? 'Create Member Account' : 'Continue to Membership')}
                            </button>
                        </form>

                        <div className="relative my-7">
                            <div className="absolute inset-0 flex items-center">
                                <div className="w-full border-t border-[#ece1ea]"></div>
                            </div>
                            <div className="relative flex justify-center text-xs">
                                <span className="bg-white px-3 uppercase tracking-[0.2em] text-[#8d8096]">Or continue with</span>
                            </div>
                        </div>

                        <button
                            type="button"
                            onClick={handleGoogleSignIn}
                            disabled={googleLoading}
                            className="secondary-button w-full text-lg disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            {googleLoading ? 'Signing in...' : 'Continue with Google'}
                        </button>

                        <div className="mt-6 text-center text-sm text-[#6b5a73]">
                            <p>Editorial workspace access stays restricted to the owner account.</p>
                            <Link to="/" className="mt-2 inline-flex text-[#7a477a] hover:underline">
                                Back to the Magazine
                            </Link>
                        </div>
                    </div>
                </PublicPanel>
            </PublicPageShell>
        </>
    );
};

export default AuthPage;
