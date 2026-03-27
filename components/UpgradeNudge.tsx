
import React from 'react';
import { Link } from 'react-router-dom';

interface UpgradeNudgeProps {
    limit: number;
}

const UpgradeNudge: React.FC<UpgradeNudgeProps> = ({ limit }) => {
    return (
        <div className="text-center p-8 bg-card-bg rounded-xl shadow-2xl border border-border-color animate-fade-in">
            <h2 className="text-4xl md:text-5xl font-black text-text-headings mb-3 tracking-tight">
                You've Used Your <span className="chameleon-text">Free Articles</span>
            </h2>
            <p className="text-text-secondary mb-4 text-lg max-w-2xl mx-auto">
                Great job! You've created {limit} amazing articles with the free plan.
            </p>
            <p className="text-text-primary mb-8 text-base max-w-2xl mx-auto">
                To keep creating high-quality content, upgrade to one of our affordable plans:<br />
                <strong className="text-accent">Pro ($12/month)</strong> for 200 articles or <strong className="text-accent">Premium ($17/month)</strong> for 500 articles.
            </p>
            <Link
                to="/pricing"
                className="cta-button text-lg px-8 py-3"
            >
                View Pricing Plans
            </Link>
        </div>
    );
};

export default UpgradeNudge;