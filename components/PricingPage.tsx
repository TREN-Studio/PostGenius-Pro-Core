import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Check } from 'lucide-react';
import Meta from './Meta';
import PublicPageShell, { PublicPanel } from './PublicPageShell';

const PricingCard: React.FC<{
    plan: string;
    price: string;
    description: string;
    features: string[];
    userId?: string;
    isPopular?: boolean;
}> = ({ plan, price, description, features, userId, isPopular = false }) => {
    const PAYPAL_BUSINESS_EMAIL = 'larbilife@gmail.com';

    const subscriptionLink = useMemo(() => {
        if (plan === 'Pro' || plan === 'Premium') {
            const planName = encodeURIComponent(`Postgenius Pro - ${plan} Membership`);
            const planPrice = price.replace('$', '');
            const returnUrl = encodeURIComponent(`${window.location.origin}/success?plan=${plan}&uid=${userId || ''}`);
            const custom = userId || 'unknown';
            return `https://www.paypal.com/cgi-bin/webscr?cmd=_xclick-subscriptions&business=${PAYPAL_BUSINESS_EMAIL}&item_name=${planName}&currency_code=USD&a3=${planPrice}&p3=1&t3=M&src=1&rm=1&return=${returnUrl}&custom=${custom}`;
        }
        return '#';
    }, [plan, price, userId]);

    return (
        <div
            className={`relative rounded-[2rem] border p-7 shadow-[0_22px_55px_rgba(90,49,96,0.08)] transition-all duration-300 ${
                isPopular
                    ? 'border-[#c79ec6] bg-gradient-to-br from-[#fff8fc] to-[#f3f9ff]'
                    : 'border-[#ead9e7] bg-white'
            }`}
        >
            {isPopular && (
                <div className="absolute right-6 top-6 rounded-full border border-[#d6b5d5] bg-white px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#7a477a]">
                    Reader Favorite
                </div>
            )}

            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#7a477a]">Membership</p>
            <h3 className="mt-3 text-3xl font-black tracking-[-0.03em] text-[#402247]">{plan}</h3>
            <p className="mt-3 text-sm leading-relaxed text-[#6b5a73] sm:text-base">{description}</p>
            <p className="mt-6">
                <span className="text-5xl font-black tracking-[-0.04em] text-[#402247]">{price}</span>
                {price !== 'Free' && price !== 'Custom' && <span className="ml-2 text-base font-medium text-[#7a6b82]">/month</span>}
            </p>

            <div className="mt-6">
                {plan === 'Starter' ? (
                    <Link to={userId ? '/profile' : '/signup'} className="cta-button block w-full text-center text-lg">
                        {userId ? 'Open My Profile' : 'Join Free'}
                    </Link>
                ) : (plan === 'Pro' || plan === 'Premium') ? (
                    <a
                        href={subscriptionLink}
                        target={userId ? '_blank' : '_self'}
                        onClick={() => !userId && alert('Please login first to subscribe')}
                        rel="noopener noreferrer"
                        className="cta-button block w-full text-center text-lg"
                    >
                        Upgrade Membership
                    </a>
                ) : (
                    <Link to="/contact" className="secondary-button block w-full text-center text-lg">
                        Contact Editorial Team
                    </Link>
                )}
            </div>

            <ul className="mt-8 space-y-4">
                {features.map((feature) => (
                    <li key={feature} className="flex gap-3 text-sm leading-relaxed text-[#5f4c68] sm:text-base">
                        <Check className="mt-0.5 h-5 w-5 flex-shrink-0 text-[#7a477a]" />
                        <span>{feature}</span>
                    </li>
                ))}
            </ul>
        </div>
    );
};

interface PricingPageProps {
    session: any;
}

const PricingPage: React.FC<PricingPageProps> = ({ session }) => {
    const userId = session?.user?.id;

    return (
        <>
            <Meta
                title="Reader Membership"
                description="Choose a Postgenius Pro reader membership for saved reading lists, tracked products, and member alerts."
            />
            <PublicPageShell
                eyebrow="Membership"
                title="Choose the reader membership that fits how you shop."
                description="Membership is designed around reading lists, tracked products, and gentle editorial alerts, not software seats or tool access."
                badges={['Free Reader Tier', 'Tracked Products', 'Member Alerts']}
                aside={
                    <PublicPanel className="bg-white/90">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#7a477a]">What Membership Unlocks</p>
                        <h2 className="mt-3 text-2xl font-black leading-tight text-[#402247]">Stay close to the categories, picks, and price changes that matter to you.</h2>
                        <p className="mt-4 text-sm leading-relaxed text-[#6b5a73]">
                            Reader membership focuses on continuity: saved reviews, tracked products, shortlist workflows, and richer update streams across many niches.
                        </p>
                    </PublicPanel>
                }
            >
                <section className="grid gap-6 lg:grid-cols-3">
                    <PricingCard
                        plan="Starter"
                        userId={userId}
                        price="Free"
                        description="For readers who want a saved reading list and a simple shortlist workflow."
                        features={[
                            'Saved reading list',
                            'Tracked products',
                            'Weekly editorial updates',
                            'Access to every buying guide',
                            'Simple shortlist workflow',
                            'Community support'
                        ]}
                    />
                    <PricingCard
                        plan="Pro"
                        userId={userId}
                        price="$12"
                        description="For active shoppers following multiple categories, picks, and pricing changes."
                        features={[
                            'Everything in Starter',
                            'Priority member alerts',
                            'Extended tracked-product limits',
                            'Category-specific update streams',
                            'Early access to featured reviews',
                            'Priority email support'
                        ]}
                    />
                    <PricingCard
                        plan="Premium"
                        userId={userId}
                        price="$17"
                        description="For readers managing larger watchlists and faster product tracking windows."
                        features={[
                            'Everything in Pro',
                            'High-frequency alert windows',
                            'Advanced watchlist segmentation',
                            'Monthly shopper insight digest',
                            'Priority support lane',
                            'VIP editorial previews',
                            'Premium member badge'
                        ]}
                        isPopular={true}
                    />
                </section>
            </PublicPageShell>
        </>
    );
};

export default PricingPage;
