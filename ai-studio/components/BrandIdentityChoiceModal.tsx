
import React, { useState, useEffect } from 'react';
import { CloseIcon } from './icons.tsx';

interface BrandIdentityChoiceModalProps {
    onGenerate: () => void;
    onUpload: () => void;
    onClose: () => void;
}

const BrandIdentityChoiceModal: React.FC<BrandIdentityChoiceModalProps> = ({ onGenerate, onUpload, onClose }) => {
    const [show, setShow] = useState(false);

    useEffect(() => {
        setShow(true);
    }, []);
    
    const handleClose = () => {
        setShow(false);
        setTimeout(onClose, 300);
    };

    return (
        <div 
            className={`fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 backdrop-blur-md transition-opacity duration-300 ${show ? 'opacity-100' : 'opacity-0'}`}
            onClick={handleClose}
        >
            <div 
                className={`w-full max-w-2xl transform rounded-3xl border border-slate-200/60 bg-white/95 p-6 shadow-[var(--ai-shadow-strong)] transition-all duration-300 ${show ? 'scale-100 opacity-100' : 'scale-95 opacity-0'}`}
                onClick={e => e.stopPropagation()}
            >
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-semibold text-slate-900">Brand Identity</h2>
                    <button onClick={handleClose} className="text-slate-400 hover:text-slate-600 transition-colors">
                        <CloseIcon />
                    </button>
                </div>
                <p className="text-sm text-slate-500 mb-6">How would you like to define your brand identity?</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <button
                        onClick={onGenerate}
                        className="group rounded-2xl border border-slate-200 bg-white p-6 text-left transition-all hover:-translate-y-1 hover:border-emerald-200 hover:shadow-lg"
                    >
                        <h3 className="text-lg font-semibold text-slate-900">🤖 Generate with AI</h3>
                        <p className="mt-1 text-sm text-slate-500">Provide a concept and let our AI generate a logo, palette, and copy for you.</p>
                    </button>
                    <button
                        onClick={onUpload}
                        className="group rounded-2xl border border-slate-200 bg-white p-6 text-left transition-all hover:-translate-y-1 hover:border-emerald-200 hover:shadow-lg"
                    >
                        <h3 className="text-lg font-semibold text-slate-900">📁 Upload Existing Assets</h3>
                        <p className="mt-1 text-sm text-slate-500">Upload your logo and define your brand colors to use them in remixes.</p>
                    </button>
                </div>
            </div>
        </div>
    );
};

export default BrandIdentityChoiceModal;
