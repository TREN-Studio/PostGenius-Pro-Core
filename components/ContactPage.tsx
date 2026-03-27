import React, { useState, useMemo } from 'react';
import Meta from './Meta';
import { api } from '../services/apiClient';
import PublicPageShell, { PublicPanel } from './PublicPageShell';

const ContactPage: React.FC = () => {
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [message, setMessage] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isSubmitted, setIsSubmitted] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const isFormValid = useMemo(() => {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return name.trim() !== '' && emailRegex.test(email) && message.trim() !== '';
    }, [name, email, message]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!isFormValid) {
            setError("Please fill out all fields with valid information.");
            return;
        }

        setIsSubmitting(true);
        setError(null);

        try {
            await api.post('/contact.php', { name, email, message });
            setIsSubmitted(true);
            // Reset form
            setName('');
            setEmail('');
            setMessage('');
        } catch (err: any) {
            console.error('Contact form error:', err);
            setError('Failed to send message. Please try emailing larbilife@gmail.com directly.');
        } finally {
            setIsSubmitting(false);
        }
    };

    if (isSubmitted) {
        return (
            <>
                <Meta
                    title="Message Sent"
                    description="Your message has been sent successfully."
                />
                <PublicPageShell
                    eyebrow="Contact"
                    title="Thanks for reaching out."
                    description="Your message is in the queue. We will get back to you as soon as possible."
                    align="center"
                >
                    <PublicPanel className="mx-auto max-w-2xl text-center">
                        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
                            <svg className="h-8 w-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                        </div>
                        <h2 className="text-3xl font-black text-[#402247]">Message Sent</h2>
                        <p className="mt-3 text-base leading-relaxed text-[#6b5a73]">
                            Thank you for reaching out. We will review your message and reply as soon as possible.
                        </p>
                        <button onClick={() => setIsSubmitted(false)} className="secondary-button mt-6">
                            Send Another Message
                        </button>
                    </PublicPanel>
                </PublicPageShell>
            </>
        );
    }

    return (
        <>
            <Meta
                title="Contact Us"
                description="Get in touch with the Postgenius Pro team. We welcome questions, feedback, suggestions, and partnership inquiries."
            />
            <PublicPageShell
                eyebrow="Contact"
                title="Questions, partnerships, or feedback? We would love to hear from you."
                description="Reach out to the Postgenius Pro team for support, editorial questions, partnership inquiries, or general feedback about the publication."
                badges={['Support', 'Editorial Questions', 'Partnerships']}
                aside={
                    <PublicPanel className="bg-white/88">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#7a477a]">Response Promise</p>
                        <h2 className="mt-3 text-2xl font-black leading-tight text-[#402247]">We keep support and publication feedback in the same calm, reader-first tone as the rest of the site.</h2>
                        <p className="mt-4 text-sm leading-relaxed text-[#6b5a73]">
                            Use the form for editorial feedback, business inquiries, corrections, or partnership requests. If the form fails, you can email larbilife@gmail.com directly.
                        </p>
                    </PublicPanel>
                }
            >
                <PublicPanel className="mx-auto max-w-3xl">
                    {error && (
                        <div className="mb-6 rounded-[1.25rem] border border-red-200 bg-red-50 p-4 text-red-700">
                            {error}
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-5">
                        <div>
                            <label htmlFor="name" className="mb-2 block text-sm font-semibold uppercase tracking-[0.14em] text-[#7a477a]">Full Name</label>
                            <input
                                type="text"
                                name="name"
                                id="name"
                                required
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                className="w-full text-lg app-input"
                            />
                        </div>
                        <div>
                            <label htmlFor="email" className="mb-2 block text-sm font-semibold uppercase tracking-[0.14em] text-[#7a477a]">Email Address</label>
                            <input
                                type="email"
                                name="email"
                                id="email"
                                required
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="w-full text-lg app-input"
                            />
                        </div>
                        <div>
                            <label htmlFor="message" className="mb-2 block text-sm font-semibold uppercase tracking-[0.14em] text-[#7a477a]">Message</label>
                            <textarea
                                name="message"
                                id="message"
                                rows={5}
                                required
                                value={message}
                                onChange={(e) => setMessage(e.target.value)}
                                className="w-full resize-none text-lg app-input"
                            ></textarea>
                        </div>
                        <button
                            type="submit"
                            disabled={!isFormValid || isSubmitting}
                            className={`w-full cta-button text-lg ${(!isFormValid || isSubmitting) ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                            {isSubmitting ? (
                                <span className="flex items-center justify-center gap-2">
                                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                                    Sending...
                                </span>
                            ) : (
                                'Send Message'
                            )}
                        </button>
                    </form>
                </PublicPanel>
            </PublicPageShell>
        </>
    );
};

export default ContactPage;
