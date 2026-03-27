import React, { useState, useMemo } from 'react';

const DonatePage: React.FC = () => {
    const [amount, setAmount] = useState('5.00');
    const PAYPAL_BUSINESS_EMAIL = 'larbilife@gmail.com';

    const donationLink = useMemo(() => {
        const donationAmount = parseFloat(amount) || 5.00;
        const itemName = encodeURIComponent("Donation to Postgenius Pro");
        return `https://www.paypal.com/donate/?business=${PAYPAL_BUSINESS_EMAIL}&amount=${donationAmount.toFixed(2)}&currency_code=USD&item_name=${itemName}`;
    }, [amount]);

    return (
        <div className="max-w-2xl mx-auto p-8 bg-card-bg rounded-xl shadow-2xl border border-border-color animate-fade-in">
            <h2 className="text-4xl font-black text-text-headings mb-2 text-center">Support <span className="chameleon-text">Our Work</span></h2>
            
            <p className="text-text-secondary mb-8 text-center text-lg">
                If you find this tool useful, please consider supporting its development. Your contribution helps us improve the service and keep it running.
            </p>
            <div className="text-center">
                 <div className="max-w-xs mx-auto">
                    <label htmlFor="donation-amount" className="block text-lg font-medium text-text-primary mb-2">Choose an amount (USD)</label>
                    <div className="relative">
                         <span className="absolute left-3 top-1/2 -translate-y-1/2 text-2xl font-bold text-text-secondary">$</span>
                         <input
                            type="number"
                            id="donation-amount"
                            name="donation-amount"
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                            min="1"
                            step="1"
                            className="w-full text-2xl font-bold app-input text-center !py-2"
                         />
                    </div>
                    <div className="mt-4">
                        <a
                            href={donationLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="w-full block text-center cta-button text-lg"
                        >
                            Donate with PayPal
                        </a>
                    </div>
                    <p className="text-xs text-text-secondary text-center mt-2">
                        You will be redirected to PayPal to complete your donation.
                    </p>
                </div>
            </div>
        </div>
    );
};

export default DonatePage;