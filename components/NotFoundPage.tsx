
import React from 'react';
import { Link } from 'react-router-dom';
import Meta from './Meta';

const NotFoundPage: React.FC = () => {
    return (
        <>
            <Meta 
                title="404 - Page Not Found"
                description="Sorry, the page you are looking for could not be found. Return to the magazine homepage."
            />
            <div className="flex flex-col items-center justify-center text-center p-8 bg-card-bg rounded-xl shadow-2xl border border-border-color min-h-[70vh]">
                <div className="max-w-xl w-full">
                    <svg width="100%" height="auto" viewBox="0 0 520 300" fill="none" xmlns="http://www.w3.org/2000/svg" className="mb-8" aria-hidden="true">
                        <rect x="180" y="30" width="300" height="200" stroke="#374151" strokeWidth="2"/>
                        <path d="M160 0V300" stroke="#374151" strokeWidth="2"/>
                        <path d="M340 0V300" stroke="#374151" strokeWidth="2"/>
                        <path d="M0 150H520" stroke="#374151" strokeWidth="2"/>
                        <circle cx="192" cy="42" r="4" fill="#4B5563"/>
                        <circle cx="208" cy="42" r="4" fill="#4B5563"/>
                        <circle cx="224" cy="42" r="4" fill="#4B5563"/>
                        <text x="330" y="140" fontFamily="'Inter', sans-serif" fontWeight="900" fontSize="80" fill="var(--color-card-bg)" stroke="var(--color-text-secondary)" strokeWidth="2" textAnchor="middle">404</text>
                        <path d="M180 230L480 30" stroke="#374151" strokeWidth="2"/>
                        <path d="M340 230L480 150" stroke="#374151" strokeWidth="2"/>
                        <path d="M180 60L340 230H180V60Z" fill="var(--color-accent)" fillOpacity="0.3"/>
                        <path d="M100 150C100 110 200 110 260 190" stroke="var(--color-cta)" strokeWidth="16" strokeLinecap="round"/>
                        <rect x="420" y="180" width="60" height="20" fill="var(--color-cta)" transform="rotate(-30 420 180)"/>
                    </svg>

                    <h1 className="text-3xl md:text-4xl font-black text-text-headings mb-4">
                        This Page Does Not Exist
                    </h1>
                    <p className="text-lg text-text-secondary max-w-md mx-auto mb-8">
                        Sorry, the page you are looking for could not be found. Let&apos;s get you back to the latest reviews and buying guides.
                    </p>
                    <Link
                        to="/"
                        className="cta-button text-lg"
                    >
                        Back to Magazine
                    </Link>
                </div>
            </div>
        </>
    );
};

export default NotFoundPage;
