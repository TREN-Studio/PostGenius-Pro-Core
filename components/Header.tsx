import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, NavLink as RouterNavLink, useLocation, useNavigate } from 'react-router-dom';
import type { Session, UserProfile } from '../types';

const OWNER_EMAIL = 'larbilife@gmail.com';

const Logo: React.FC<{ onClick: () => void; isPublicSurface: boolean; }> = ({ onClick, isPublicSurface }) => (
    <Link
        to="/"
        onClick={onClick}
        className={`relative z-50 flex items-center gap-3 group ${isPublicSurface ? 'text-slate-900' : 'text-text-primary'}`}
        aria-label="Postgenius Pro Home"
    >
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="transition-transform duration-300 group-hover:rotate-[-5deg] logo-glow">
            <path d="M12 2L2 7L12 12L22 7L12 2Z" fill="var(--color-accent)" />
            <path d="M2 17L12 22L22 17L12 12L2 17Z" fill="var(--color-accent)" fillOpacity="0.6" />
            <path d="M2 7L12 12V22L2 17V7Z" fill="var(--color-cta)" fillOpacity="0.8" />
            <path d="M22 7L12 12V22L22 17V7Z" fill="var(--color-cta)" fillOpacity="0.4" />
        </svg>
        <h1 className={isPublicSurface
            ? 'text-[1.4rem] sm:text-[1.55rem] font-black tracking-[-0.03em] text-[#5b3061]'
            : 'text-2xl sm:text-[2rem] font-bold font-heading tracking-[0.08em] chameleon-text'}
        >
            Postgenius Pro
        </h1>
    </Link>
);

interface HeaderProps {
    onLogoClick: () => void;
    session: Session | null;
    userRole: 'admin' | 'user';
    userProfile: UserProfile | null;
}

const NavLink: React.FC<{ to: string; children: React.ReactNode; onClick?: () => void; }> = ({ to, children, onClick }) => (
    <RouterNavLink
        to={to}
        onClick={onClick}
        className={({ isActive }) =>
            `nav-link relative block w-full md:w-auto text-center md:text-left transition-all duration-300 
            font-mono text-xs uppercase tracking-[0.15em] px-4 py-3 md:py-2 md:px-1 rounded-lg md:rounded-none
            ${isActive ? 'text-[#b8801e] font-bold' : 'text-text-secondary hover:text-text-headings'}`
        }
    >
        {children}
    </RouterNavLink>
);

const PublicNavLink: React.FC<{ to: string; children: React.ReactNode; onClick?: () => void; }> = ({ to, children, onClick }) => (
    <RouterNavLink
        to={to}
        onClick={onClick}
        className={({ isActive }) =>
            `nav-link relative block w-full md:w-auto text-center md:text-left transition-all duration-300
            text-sm font-semibold px-4 py-3 md:py-2 md:px-3 rounded-full
            ${isActive ? 'bg-[#f7ebf4] text-[#7a477a]' : 'text-slate-600 hover:bg-[#f9f3f8] hover:text-[#5b3061]'}`
        }
    >
        {children}
    </RouterNavLink>
);

