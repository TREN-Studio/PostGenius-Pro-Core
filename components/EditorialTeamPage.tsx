import React from 'react';
import { Helmet } from 'react-helmet-async';
import Meta from './Meta';

type Expert = {
    name: string;
    role: string;
    bio: string;
    specialty: string[];
    profileUrl?: string;
};

const experts: Expert[] = [
    {
        name: 'Aboudi Larbi',
        role: 'Founder & Editorial Director',
        bio: 'Leads editorial quality, product testing framework, and final publication standards for Postgenius Pro.',
        specialty: ['Affiliate content strategy', 'Editorial quality control', 'AI-assisted publishing systems'],
        profileUrl: 'https://www.linkedin.com/in/larbiaboudi/'
    },
    {
        name: 'Postgenius Research Desk',
        role: 'Research & Fact-Checking Team',
        bio: 'Verifies product claims, technical specs, and source relevance before recommendations are published.',
        specialty: ['Technical fact-checking', 'Source validation', 'Comparative product analysis']
    },
    {
        name: 'Postgenius Consumer Insights',
        role: 'Shopping Intent & UX Review',
        bio: 'Optimizes article clarity, buyer guidance, and recommendation structure to improve reader trust.',
        specialty: ['Buyer journey optimization', 'Recommendation clarity', 'Conversion-focused content UX']
    }
];

const EditorialTeamPage: React.FC = () => {
    const jsonLd = {
        '@context': 'https://schema.org',
        '@type': 'AboutPage',
        name: 'Our Editorial Team',
        url: 'https://postgeniuspro.com/editorial-team',
        mainEntity: {
            '@type': 'Organization',
            name: 'Postgenius Pro',
            member: experts.map((expert) => ({
                '@type': 'Person',
                name: expert.name,
                jobTitle: expert.role,
                description: expert.bio,
                sameAs: expert.profileUrl ? [expert.profileUrl] : undefined
            }))
        }
    };

    return (
        <>
            <Meta
                title="Our Editorial Team"
                description="Meet the Postgenius Pro editorial team and learn how our product reviews, guides, and recommendations are verified before publishing."
                path="/editorial-team"
            />
            <Helmet>
                <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>
            </Helmet>

            <div className="max-w-5xl mx-auto p-8 bg-card-bg rounded-xl shadow-2xl border border-border-color animate-fade-in text-left">
                <h1 className="text-4xl font-black text-text-headings mb-4 text-center">
                    Our <span className="chameleon-text">Editorial Team</span>
                </h1>
                <p className="text-text-secondary text-center max-w-3xl mx-auto mb-10 text-lg leading-relaxed">
                    Every article published on Postgenius Pro follows a clear editorial process: source review, factual validation,
                    recommendation quality check, and final publishing control.
                </p>

                <div className="space-y-6 mb-12">
                    {experts.map((expert) => (
                        <article key={expert.name} className="border border-border-color rounded-xl p-6 bg-background/50">
                            <div className="flex flex-col gap-2 mb-3">
                                <h2 className="text-2xl font-bold text-text-headings">{expert.name}</h2>
                                <p className="text-accent font-semibold">{expert.role}</p>
                            </div>
                            <p className="text-text-secondary mb-4">{expert.bio}</p>
                            <ul className="list-disc list-inside text-text-secondary space-y-1">
                                {expert.specialty.map((item) => (
                                    <li key={item}>{item}</li>
                                ))}
                            </ul>
                            {expert.profileUrl && (
                                <a
                                    href={expert.profileUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-block mt-4 text-accent hover:underline font-medium"
                                >
                                    View Professional Profile
                                </a>
                            )}
                        </article>
                    ))}
                </div>

                <section className="border border-border-color rounded-xl p-6 bg-background/50">
                    <h2 className="text-2xl font-bold text-text-headings mb-3">How We Review Content</h2>
                    <ol className="list-decimal list-inside text-text-secondary space-y-2">
                        <li>Source validation and intent matching.</li>
                        <li>Technical/product claim verification.</li>
                        <li>Buyer-oriented recommendation refinement.</li>
                        <li>Final editorial check before publication.</li>
                    </ol>
                </section>
            </div>
        </>
    );
};

export default EditorialTeamPage;

