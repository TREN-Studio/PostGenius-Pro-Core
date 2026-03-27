import React, { useState } from 'react';
import { Shield, Send, CheckCircle2 } from 'lucide-react';
import { api } from '../services/apiClient';

interface PremiumSupportFormProps {
    userEmail?: string;
    userName?: string;
}

const PremiumSupportForm: React.FC<PremiumSupportFormProps> = ({ userEmail = '', userName = '' }) => {
    const [formData, setFormData] = useState({
        name: userName,
        email: userEmail,
        subject: '',
        message: '',
        priority: 'high' as 'high' | 'urgent'
    });
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isSubmitted, setIsSubmitted] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        setError(null);

        try {
            await api.post('/support.php', formData);

            // Show success
            setTimeout(() => {
                setIsSubmitted(true);
                setIsSubmitting(false);
            }, 500);
        } catch (err: any) {
            console.error(err);
            // Fallback to mailto if API fails
            const subject = encodeURIComponent(`[PREMIUM SUPPORT] ${formData.subject}`);
            const body = encodeURIComponent(
                `Priority: ${formData.priority.toUpperCase()}\n` +
                `From: ${formData.name} (${formData.email})\n\n` +
                `Message:\n${formData.message}\n\n` +
                `---\n` +
                `This is a Premium Support request.`
            );
            window.location.href = `mailto:larbilife@gmail.com?subject=${subject}&body=${body}`;

            // Still show success as we opened the client
            setIsSubmitted(true);
            setIsSubmitting(false);
        }
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        setFormData(prev => ({
            ...prev,
            [e.target.name]: e.target.value
        }));
    };

    if (isSubmitted) {
        return (
            <div className="max-w-2xl mx-auto p-8 bg-card-bg rounded-xl border border-border-color animate-fade-in">
                <div className="text-center">
                    <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto mb-4" />
                    <h2 className="text-2xl font-bold text-text-headings mb-2">Support Request Sent!</h2>
                    <p className="text-text-secondary mb-6">
                        Your premium support request has been created. Our team will respond within 2-4 hours.
                    </p>
                    <button
                        onClick={() => {
                            setIsSubmitted(false);
                            setFormData(prev => ({ ...prev, subject: '', message: '' }));
                        }}
                        className="secondary-button"
                    >
                        Send Another Request
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-2xl mx-auto p-8 bg-card-bg rounded-xl border border-border-color animate-fade-in">
            {/* Premium Badge */}
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-cta to-accent text-white text-sm font-bold mb-6">
                <Shield className="w-4 h-4" />
                Premium Support
            </div>

            <h2 className="text-3xl font-bold text-text-headings mb-2">Priority Support</h2>
            <p className="text-text-secondary mb-8">
                As a Premium member, you receive priority support with responses within 2-4 hours during business hours.
            </p>

            {error && (
                <div className="mb-6 p-4 bg-red-900/20 border border-red-500/50 rounded-lg text-red-400">
                    {error}
                </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <label className="block text-sm font-semibold text-text-primary mb-2">
                            Your Name
                        </label>
                        <input
                            type="text"
                            name="name"
                            value={formData.name}
                            onChange={handleChange}
                            required
                            className="w-full px-4 py-3 bg-secondary-bg border border-border-color rounded-lg text-text-primary focus:ring-2 focus:ring-accent focus:border-transparent transition-all"
                            placeholder="John Doe"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-semibold text-text-primary mb-2">
                            Email Address
                        </label>
                        <input
                            type="email"
                            name="email"
                            value={formData.email}
                            onChange={handleChange}
                            required
                            className="w-full px-4 py-3 bg-secondary-bg border border-border-color rounded-lg text-text-primary focus:ring-2 focus:ring-accent focus:border-transparent transition-all"
                            placeholder="john@example.com"
                        />
                    </div>
                </div>

                <div>
                    <label className="block text-sm font-semibold text-text-primary mb-2">
                        Priority Level
                    </label>
                    <select
                        name="priority"
                        value={formData.priority}
                        onChange={handleChange}
                        className="w-full px-4 py-3 bg-secondary-bg border border-border-color rounded-lg text-text-primary focus:ring-2 focus:ring-accent focus:border-transparent transition-all"
                    >
                        <option value="high">High - Response within 4 hours</option>
                        <option value="urgent">Urgent - Response within 2 hours</option>
                    </select>
                </div>

                <div>
                    <label className="block text-sm font-semibold text-text-primary mb-2">
                        Subject
                    </label>
                    <input
                        type="text"
                        name="subject"
                        value={formData.subject}
                        onChange={handleChange}
                        required
                        className="w-full px-4 py-3 bg-secondary-bg border border-border-color rounded-lg text-text-primary focus:ring-2 focus:ring-accent focus:border-transparent transition-all"
                        placeholder="Brief description of your issue"
                    />
                </div>

                <div>
                    <label className="block text-sm font-semibold text-text-primary mb-2">
                        Message
                    </label>
                    <textarea
                        name="message"
                        value={formData.message}
                        onChange={handleChange}
                        required
                        rows={6}
                        className="w-full px-4 py-3 bg-secondary-bg border border-border-color rounded-lg text-text-primary focus:ring-2 focus:ring-accent focus:border-transparent transition-all resize-none"
                        placeholder="Describe your issue in detail..."
                    />
                </div>

                <div className="flex items-center gap-4">
                    <button
                        type="submit"
                        disabled={isSubmitting}
                        className="cta-button flex items-center gap-2"
                    >
                        {isSubmitting ? (
                            <>
                                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                Sending...
                            </>
                        ) : (
                            <>
                                <Send className="w-5 h-5" />
                                Send Priority Request
                            </>
                        )}
                    </button>
                </div>
            </form>

            <div className="mt-8 p-4 bg-accent/10 border border-accent/20 rounded-lg">
                <p className="text-sm text-text-secondary">
                    <strong className="text-accent">Premium Response Times:</strong> High priority tickets receive responses within 4 hours, urgent tickets within 2 hours during business hours (9 AM - 6 PM EST, Monday-Friday).
                </p>
            </div>
        </div>
    );
};

export default PremiumSupportForm;
