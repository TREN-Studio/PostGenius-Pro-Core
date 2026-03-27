import React from 'react';
import Meta from './Meta';
import PublicPageShell, { PublicPanel } from './PublicPageShell';

const PrivacyPolicyPage: React.FC = () => {
    return (
        <>
            <Meta
                title="Privacy Policy"
                description="Read how Postgenius Pro handles reader accounts, saved reviews, tracked products, browser preferences, and membership data."
            />
            <PublicPageShell
                eyebrow="Privacy Policy"
                title="How we handle member and reader information."
                description="We keep this policy practical and publication-focused: only the information needed to operate reader accounts, saved reviews, tracked products, and related membership features."
                badges={['Reader Accounts', 'Saved Reviews', 'Membership Data']}
                align="center"
            >
                <PublicPanel className="mx-auto max-w-4xl text-left">
                    <div className="prose prose-slate max-w-none prose-p:text-lg prose-headings:font-bold prose-headings:text-[#402247] prose-a:text-[#7a477a] hover:prose-a:underline prose-strong:text-[#402247] prose-p:text-[#6b5a73] prose-li:text-[#6b5a73]">
                        <p><strong>Last Updated:</strong> {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>

                        <p>
                            This Privacy Policy explains how Postgenius Pro handles information related to reader accounts, saved collections, tracked products,
                            and general use of the publication. We aim to collect only the information needed to operate the site, membership features,
                            and related reader services.
                        </p>

                        <h3 className="text-2xl mt-8">1. Information We Collect</h3>
                        <ul>
                            <li><strong>Account Information:</strong> When you create an account, we may store information such as your name, email address, avatar, and profile details.</li>
                            <li><strong>Member Activity:</strong> We may store saved reviews, tracked products, and related membership preferences so these features work across sessions.</li>
                            <li><strong>Browser-Stored Preferences:</strong> Certain preferences, session details, and authentication data may be stored in your browser to support sign-in, settings, and continuity.</li>
                            <li><strong>Communications:</strong> If you contact us, we may keep the information you provide so we can respond and support your request.</li>
                        </ul>

                        <h3 className="text-2xl mt-8">2. How We Use Information</h3>
                        <p>We use collected information only to operate and improve the publication and its membership features, including to:</p>
                        <ul>
                            <li>Provide account access and member-only functionality.</li>
                            <li>Maintain saved reading lists, tracked products, and membership preferences.</li>
                            <li>Send requested updates, support messages, or account-related notices.</li>
                            <li>Protect the site, prevent abuse, and troubleshoot service issues.</li>
                        </ul>

                        <h3 className="text-2xl mt-8">3. Third-Party Services</h3>
                        <p>
                            Postgenius Pro uses third-party services for functions such as authentication, payments, hosting, and linked shopping destinations.
                            If you click an affiliate link, sign in with a third-party provider, or complete a payment through an external processor,
                            your interaction with that service is governed by its own policies and terms.
                        </p>

                        <h3 className="text-2xl mt-8">4. Cookies, Local Storage, and Browser Data</h3>
                        <p>
                            We may use browser storage and similar technologies to keep you signed in, remember preferences, and preserve reader settings.
                            These technologies help the site function properly and improve continuity across visits.
                        </p>

                        <h3 className="text-2xl mt-8">5. Data Retention</h3>
                        <p>
                            We retain account and membership-related information only for as long as needed to operate the service, comply with legal obligations,
                            resolve disputes, and enforce our agreements.
                        </p>

                        <h3 className="text-2xl mt-8">6. Your Choices</h3>
                        <p>
                            You may request updates to your profile information, and you may stop using membership features at any time.
                            You can also manage certain saved information directly from your account settings or browser controls.
                        </p>

                        <h3 className="text-2xl mt-8">7. Changes to This Privacy Policy</h3>
                        <p>
                            We may update this Privacy Policy from time to time. When we do, we will post the updated version on this page.
                        </p>

                        <h3 className="text-2xl mt-8">8. Contact Us</h3>
                        <p>If you have questions about this Privacy Policy, please contact us through the website contact form.</p>
                    </div>
                </PublicPanel>
            </PublicPageShell>
        </>
    );
};

export default PrivacyPolicyPage;
