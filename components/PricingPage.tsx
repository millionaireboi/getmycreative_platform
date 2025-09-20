import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext.tsx';
import { SparklesIcon, ArrowLeftIcon } from './icons.tsx';

interface PricingPageProps {
    onBack: () => void;
    onUpgrade: () => void;
}

const CheckIcon = () => (
    <svg className="w-5 h-5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
    </svg>
);

const ProIcon = () => (
    <div className="p-2 bg-gradient-to-br from-emerald-100 to-cyan-100 rounded-lg inline-block">
        <SparklesIcon className="w-6 h-6 text-emerald-500" />
    </div>
);

const Feature = ({ children }: { children: React.ReactNode }) => (
    <li className="flex items-center gap-3">
        <CheckIcon />
        <span className="text-gray-600">{children}</span>
    </li>
);

export const PricingPage = ({ onBack, onUpgrade }: PricingPageProps) => {
    const { upgradeToPro, appUser } = useAuth();
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');

    const handleUpgradeClick = async () => {
        setIsLoading(true);
        setError('');
        try {
            await upgradeToPro();
            // Show a success message briefly before navigating
            setTimeout(() => {
                onUpgrade();
            }, 1000); 
        } catch (e) {
            setError(e instanceof Error ? e.message : 'An unknown error occurred.');
            setIsLoading(false);
        }
    };
    
    return (
        <div className="container mx-auto px-4 py-8">
             <button onClick={onBack} className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 font-medium mb-8">
                <ArrowLeftIcon className="w-4 h-4" />
                Back to Feed
            </button>
            <header className="text-center mb-12">
                <h1 className="text-5xl font-extrabold text-gray-800 tracking-tight font-display">Choose Your Plan</h1>
                <p className="mt-4 text-lg text-gray-600 max-w-2xl mx-auto">
                    Unlock your creative potential. Upgrade to Pro for advanced AI features.
                </p>
            </header>

            <div className="flex justify-center items-start gap-8">
                {/* Free Plan */}
                <div className="bg-white border border-slate-200 rounded-2xl p-8 w-full max-w-sm">
                    <h2 className="text-2xl font-bold">Free</h2>
                    <p className="text-gray-500 mt-2">For individuals starting out</p>
                    <p className="text-4xl font-extrabold my-6">$0 <span className="text-lg font-medium text-gray-500">/ month</span></p>
                    <button className="w-full py-2 px-4 border border-slate-300 rounded-lg font-semibold bg-slate-50 text-gray-500">
                        Current Plan
                    </button>
                    <ul className="space-y-4 mt-8">
                        <Feature>Limited monthly AI credits</Feature>
                        <Feature>Manual editing via forms</Feature>
                        <Feature>Watermarked exports</Feature>
                        <Feature>Basic template search</Feature>
                    </ul>
                </div>

                {/* Pro Plan */}
                <div className="bg-white border-2 border-emerald-500 rounded-2xl p-8 w-full max-w-sm shadow-2xl shadow-emerald-500/10 relative">
                     <div className="absolute top-0 -translate-y-1/2 left-1/2 -translate-x-1/2">
                        <span className="bg-gradient-to-r from-emerald-500 to-cyan-500 text-white text-xs font-bold px-4 py-1 rounded-full uppercase">Most Popular</span>
                    </div>
                    <div className="flex items-center gap-4">
                        <ProIcon />
                        <h2 className="text-2xl font-bold">Pro</h2>
                    </div>
                    <p className="text-gray-500 mt-2">For professionals and teams</p>
                    <p className="text-4xl font-extrabold my-6">$29 <span className="text-lg font-medium text-gray-500">/ month</span></p>
                    <button 
                        onClick={handleUpgradeClick}
                        disabled={isLoading || !appUser}
                        className="w-full py-2 px-4 border border-transparent rounded-lg font-semibold text-white bg-emerald-500 hover:bg-emerald-600 transition-colors disabled:bg-emerald-300"
                    >
                        {isLoading ? 'Upgrading...' : 'Upgrade to Pro'}
                    </button>
                     <ul className="space-y-4 mt-8">
                        <Feature>Unlimited AI credits</Feature>
                        <Feature><span className="font-semibold">Conversational chat-based editing</span></Feature>
                        <Feature>On-brand copy generation</Feature>
                        <Feature>Premium templates &amp; assets</Feature>
                        <Feature>Priority, watermark-free exports</Feature>
                    </ul>
                </div>
            </div>
             {error && <p className="text-center text-red-600 mt-4">{error}</p>}
        </div>
    );
};
