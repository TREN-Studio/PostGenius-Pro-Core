import React from 'react';
import Meta from './Meta';
import PublicPageShell, { PublicPanel } from './PublicPageShell';

const FeatureCard: React.FC<{
    icon: string;
    title: string;
    children: React.ReactNode;
}> = ({ icon, title, children }) => (
    <div className="rounded-[1.8rem] border border-[#ead8e7] bg-white p-6 shadow-[0_20px_45px_rgba(90,49,96,0.08)]">
        <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-[1.25rem] bg-gradient-to-br from-[#ffe0ec] to-[#e8f3ff] text-sm font-black tracking-[0.18em] text-[#7a477a]">
                {icon}
            </div>
            <div>
                <h3 className="text-xl font-black leading-tight text-[#402247]">{title}</h3>
            </div>
        </div>
        <p className="mt-5 text-sm leading-relaxed text-[#6b5a73] sm:text-base">{children}</p>
    </div>
);

const ComparisonRow: React.FC<{
    feature: string;
    portal: string;
    generic: string;
}> = ({ feature, portal, generic }) => (
    <div className="grid gap-4 border-b border-[#f0e2ec] py-5 last:border-0 md:grid-cols-[220px_minmax(0,1fr)_minmax(0,1fr)] md:items-start">
        <div className="text-lg font-black text-[#402247]">{feature}</div>
        <div className="rounded-[1.35rem] border border-[#e6d3e5] bg-gradient-to-br from-[#fff6fb] to-[#f4f9ff] p-4 text-sm leading-relaxed text-[#4c3753]">
            <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.18em] text-[#7a477a]">Postgenius Pro</span>
            {portal}
        </div>
        <div className="rounded-[1.35rem] border border-[#eee6ee] bg-white p-4 text-sm leading-relaxed text-[#7a6b82]">
            <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8f8097]">Typical Affiliate Blog</span>
            {generic}
        </div>
    </div>
);

const FeaturesPage: React.FC = () => {
    const comparisons = [
        {
            feature: 'Editorial Framing',
            portal: 'Articles open with clear context, recommendation structure, and shopping intent rather than thin listicles.',
            generic: 'Posts often begin with broad filler copy and generic claims.'
        },
        {
            feature: 'Reader Trust',
            portal: 'Review labels, update language, and disclosure placement are designed to stay visible without overwhelming the page.',
            generic: 'Trust signals are inconsistent or buried below aggressive monetization.'
        },
        {
            feature: 'Product Discovery',
            portal: 'The experience blends category browsing, shortlist framing, and guided comparisons for many Amazon niches.',
            generic: 'Discovery usually depends on repetitive article cards and limited cross-linking.'
        },
        {
            feature: 'Member Value',
            portal: 'Saved reading lists, tracked products, and shortlist flows are built around repeat visits and confidence.',
            generic: 'Membership, if present, is usually thin or purely promotional.'
        },
        {
            feature: 'Visual Quality',
            portal: 'Public pages use soft editorial composition, stronger image hierarchy, and publication-style spacing.',
            generic: 'Layouts often feel cramped, ad-heavy, or too close to product catalog design.'
        }
    ];

    return (
        <>
            <Meta
                title="Why Readers Choose Postgenius Pro"
                description="See how Postgenius Pro structures trusted reviews, clear comparisons, and practical buying guides for confident shopping decisions."
            />
            <PublicPageShell
                eyebrow="Why Postgenius Pro"
                title="A softer editorial experience built to help shoppers decide faster."
                description="We are shaping the publication to feel more like a premium consumer guide than a tool or dashboard, while still serving many Amazon niches with clear comparison logic."
                badges={['Trusted Reviews', 'Clear Comparisons', 'Reader Membership']}
                aside={
                    <PublicPanel className="bg-white/90">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#7a477a]">Positioning</p>
                        <h2 className="mt-3 text-2xl font-black leading-tight text-[#402247]">A multi-category review publication with a warmer, easier browsing rhythm.</h2>
                        <p className="mt-4 text-sm leading-relaxed text-[#6b5a73]">
                            The experience is designed to feel welcoming across kitchen, electronics, home, deals, and every Amazon niche we cover, without turning the site into a marketplace clone.
                        </p>
                    </PublicPanel>
                }
            >
                <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                    <FeatureCard icon="TR" title="Trusted Review Format">
                        Each article is framed with practical verdicts, softer visual hierarchy, and clearer reader-first context.
                    </FeatureCard>
                    <FeatureCard icon="CP" title="Clear Comparison Paths">
                        Comparison modules and buying-guide sections are arranged to reduce friction between discovery and decision.
                    </FeatureCard>
                    <FeatureCard icon="MG" title="Magazine-Led Design">
                        Public pages are moving toward an editorial aesthetic inspired by friendly consumer platforms rather than software landing pages.
                    </FeatureCard>
                    <FeatureCard icon="SV" title="Saved Shortlists">
                        Members can keep favorite reviews and tracked products together for later visits.
                    </FeatureCard>
                    <FeatureCard icon="MT" title="Measured Monetization">
                        Affiliate placements remain visible, but they are structured to preserve trust and readability.
                    </FeatureCard>
                    <FeatureCard icon="MN" title="Many Niches, One System">
                        The same editorial structure adapts across kitchen tools, electronics, home essentials, and other Amazon categories.
                    </FeatureCard>
                </section>

                <PublicPanel>
                    <div className="mx-auto max-w-3xl text-center">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#7a477a]">Editorial Advantage</p>
                        <h2 className="mt-4 text-4xl font-black tracking-[-0.04em] text-[#402247]">What makes this publication different from a typical affiliate blog.</h2>
                        <p className="mt-4 text-base leading-relaxed text-[#6b5a73] sm:text-lg">
                            The goal is not to feel like software or a coupon wall. The goal is to feel organized, warm, and dependable while still helping readers reach a purchase decision quickly.
                        </p>
                    </div>

                    <div className="mt-10 space-y-2">
                        {comparisons.map((item) => (
                            <ComparisonRow
                                key={item.feature}
                                feature={item.feature}
                                portal={item.portal}
                                generic={item.generic}
                            />
                        ))}
                    </div>
                </PublicPanel>
            </PublicPageShell>
        </>
    );
};

export default FeaturesPage;
