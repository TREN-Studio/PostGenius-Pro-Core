import React from 'react';
import Meta from './Meta';
import PublicPageShell, { PublicPanel } from './PublicPageShell';

const AffiliateDisclosurePage: React.FC = () => {
    return (
        <>
            <Meta
                title="Affiliate Disclosure"
                description="Learn about Postgenius Pro's use of affiliate links and our commitment to transparency with our readers."
            />
            <PublicPageShell
                eyebrow="Affiliate Disclosure"
                title="How affiliate links support the publication."
                description="Transparency matters. This page explains how affiliate links work on Postgenius Pro and how monetization fits into a reader-first editorial model."
                badges={['Transparency', 'Affiliate Links', 'Reader Trust']}
                align="center"
            >
                <PublicPanel className="mx-auto max-w-4xl text-left">
                    <div className="prose prose-slate max-w-none prose-p:text-lg prose-headings:font-bold prose-headings:text-[#402247] prose-a:text-[#7a477a] hover:prose-a:underline prose-strong:text-[#402247] prose-p:text-[#6b5a73] prose-li:text-[#6b5a73]">
                        <p><strong>Last Updated:</strong> {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>

                        <p>
                            Transparency is important to us at Postgenius Pro. Our goal is to provide valuable reviews, comparisons, and buying guidance to help readers make more confident purchase decisions. To support the publication, we participate in affiliate marketing programs.
                        </p>

                        <h3 className="text-2xl mt-8">What Are Affiliate Links?</h3>
                        <p>
                            Affiliate links are special URLs that contain a tracking code. When you click one of these links and make a purchase, the retailer may pay us a commission. This comes at <strong>no additional cost to you</strong>.
                        </p>
                        <p>
                            The price you pay for a product or service is the same whether you use our affiliate link or go directly to the retailer.
                        </p>

                        <h3 className="text-2xl mt-8">Our Commitment to Honesty</h3>
                        <p>
                            Participation in affiliate programs does not determine the opinions we publish. We aim to recommend products and categories that are useful to readers, and we try to present those recommendations clearly and honestly.
                        </p>

                        <h3 className="text-2xl mt-8">Amazon Associates Program</h3>
                        <p>
                            Postgenius Pro is a participant in the Amazon Services LLC Associates Program, an affiliate advertising program designed to provide a means for sites to earn advertising fees by advertising and linking to Amazon.com and affiliated sites.
                        </p>
                        <p>
                            As an Amazon Associate, we earn from qualifying purchases.
                        </p>

                        <h3 className="text-2xl mt-8">Why This Matters</h3>
                        <p>
                            Affiliate revenue helps support the publication and allows us to keep building editorial content, buying guides, and review workflows for readers across many product niches.
                        </p>

                        <h3 className="text-2xl mt-8">Contact Us</h3>
                        <p>
                            If you have any questions regarding this disclosure, please do not hesitate to <a href="/contact">contact us</a>.
                        </p>
                    </div>
                </PublicPanel>
            </PublicPageShell>
        </>
    );
};

export default AffiliateDisclosurePage;
