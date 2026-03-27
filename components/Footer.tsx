import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Facebook, Instagram, Linkedin, Youtube } from 'lucide-react';

const FooterColumn: React.FC<{
    title: string;
    links: Array<{ label: string; to: string }>;
}> = ({ title, links }) => (
    <div>
        <h3 className="text-sm font-black uppercase tracking-[0.16em] text-white">{title}</h3>
        <div className="mt-5 space-y-3">
            {links.map((link) => (
                <Link key={`${title}-${link.to}-${link.label}`} to={link.to} className="block text-sm text-white/80 transition hover:text-white">
                    {link.label}
                </Link>
            ))}
        </div>
    </div>
);

const Footer: React.FC = () => {
    const location = useLocation();
    const internalPrefixes = ['/generator', '/my-articles', '/admin', '/settings', '/analytics', '/support'];
    const isInternalSurface = internalPrefixes.some(prefix => location.pathname === prefix || location.pathname.startsWith(`${prefix}/`));

    if (isInternalSurface) {
        return (
            <footer className="w-full mt-auto border-t border-border-color py-8 text-center text-text-secondary">
                <div className="flex flex-col items-center gap-4">
                    <div className="flex flex-wrap items-center justify-center gap-5 text-[11px] font-semibold uppercase tracking-[0.18em]">
                        <Link to="/blog" className="hover:text-accent transition-colors">Magazine</Link>
                        <Link to="/about" className="hover:text-accent transition-colors">About</Link>
                        <Link to="/contact" className="hover:text-accent transition-colors">Contact</Link>
                        <Link to="/affiliate-disclosure" className="hover:text-accent transition-colors">Disclosure</Link>
                    </div>
                    <p className="max-w-3xl text-sm leading-relaxed">
                        Independent product reviews, comparisons, and buying guides designed to help readers choose with confidence.
                    </p>
                    <p className="text-sm font-medium text-text-primary">&copy; 2026 Postgenius Pro. All rights reserved.</p>
                </div>
            </footer>
        );
    }

    const columns = [
        {
            title: 'Magazine',
            links: [
                { label: 'Magazine', to: '/blog' },
                { label: 'Trusted Reviews', to: '/blog?type=review' },
                { label: 'Comparisons', to: '/blog?type=roundup' },
                { label: 'Buying Guides', to: '/blog?type=recipe' },
                { label: 'Latest Stories', to: '/blog' },
            ],
        },
        {
            title: 'Categories',
            links: [
                { label: 'Kitchen Gear', to: '/blog?tag=Kitchen%20Gear' },
                { label: 'Electronics', to: '/blog?tag=Electronics' },
                { label: 'Home Essentials', to: '/blog?tag=Home%20Essentials' },
                { label: 'Best Deals', to: '/blog?tag=Best%20Deals' },
                { label: 'Product Reviews', to: '/blog?tag=Product%20Reviews' },
            ],
        },
        {
            title: 'Popular Guides',
            links: [
                { label: 'Best Kitchen Picks', to: '/blog?tag=Kitchen%20Gear' },
                { label: 'Top Electronics', to: '/blog?tag=Electronics' },
                { label: 'Home Buying Guides', to: '/blog?tag=Home%20Essentials' },
                { label: 'Editor Favorites', to: '/blog?type=roundup' },
                { label: 'Recently Updated', to: '/blog' },
            ],
        },
        {
            title: 'Membership',
            links: [
                { label: 'Join Free', to: '/login?mode=signup' },
                { label: 'Member Login', to: '/login' },
                { label: 'Reader Membership', to: '/pricing' },
                { label: 'FAQ', to: '/faq' },
                { label: 'Contact Us', to: '/contact' },
            ],
        },
        {
            title: 'Support & Legal',
            links: [
                { label: 'About', to: '/about' },
                { label: 'Features', to: '/features' },
                { label: 'Affiliate Disclosure', to: '/affiliate-disclosure' },
                { label: 'Privacy Policy', to: '/privacy-policy' },
                { label: 'Terms of Service', to: '/terms' },
            ],
        },
    ];

    const socialLinks = [
        { label: 'Instagram', href: 'https://www.instagram.com/', icon: <Instagram className="h-4 w-4" /> },
        { label: 'Facebook', href: 'https://www.facebook.com/', icon: <Facebook className="h-4 w-4" /> },
        { label: 'LinkedIn', href: 'https://www.linkedin.com/', icon: <Linkedin className="h-4 w-4" /> },
        { label: 'YouTube', href: 'https://www.youtube.com/', icon: <Youtube className="h-4 w-4" /> },
    ];

    return (
        <footer className="relative mt-20 overflow-hidden rounded-t-[3rem] bg-[#7c3d74] text-white shadow-[0_-24px_80px_rgba(105,59,111,0.14)]">
            <div className="absolute inset-x-0 top-0 h-2 bg-gradient-to-r from-[#ffb4c6] via-[#d7bfff] to-[#9ed7ff]" />
            <div className="absolute -left-10 top-10 h-36 w-36 rounded-full bg-white/8 blur-2xl" />
            <div className="absolute right-8 bottom-10 h-40 w-40 rounded-full bg-white/8 blur-2xl" />
            <div className="mx-auto max-w-[1700px] px-6 py-14 sm:px-8 lg:px-10 xl:px-14 xl:py-16">
                <div className="grid gap-12 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,3fr)]">
                    <div className="space-y-5">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-white/70">Postgenius Pro</p>
                        <h2 className="max-w-md text-3xl font-black leading-tight sm:text-[2.65rem]">
                            Trusted reviews, comparisons, and shopping guides for every Amazon niche.
                        </h2>
                        <p className="max-w-md text-base leading-relaxed text-white/80">
                            A warm, easy-to-browse editorial platform built for kitchen, electronics, home, office, lifestyle, and every other category readers compare on Amazon.
                        </p>
                        <div className="flex flex-wrap gap-3">
                            <Link to="/blog" className="inline-flex items-center rounded-full bg-white px-5 py-3 text-sm font-semibold text-[#6f3b70] transition hover:bg-[#fff5fb]">
                                Explore the Magazine
                            </Link>
                            <Link to="/pricing" className="inline-flex items-center rounded-full border border-white/30 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10">
                                Reader Membership
                            </Link>
                        </div>
                    </div>

                    <div className="grid gap-8 sm:grid-cols-2 xl:grid-cols-5">
                        {columns.map((column) => (
                            <FooterColumn key={column.title} title={column.title} links={column.links} />
                        ))}
                    </div>
                </div>

                <div className="mt-12 grid gap-8 border-t border-white/15 pt-8 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] lg:items-end">
                    <div className="space-y-4">
                        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-white/75">Connect with us</p>
                        <div className="flex flex-wrap gap-3">
                            {socialLinks.map((item) => (
                                <a
                                    key={item.label}
                                    href={item.href}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    aria-label={item.label}
                                    className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/20 bg-white/8 text-white transition hover:bg-white/16"
                                >
                                    {item.icon}
                                </a>
                            ))}
                        </div>
                    </div>

                    <div className="text-left lg:text-right">
                        <p className="text-sm leading-relaxed text-white/80">
                            Independent product reviews, comparisons, and practical buying guides designed to help readers choose with confidence.
                        </p>
                        <p className="mt-4 text-sm text-white/60">&copy; 2026 Postgenius Pro. All rights reserved.</p>
                    </div>
                </div>
            </div>
        </footer>
    );
};

export default Footer;
