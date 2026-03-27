import React from 'react';
import Meta from './Meta';
import PublicPageShell, { PublicPanel } from './PublicPageShell';

const FaqItem: React.FC<{ question: string; children: React.ReactNode }> = ({ question, children }) => (
    <details className="group rounded-[1.6rem] border border-[#eadce7] bg-white p-6 transition-all duration-300 hover:border-[#c79ec6]">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-xl font-black text-[#402247]">
            {question}
            <span className="text-[#7a477a] transition-transform duration-300 group-open:rotate-180">
                <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path>
                </svg>
            </span>
        </summary>
        <div className="mt-4 text-base leading-relaxed text-[#6b5a73]">
            {children}
        </div>
    </details>
);

const FaqPage: React.FC = () => {
    return (
        <>
            <Meta
                title="Frequently Asked Questions"
                description="Find answers about Postgenius Pro membership, saved collections, tracked products, editorial standards, and publication updates."
            />
            <PublicPageShell
                eyebrow="FAQ"
                title="Common questions about the publication, membership, and shopping workflow."
                description="These answers cover how Postgenius Pro works for readers, how membership fits in, and how the publication approaches reviews, comparisons, and affiliate links."
                badges={['Membership', 'Editorial Standards', 'Reader Support']}
                align="center"
            >
                <PublicPanel className="mx-auto max-w-4xl">
                    <div className="space-y-4">
                        <FaqItem question="What is Postgenius Pro today?">
                            <p>
                                Postgenius Pro is a multi-category review publication focused on trusted Amazon recommendations, practical buying guides, and clear comparison content.
                            </p>
                        </FaqItem>

                        <FaqItem question="Why should I create an account?">
                            <p>
                                Member accounts let you save reviews, track favorite products, and manage curated alerts from one profile.
                            </p>
                        </FaqItem>

                        <FaqItem question="Is membership free?">
                            <p>
                                Yes. You can create a free account to unlock core member features and receive curated shopper updates.
                            </p>
                        </FaqItem>

                        <FaqItem question="Who can access the private editorial workspace?">
                            <p>
                                Editorial workspace access and admin controls are private and restricted to the owner account only.
                            </p>
                        </FaqItem>

                        <FaqItem question="How does the publication make money?">
                            <p>
                                Revenue comes from affiliate links and selected ad placements. This supports the publication while keeping access open for readers.
                            </p>
                        </FaqItem>

                        <FaqItem question="How often are reviews and guides updated?">
                            <p>
                                Articles are refreshed continuously based on product trends, pricing changes, and seasonal demand signals.
                            </p>
                        </FaqItem>
                    </div>
                </PublicPanel>
            </PublicPageShell>
        </>
    );
};

export default FaqPage;
