import React from 'react';

interface PublicPageShellProps {
    eyebrow: string;
    title: React.ReactNode;
    description: string;
    children: React.ReactNode;
    badges?: string[];
    aside?: React.ReactNode;
    align?: 'left' | 'center';
}

export const PublicPanel: React.FC<{
    children: React.ReactNode;
    className?: string;
}> = ({ children, className = '' }) => (
    <div className={`rounded-[2rem] border border-[#ead9e7] bg-white p-6 shadow-[0_24px_60px_rgba(90,49,96,0.08)] sm:p-8 ${className}`}>
        {children}
    </div>
);

const Deco: React.FC<{ className: string; color: string; shape: 'blob' | 'arch' | 'pill' }> = ({ className, color, shape }) => {
    if (shape === 'arch') {
        return <div className={`${className} rounded-t-full rounded-b-none opacity-70`} style={{ background: color }} />;
    }
    if (shape === 'pill') {
        return <div className={`${className} rounded-full opacity-70`} style={{ background: color }} />;
    }
    return <div className={`${className} rounded-[42%] opacity-70`} style={{ background: color }} />;
};

const PublicPageShell: React.FC<PublicPageShellProps> = ({
    eyebrow,
    title,
    description,
    children,
    badges = [],
    aside,
    align = 'left',
}) => {
    const isCentered = align === 'center';

    return (
        <div className="space-y-10 pb-14 sm:space-y-12 sm:pb-20">
            <section className="relative overflow-hidden rounded-[3rem] border border-[#ebdae8] bg-gradient-to-r from-[#f5b4cf] via-[#b6b6f0] to-[#88d6f6] shadow-[0_34px_88px_rgba(105,59,111,0.14)]">
                <Deco className="absolute -left-6 top-16 h-36 w-36" color="rgba(255,255,255,0.25)" shape="blob" />
                <Deco className="absolute left-[24%] top-10 h-20 w-20" color="rgba(255,255,255,0.18)" shape="arch" />
                <Deco className="absolute right-[16%] top-14 h-24 w-24" color="rgba(255,255,255,0.16)" shape="pill" />
                <Deco className="absolute right-10 bottom-16 h-28 w-28" color="rgba(255,255,255,0.18)" shape="arch" />
                <Deco className="absolute left-[48%] bottom-10 h-14 w-32" color="rgba(255,255,255,0.16)" shape="pill" />
                <div className="absolute inset-x-0 bottom-0 h-24 bg-white [clip-path:ellipse(82%_100%_at_50%_100%)]" />

                <div className={`relative grid gap-8 p-7 pb-20 sm:p-10 sm:pb-24 lg:p-12 lg:pb-24 ${aside ? 'xl:grid-cols-[minmax(0,1.05fr)_minmax(340px,0.78fr)] xl:items-center' : ''}`}>
                    <div className={isCentered ? 'mx-auto max-w-4xl text-center' : 'max-w-4xl'}>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-white/80">{eyebrow}</p>
                        <h1 className="mt-4 text-[2.45rem] font-black leading-[0.92] tracking-[-0.04em] text-white sm:text-[3.1rem] xl:text-[4.3rem]">
                            {title}
                        </h1>
                        <p className={`mt-5 max-w-3xl text-base leading-relaxed text-white/88 sm:text-lg ${isCentered ? 'mx-auto' : ''}`}>
                            {description}
                        </p>
                        {badges.length > 0 && (
                            <div className={`mt-7 flex flex-wrap gap-3 ${isCentered ? 'justify-center' : ''}`}>
                                {badges.map((badge) => (
                                    <span
                                        key={badge}
                                        className="inline-flex items-center rounded-full border border-white/45 bg-white/18 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-white"
                                    >
                                        {badge}
                                    </span>
                                ))}
                            </div>
                        )}

                        {!aside && (
                            <div className={`mt-10 flex flex-wrap gap-4 ${isCentered ? 'justify-center' : ''}`}>
                                <div className="rounded-[2rem] bg-white/92 px-6 py-5 shadow-[0_22px_40px_rgba(72,39,87,0.12)]">
                                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#7a477a]">Publication Focus</p>
                                    <p className="mt-2 text-base font-semibold text-[#4f315a]">Reviews, comparisons, and guides organized for calm discovery.</p>
                                </div>
                                <div className="rounded-[2rem] bg-white/92 px-6 py-5 shadow-[0_22px_40px_rgba(72,39,87,0.12)]">
                                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#7a477a]">Multi-Niche</p>
                                    <p className="mt-2 text-base font-semibold text-[#4f315a]">Built to support kitchen, electronics, home, office, and every Amazon niche.</p>
                                </div>
                            </div>
                        )}
                    </div>

                    {aside && (
                        <div className={isCentered ? 'mx-auto w-full max-w-md' : 'w-full'}>
                            <div className="rounded-[2.3rem] bg-white/18 p-3 shadow-[0_20px_48px_rgba(58,32,72,0.14)] backdrop-blur-[2px]">
                                {aside}
                            </div>
                        </div>
                    )}
                </div>
            </section>

            <div className="space-y-8">
                {children}
            </div>
        </div>
    );
};

export default PublicPageShell;
