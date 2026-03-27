import React from 'react';
import Meta from './Meta';
import PublicPageShell, { PublicPanel } from './PublicPageShell';

const TermsOfServicePage: React.FC = () => {
    return (
        <>
            <Meta
                title="Terms of Service"
                description="Review the terms for using Postgenius Pro, including reader accounts, membership features, affiliate links, and third-party services."
            />
            <PublicPageShell
                eyebrow="Terms of Service"
                title="The terms that govern use of the publication and its membership features."
                description="These terms are written to cover how readers use Postgenius Pro, how accounts and saved features work, and how external shopping links and services fit into the experience."
                badges={['Accounts', 'Membership', 'Affiliate Links']}
                align="center"
            >
                <PublicPanel className="mx-auto max-w-4xl text-left">
                    <div className="prose prose-slate max-w-none prose-p:text-lg prose-headings:font-bold prose-headings:text-[#402247] prose-a:text-[#7a477a] hover:prose-a:underline prose-strong:text-[#402247] prose-p:text-[#6b5a73] prose-li:text-[#6b5a73]">
                        <p><strong>Last Updated:</strong> {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>

                        <p>
                            By accessing or using Postgenius Pro (the "Service"), you agree to be bound by these Terms of Service ("Terms").
                            If you do not agree with these Terms, please do not use the Service.
                        </p>

                        <h3 className="text-2xl mt-8">1. Use of the Service</h3>
                        <p>
                            You agree to use the Service only for lawful purposes. You are responsible for your account activity, any information you submit,
                            and for ensuring you have the rights or permissions required for materials you choose to manage through the Service.
                        </p>

                        <h3 className="text-2xl mt-8">2. Accounts and Membership Features</h3>
                        <p>
                            Certain areas of the Service may require an account. You are responsible for maintaining the confidentiality of your account credentials
                            and for all activity that occurs under your account. Membership features may include saved reviews, tracked products, alerts,
                            and other reader features made available from time to time.
                        </p>

                        <h3 className="text-2xl mt-8">3. Third-Party Services and Linked Destinations</h3>
                        <p>
                            The Service may link to third-party shopping platforms, payment processors, sign-in providers, or other external services.
                            Your use of those services is governed by their own terms and policies, and we are not responsible for their content, pricing,
                            availability, or practices.
                        </p>

                        <h3 className="text-2xl mt-8">4. Editorial Content and Purchase Decisions</h3>
                        <p>
                            Postgenius Pro publishes reviews, comparisons, and buying guidance for informational purposes. Product details, pricing, availability,
                            and merchant policies may change without notice. You are responsible for reviewing the final product information and retailer terms before making a purchase.
                        </p>

                        <h3 className="text-2xl mt-8">5. Intellectual Property</h3>
                        <p>
                            The Service and its original content, branding, design, and functionality remain the property of Postgenius Pro and its licensors.
                            Except as otherwise stated, no part of the Service may be copied, reproduced, or distributed without permission.
                        </p>

                        <h3 className="text-2xl mt-8">6. Disclaimer of Warranties</h3>
                        <p>
                            The Service is provided on an "AS IS" and "AS AVAILABLE" basis. We do not guarantee uninterrupted availability, complete accuracy,
                            or error-free operation, and we disclaim warranties to the fullest extent permitted by law.
                        </p>

                        <h3 className="text-2xl mt-8">7. Limitation of Liability</h3>
                        <p>
                            To the fullest extent permitted by law, Postgenius Pro and its affiliates will not be liable for any indirect, incidental, special,
                            consequential, or punitive damages arising out of or related to your access to, use of, or inability to use the Service.
                        </p>

                        <h3 className="text-2xl mt-8">8. Governing Law</h3>
                        <p>
                            These Terms are governed by the laws of the jurisdiction in which the owner of the Service resides, without regard to conflict of law principles.
                        </p>

                        <h3 className="text-2xl mt-8">9. Changes to These Terms</h3>
                        <p>
                            We may update these Terms from time to time. When we do, we will post the updated version on this page.
                        </p>

                        <h3 className="text-2xl mt-8">10. Contact Us</h3>
                        <p>If you have questions about these Terms, please contact us through the website contact form.</p>
                    </div>
                </PublicPanel>
            </PublicPageShell>
        </>
    );
};

export default TermsOfServicePage;
