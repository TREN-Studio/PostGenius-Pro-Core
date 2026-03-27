
import React from 'react';
import { useLocation } from 'react-router-dom';
import Header from './Header';
import Footer from './Footer';
import type { Session } from '../types';
import type { UserProfile } from '../types';

interface MainLayoutProps {
    session: Session | null;
    userRole: 'admin' | 'user';
    onLogoClick: () => void;
    userProfile: UserProfile | null;
    children?: React.ReactNode;
}

const MainLayout: React.FC<MainLayoutProps> = ({ session, userRole, onLogoClick, userProfile, children }) => {
    const location = useLocation();
    const isHomepage = location.pathname === '/';
    const internalPrefixes = ['/generator', '/my-articles', '/admin', '/settings', '/analytics', '/support'];
    const isInternalSurface = internalPrefixes.some(prefix => location.pathname === prefix || location.pathname.startsWith(`${prefix}/`));
    const isPublicSurface = !isInternalSurface;
    const shellClassName = isPublicSurface
        ? isHomepage
            ? 'w-full max-w-[1720px] mx-auto px-4 sm:px-6 lg:px-8 xl:px-12'
            : location.pathname === '/blog'
                ? 'w-full max-w-[1660px] mx-auto px-4 sm:px-6 lg:px-8 xl:px-12'
                : 'w-full max-w-[1540px] mx-auto px-4 sm:px-6 lg:px-8 xl:px-12'
        : 'w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8';
    const publicShellStyle = isPublicSurface ? ({
        ['--color-background' as string]: '#fffaf8',
        ['--color-card-bg' as string]: '#ffffff',
        ['--color-text-primary' as string]: '#4f315a',
        ['--color-text-secondary' as string]: '#736679',
        ['--color-text-headings' as string]: '#512b5b',
        ['--color-accent' as string]: '#833f7a',
        ['--color-accent-glow' as string]: 'rgba(131,63,122,0.18)',
        ['--color-cta' as string]: '#ff8d77',
        ['--color-cta-hover' as string]: '#ff7d62',
        ['--color-border' as string]: 'rgba(131,63,122,0.14)',
        ['--font-heading' as string]: "'Manrope', 'Inter', sans-serif",
        ['--font-mono' as string]: "'Inter', sans-serif",
    } as React.CSSProperties) : undefined;
    const publicBackgroundStyle = isPublicSurface
        ? ({
            backgroundColor: '#fffaf8',
            backgroundImage: 'radial-gradient(circle at 8% 12%, rgba(255, 193, 214, 0.28), transparent 12%), radial-gradient(circle at 94% 18%, rgba(174, 219, 255, 0.26), transparent 12%), radial-gradient(circle at 12% 72%, rgba(255, 220, 151, 0.20), transparent 10%), radial-gradient(circle at 90% 80%, rgba(191, 241, 221, 0.20), transparent 12%), linear-gradient(180deg, #fffaf8 0%, #fffefc 45%, #fffaf8 100%)',
        } as React.CSSProperties)
        : undefined;

    return (
        <div
            className={`flex min-h-screen flex-col ${isPublicSurface ? 'public-editorial-surface bg-[#fffaf8] text-slate-900' : ''}`}
            style={{ ...(publicShellStyle || {}), ...(publicBackgroundStyle || {}) }}
        >
            <div className={`${shellClassName} relative z-20`}>
                <Header session={session} userRole={userRole} onLogoClick={onLogoClick} userProfile={userProfile} />
            </div>
            <main className="relative flex-grow">
                {isPublicSurface && (
                    <>
                        <div className="pointer-events-none absolute inset-x-0 top-0 z-0 h-56 bg-[radial-gradient(circle_at_50%_0%,rgba(255,210,227,0.35),transparent_62%)]" />
                        <div className="pointer-events-none absolute left-4 top-16 z-0 h-10 w-10 rounded-t-full bg-[#ffb4c8]/55 sm:left-10" />
                        <div className="pointer-events-none absolute right-8 top-32 z-0 h-8 w-8 rounded-full bg-[#95d6ff]/55 sm:right-14" />
                        <div className="pointer-events-none absolute left-[12%] top-[34rem] z-0 h-5 w-10 rounded-full bg-[#f9cf5f]/65" />
                        <div className="pointer-events-none absolute right-[9%] top-[56rem] z-0 h-6 w-6 rounded-t-full bg-[#98e0b2]/60" />
                    </>
                )}
                <div className={`${shellClassName} relative z-10`}>
                    {children}
                </div>
            </main>
            <div className={`${shellClassName} relative z-20`}>
                <Footer />
            </div>
        </div>
    );
};

export default MainLayout;
