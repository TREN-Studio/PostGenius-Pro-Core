import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ArrowRight, CheckCircle } from 'lucide-react';
import Meta from './Meta';

interface SuccessPageProps {
    session: any;
}

const SuccessPage: React.FC<SuccessPageProps> = ({ session }) => {
    const location = useLocation();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const params = new URLSearchParams(location.search);
        const uid = params.get('uid') || session?.user?.id;
        const plan = params.get('plan')?.toLowerCase();

        if (!uid || !plan) {
            setLoading(false);
            setError('Missing transaction details. If you just paid, please contact support.');
            return;
        }

        const updateSubscription = async () => {
            try {
                const response = await fetch('/api/subscription.php?action=update_tier', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        user_id: uid,
                        subscription_tier: plan,
                    }),
                });

                const data = await response.json();
                if (data.status !== 'success') {
                    setError(data.error || 'Failed to upgrade your account. Please refresh or contact support.');
                }
            } catch {
                setError('Connection error. Please check your internet and try again.');
            } finally {
                setLoading(false);
            }
        };

        updateSubscription();
    }, [location.search, session]);

    return (
        <div className="min-h-[80vh] flex items-center justify-center p-6 sm:p-12 relative overflow-hidden">
            <Meta title="Subscription Successful" description="Thank you for subscribing to PostGenius Pro. Your account is now upgraded." />

            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full pointer-events-none opacity-20">
                <div className="absolute top-[-10%] left-[-10%] w-96 h-96 bg-accent rounded-full blur-[120px] animate-pulse"></div>
                <div className="absolute bottom-[-10%] right-[-10%] w-96 h-96 bg-purple-600 rounded-full blur-[120px] animate-pulse" style={{ animationDelay: '2s' }}></div>
            </div>

            <div className="max-w-xl w-full bg-card-bg/60 backdrop-blur-3xl border border-white/10 rounded-[2.5rem] p-8 sm:p-12 shadow-2xl relative z-10 animate-in fade-in zoom-in-95 duration-700">
                {loading ? (
                    <div className="text-center space-y-6 py-12">
                        <div className="relative inline-block">
                            <div className="w-20 h-20 rounded-full border-4 border-accent/20 border-t-accent animate-spin"></div>
                            <div className="absolute inset-0 flex items-center justify-center font-black text-accent text-xl">PGP</div>
                        </div>
                        <h2 className="text-2xl font-black text-text-headings tracking-tight">Finalizing Your Account...</h2>
                        <p className="text-text-secondary text-lg">We are applying your subscription upgrade.</p>
                    </div>
                ) : error ? (
                    <div className="text-center space-y-8">
                        <h2 className="text-3xl font-black text-text-headings tracking-tight leading-tight">Something Went Wrong</h2>
                        <p className="text-red-400 bg-red-500/10 p-4 rounded-2xl font-medium border border-red-500/20">{error}</p>
                        <div className="flex flex-col gap-4">
                            <button onClick={() => window.location.reload()} className="cta-button py-4 text-lg">Try Again</button>
                            <Link to="/contact" className="text-text-secondary hover:text-white font-bold uppercase tracking-widest text-xs">Contact Support</Link>
                        </div>
                    </div>
                ) : (
                    <div className="text-center space-y-10">
                        <div>
                            <div className="inline-flex items-center justify-center w-24 h-24 rounded-full bg-green-500/10 border-4 border-green-500/20 mb-6 animate-bounce">
                                <CheckCircle className="w-12 h-12 text-green-500" />
                            </div>
                            <h2 className="text-4xl font-black text-text-headings tracking-tight leading-tight mb-4">Payment <span className="text-green-500">Successful!</span></h2>
                            <p className="text-text-secondary text-lg leading-relaxed">Your account has been upgraded and is ready to use.</p>
                        </div>

                        <div className="pt-6 border-t border-white/5 flex flex-col gap-4">
                            <Link to="/dashboard" className="cta-button py-5 text-xl flex items-center justify-center gap-3 group shadow-[0_20px_50px_rgba(59,130,246,0.3)]">
                                <span>GO TO DASHBOARD</span>
                                <ArrowRight className="w-6 h-6 group-hover:translate-x-2 transition-transform" />
                            </Link>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default SuccessPage;