const UserMenu: React.FC<{
    userProfile: UserProfile;
    isOwner: boolean;
    onLogout: () => void;
    onClose?: () => void;
    isMobile?: boolean;
    isPublicSurface?: boolean;
}> = ({ userProfile, isOwner, onLogout, onClose, isMobile = false, isPublicSurface = false }) => {
    const [isOpen, setIsOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const defaultAvatar = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%239CA3B0'%3E%3Cpath fill-rule='evenodd' d='M18.685 19.097A9.723 9.723 0 0021.75 12c0-5.385-4.365-9.75-9.75-9.75S2.25 6.615 2.25 12a9.723 9.723 0 003.065 7.097A9.716 9.716 0 0012 21.75a9.716 9.716 0 006.685-2.653zm-12.54-1.285A7.486 7.486 0 0112 15a7.486 7.486 0 015.855 2.812A8.224 8.224 0 0112 20.25a8.224 8.224 0 01-5.855-2.438zM15.75 9a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z' clip-rule='evenodd' /%3E%3C/svg%3E";

    const quickLinks = isOwner
        ? [
            { to: '/admin', label: 'Dashboard' },
            { to: '/my-articles', label: 'My Articles' },
            { to: '/settings', label: 'Settings' }
        ]
        : [
            { to: '/profile', label: 'Profile' },
            { to: '/my-articles', label: 'My Articles' },
            { to: '/settings', label: 'Settings' }
        ];

    if (isMobile) {
        return (
            <div className="w-full border-t border-border-color pt-4 mt-2">
                <RouterNavLink to={isOwner ? '/admin' : '/profile'} onClick={onClose} className="flex items-center gap-3 px-4 py-2 mb-2 hover:bg-white/5 rounded-lg transition-colors group">
                    <img src={userProfile.avatar_url || defaultAvatar} alt="User avatar" className="w-10 h-10 rounded-full object-cover bg-background border border-border-color" />
                    <div className="flex-1 min-w-0">
                        <p className={`text-sm font-bold truncate ${isPublicSurface ? 'text-slate-900' : 'text-text-primary'}`}>{userProfile.full_name || 'Member'}</p>
                        <p className={`text-xs ${isPublicSurface ? 'text-slate-500' : 'text-text-secondary'}`}>{isOwner ? 'Admin Access' : 'Smart Shopper Member'}</p>
                    </div>
                </RouterNavLink>
                {quickLinks.map(link => (
                    <RouterNavLink key={link.to} to={link.to} onClick={onClose} className={`block px-4 py-2 text-sm rounded-lg ${isPublicSurface ? 'text-slate-600 hover:bg-slate-100 hover:text-slate-950' : 'text-text-secondary hover:text-text-primary hover:bg-white/5'}`}>
                        {link.label}
                    </RouterNavLink>
                ))}
                <button onClick={onLogout} className="mt-2 block w-full text-left px-4 py-3 text-sm text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg">
                    Logout
                </button>
            </div>
        );
    }

    return (
        <div className="relative" ref={menuRef}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className={`flex items-center gap-2 rounded-full p-1 pl-2 pr-3 transition-colors border ${isPublicSurface ? 'border-slate-200 bg-white/80 hover:bg-white hover:border-slate-300' : 'border-transparent hover:bg-white/5 hover:border-border-color'}`}
                aria-haspopup="true"
                aria-expanded={isOpen}
            >
                <img src={userProfile.avatar_url || defaultAvatar} alt="User avatar" className="w-8 h-8 rounded-full object-cover bg-background border border-border-color" />
                <span className={`hidden sm:inline text-sm font-semibold ${isPublicSurface ? 'text-slate-800' : 'text-text-primary'}`}>{userProfile.full_name || 'Account'}</span>
            </button>
            {isOpen && (
                <div className={`absolute right-0 mt-2 w-56 rounded-xl shadow-2xl z-50 animate-fade-in py-2 overflow-hidden ${isPublicSurface ? 'bg-white border border-slate-200' : 'bg-card-bg backdrop-blur-xl border border-border-color'}`}>
                    {quickLinks.map(link => (
                        <RouterNavLink key={link.to} to={link.to} className={`block px-4 py-2.5 text-sm transition-colors ${isPublicSurface ? 'text-slate-800 hover:bg-[#f6efe3] hover:text-[#9a6a1b]' : 'text-text-primary hover:bg-accent/10 hover:text-accent'}`}>
                            {link.label}
                        </RouterNavLink>
                    ))}
                    <div className={`my-1 border-t ${isPublicSurface ? 'border-slate-200' : 'border-border-color'}`}></div>
                    <button onClick={onLogout} className="block w-full text-left px-4 py-2.5 text-sm text-red-400 hover:bg-red-500/10 transition-colors">
                        Logout
                    </button>
                </div>
            )}
        </div>
    );
};

const Header: React.FC<HeaderProps> = ({ onLogoClick, session, userRole, userProfile }) => {
    const navigate = useNavigate();
    const location = useLocation();
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [publicSearch, setPublicSearch] = useState('');
    const isOwnerSession = String(session?.user?.email || '').trim().toLowerCase() === OWNER_EMAIL;
    const internalPrefixes = ['/generator', '/my-articles', '/profile', '/admin', '/settings', '/analytics', '/support'];
    const isInternalSurface = internalPrefixes.some(prefix => location.pathname === prefix || location.pathname.startsWith(`${prefix}/`));
    const isPublicSurface = !isInternalSurface;
    const searchParams = useMemo(() => new URLSearchParams(location.search), [location.search]);
    const publicQueryType = searchParams.get('type');

    useEffect(() => {
        document.body.style.overflow = isMobileMenuOpen ? 'hidden' : '';
        return () => { document.body.style.overflow = ''; };
    }, [isMobileMenuOpen]);

    useEffect(() => {
        setPublicSearch(searchParams.get('search') || '');
    }, [searchParams]);

    const closeMobileMenu = () => setIsMobileMenuOpen(false);

    const handleLogout = () => {
        localStorage.removeItem('auth_token');
        localStorage.removeItem('user_data');
        window.location.href = '/';
        closeMobileMenu();
    };

    const handlePublicSearchSubmit = (event: React.FormEvent) => {
        event.preventDefault();
        const query = publicSearch.trim();
        if (!query) {
            navigate('/blog');
            closeMobileMenu();
            return;
        }
        navigate(`/blog?search=${encodeURIComponent(query)}`);
        closeMobileMenu();
    };

    const adminLinks = (
        <>
            <NavLink to="/admin" onClick={closeMobileMenu}>Dashboard</NavLink>
            <NavLink to="/my-articles" onClick={closeMobileMenu}>My Articles</NavLink>
        </>
    );

    const memberLinks = session && !isOwnerSession ? (
        <NavLink to="/profile" onClick={closeMobileMenu}>Profile</NavLink>
    ) : null;

    const navLinks = (
        <>
            <NavLink to="/blog" onClick={closeMobileMenu}>Magazine</NavLink>
            <NavLink to="/about" onClick={closeMobileMenu}>About</NavLink>
            <NavLink to="/contact" onClick={closeMobileMenu}>Contact</NavLink>
            {memberLinks}
            {isOwnerSession && userRole === 'admin' && adminLinks}
        </>
    );

    const publicLinks = [
        { to: '/blog', label: 'Magazine', active: location.pathname === '/blog' && !publicQueryType },
        { to: '/blog?type=review', label: 'Reviews', active: location.pathname === '/blog' && publicQueryType === 'review' },
        { to: '/blog?type=roundup', label: 'Comparisons', active: location.pathname === '/blog' && publicQueryType === 'roundup' },
        { to: '/blog?type=recipe', label: 'Buying Guides', active: location.pathname === '/blog' && publicQueryType === 'recipe' },
        { to: '/about', label: 'About', active: location.pathname === '/about' },
        { to: '/contact', label: 'Contact', active: location.pathname === '/contact' },
    ];

    const userActions = (isMobile: boolean) => {
        if (session && userProfile) {
            return <UserMenu userProfile={userProfile} isOwner={isOwnerSession} onLogout={handleLogout} onClose={closeMobileMenu} isMobile={isMobile} isPublicSurface={isPublicSurface} />;
        }

        return (
            <div className={`flex ${isMobile ? 'flex-col' : 'items-center'} gap-2`}>
                <Link to="/signup" onClick={closeMobileMenu} className="px-4 py-2 rounded-full bg-[#fdc754] text-black text-sm font-semibold hover:brightness-105">Join Free</Link>
            </div>
        );
    };

    if (isPublicSurface) {
        return (
            <header className="relative w-full py-4 z-40">
                <div className="hidden md:block">
                    <div className="rounded-[2.25rem] border border-[#ead9e7] bg-white/96 px-5 py-4 shadow-[0_16px_45px_rgba(94,49,101,0.09)]">
                        <div className="grid items-center gap-4 xl:grid-cols-[auto_minmax(0,1fr)_minmax(380px,0.9fr)_auto]">
                            <div className="flex items-center gap-7">
                                <Logo onClick={onLogoClick} isPublicSurface={true} />
                                <nav className="hidden xl:flex items-center gap-1">
                                    {publicLinks.map((link) => (
                                        <Link
                                            key={link.to}
                                            to={link.to}
                                            className={`rounded-full px-4 py-2.5 text-sm font-semibold transition ${link.active ? 'bg-[#f7ebf4] text-[#7a477a]' : 'text-slate-600 hover:bg-[#faf2f6] hover:text-[#5b3061]'}`}
                                        >
                                            {link.label}
                                        </Link>
                                    ))}
                                </nav>
                            </div>

                            <form onSubmit={handlePublicSearchSubmit} className="hidden xl:flex items-center">
                                <div className="flex w-full items-center rounded-full border border-[#eadbe8] bg-[#f8f6f7] px-5 py-3 shadow-inner">
                                    <svg className="mr-3 h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M10.8 18a7.2 7.2 0 100-14.4 7.2 7.2 0 000 14.4z" />
                                    </svg>
                                    <input
                                        type="search"
                                        value={publicSearch}
                                        onChange={(e) => setPublicSearch(e.target.value)}
                                        placeholder="Search reviews, products & guides"
                                        className="w-full bg-transparent text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none"
                                    />
                                </div>
                            </form>

                            <div className="flex items-center justify-end gap-3">
                                {!session && (
                                    <Link to="/contact" className="hidden text-sm font-medium text-slate-600 transition hover:text-[#5b3061] xl:inline-flex">
                                        Help
                                    </Link>
                                )}
                                {userActions(false)}
                            </div>
                        </div>

                        <div className="mt-4 grid items-center gap-3 xl:hidden lg:grid-cols-[minmax(0,1fr)_320px]">
                            <nav className="flex flex-wrap items-center gap-2">
                                {publicLinks.map((link) => (
                                    <Link
                                        key={link.to}
                                        to={link.to}
                                        className={`rounded-full px-4 py-2 text-sm font-semibold transition ${link.active ? 'bg-[#f7ebf4] text-[#7a477a]' : 'bg-[#faf7fb] text-slate-600 hover:bg-[#f8f2f8] hover:text-[#5b3061]'}`}
                                    >
                                        {link.label}
                                    </Link>
                                ))}
                            </nav>
                            <form onSubmit={handlePublicSearchSubmit} className="hidden lg:flex items-center">
                                <div className="flex w-full items-center rounded-full border border-[#eadbe8] bg-[#f8f6f7] px-4 py-3">
                                    <svg className="mr-3 h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M10.8 18a7.2 7.2 0 100-14.4 7.2 7.2 0 000 14.4z" />
                                    </svg>
                                    <input
                                        type="search"
                                        value={publicSearch}
                                        onChange={(e) => setPublicSearch(e.target.value)}
                                        placeholder="Search reviews & guides"
                                        className="w-full bg-transparent text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none"
                                    />
                                </div>
                            </form>
                        </div>
                    </div>
                </div>

                <div className="flex items-center justify-between md:hidden">
                    <Logo onClick={onLogoClick} isPublicSurface={true} />
                    <button
                        onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                        aria-label="Toggle menu"
                        className="rounded-full border border-[#ebdae8] bg-white p-2 text-[#5b3061] shadow-sm"
                    >
                        {isMobileMenuOpen ? (
                            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                        ) : (
                            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
                        )}
                    </button>
                </div>

                {isMobileMenuOpen && (
                    <div className="fixed inset-0 z-40 overflow-y-auto bg-[#fffafc]/95 px-6 pb-8 pt-24 backdrop-blur md:hidden animate-fade-in">
                        <div className="mx-auto max-w-md space-y-4">
                            <form onSubmit={handlePublicSearchSubmit} className="rounded-[1.4rem] border border-[#ebdae8] bg-white p-3 shadow-sm">
                                <div className="flex items-center gap-3">
                                    <svg className="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M10.8 18a7.2 7.2 0 100-14.4 7.2 7.2 0 000 14.4z" />
                                    </svg>
                                    <input
                                        type="search"
                                        value={publicSearch}
                                        onChange={(e) => setPublicSearch(e.target.value)}
                                        placeholder="Search reviews, products & guides"
                                        className="w-full bg-transparent text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none"
                                    />
                                </div>
                            </form>
                            <nav className="rounded-[1.7rem] border border-[#ebdae8] bg-white p-3 shadow-sm">
                                {publicLinks.map((link) => (
                                    <Link
                                        key={link.to}
                                        to={link.to}
                                        onClick={closeMobileMenu}
                                        className={`block rounded-[1rem] px-4 py-3 text-sm font-semibold transition ${link.active ? 'bg-[#f7ebf4] text-[#7a477a]' : 'text-slate-700 hover:bg-[#faf4f8]'}`}
                                    >
                                        {link.label}
                                    </Link>
                                ))}
                                <div className="mt-3 border-t border-slate-100 pt-3">
                                    {userActions(true)}
                                </div>
                            </nav>
                        </div>
                    </div>
                )}
            </header>
        );
    }

    return (
        <header className={`relative w-full py-4 z-40 ${isPublicSurface ? 'text-slate-900' : ''}`}>
            <div className={`hidden md:block pb-4 ${isPublicSurface ? 'border-b border-slate-300/80' : 'border-b border-border-color/60'}`}>
                <div className="relative flex min-h-[68px] items-center justify-center">
                    <div className="absolute left-0 hidden xl:block">
                        <p className={`text-[10px] uppercase tracking-[0.28em] ${isPublicSurface ? 'text-slate-500' : 'text-text-secondary'}`}>Independent Reviews & Buying Guides</p>
                    </div>
                    <div className="justify-self-center">
                        <Logo onClick={onLogoClick} isPublicSurface={isPublicSurface} />
                    </div>
                    <div className="absolute right-0">
                        {userActions(false)}
                    </div>
                </div>

                <nav className="mt-4 flex items-center justify-center gap-2">
                    {isPublicSurface ? (
                        <>
                            <PublicNavLink to="/blog" onClick={closeMobileMenu}>Magazine</PublicNavLink>
                            <PublicNavLink to="/about" onClick={closeMobileMenu}>About</PublicNavLink>
                            <PublicNavLink to="/contact" onClick={closeMobileMenu}>Contact</PublicNavLink>
                            {memberLinks}
                            {isOwnerSession && userRole === 'admin' && adminLinks}
                        </>
                    ) : navLinks}
                </nav>
            </div>

            <div className="flex items-center justify-between md:hidden">
                <Logo onClick={onLogoClick} isPublicSurface={isPublicSurface} />
                <div className="z-50">
                    <button
                        onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                        aria-label="Toggle menu"
                        className={`p-2 focus:outline-none rounded-lg border ${isPublicSurface ? 'bg-white text-slate-900 border-slate-300' : 'text-text-primary bg-card-bg/50 border-border-color'}`}
                    >
                        {isMobileMenuOpen ? (
                            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                        ) : (
                            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
                        )}
                    </button>
                </div>
            </div>

            {isMobileMenuOpen && (
                <div className={`fixed inset-0 z-40 flex flex-col pt-24 px-6 pb-8 overflow-y-auto md:hidden animate-fade-in ${isPublicSurface ? 'bg-[#f6f3ed]/95 backdrop-blur-xl' : 'bg-background/95 backdrop-blur-xl'}`}>
                    <nav className="flex flex-col gap-2 w-full max-w-md mx-auto">
                        {navLinks}
                        <div className="mt-4">
                            {userActions(true)}
                        </div>
                    </nav>
                </div>
            )}
        </header>
    );
};

export default Header;
