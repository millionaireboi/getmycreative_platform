
import React, { useState, FormEvent, useEffect, useRef } from 'react';
import { GenerateIcon, LoadingSpinner, CloseIcon } from './icons.tsx';

interface BrandBoardModalProps {
    onSubmit: (brandConcept: string, palettePrompt: string, textStyle: string) => void;
    onClose: () => void;
    isLoading: boolean;
}

const BrandBoardModal: React.FC<BrandBoardModalProps> = ({ onSubmit, onClose, isLoading }) => {
    const [brandConcept, setBrandConcept] = useState('');
    const [palettePrompt, setPalettePrompt] = useState('');
    const [textStyle, setTextStyle] = useState('');
    const [show, setShow] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        setShow(true);
        inputRef.current?.focus();
    }, []);
    
    const handleClose = () => {
        if (isLoading) return;
        setShow(false);
        setTimeout(onClose, 300); // Wait for transition
    };

    const handleSubmit = (e: FormEvent) => {
        e.preventDefault();
        if (!brandConcept.trim() || !palettePrompt.trim() || !textStyle.trim() || isLoading) return;
        onSubmit(brandConcept, palettePrompt, textStyle);
    };

    const canSubmit = brandConcept.trim() && palettePrompt.trim() && textStyle.trim();

    return (
        <div 
            className={`fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 backdrop-blur-md transition-opacity duration-300 ${show ? 'opacity-100' : 'opacity-0'}`}
            onClick={handleClose}
        >
            <div 
                className={`w-full max-w-xl transform rounded-3xl border border-slate-200/60 bg-white/95 p-6 shadow-[var(--ai-shadow-strong)] transition-all duration-300 ${show ? 'scale-100 opacity-100' : 'scale-95 opacity-0'}`}
                onClick={e => e.stopPropagation()}
            >
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-semibold text-slate-900">Create Brand Identity</h2>
                    <button onClick={handleClose} className="text-slate-400 hover:text-slate-600 transition-colors" disabled={isLoading}>
                        <CloseIcon />
                    </button>
                </div>
                <p className="text-sm text-slate-500 mb-6">Describe your brand, and the AI will generate a logo, color palette, and text variations.</p>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label htmlFor="brand-concept" className="block text-sm font-medium text-slate-600 mb-1">Brand Name or Concept</label>
                        <input
                            ref={inputRef}
                            id="brand-concept"
                            type="text"
                            value={brandConcept}
                            onChange={(e) => setBrandConcept(e.target.value)}
                            placeholder="e.g., 'Solstice Coffee Roasters'"
                            className="w-full rounded-xl border border-slate-200 bg-white py-2 px-3 text-slate-900 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-400 transition"
                            disabled={isLoading}
                        />
                    </div>
                    <div>
                        <label htmlFor="palette-prompt" className="block text-sm font-medium text-slate-600 mb-1">Color Palette Style</label>
                        <input
                            id="palette-prompt"
                            type="text"
                            value={palettePrompt}
                            onChange={(e) => setPalettePrompt(e.target.value)}
                            placeholder="e.g., 'warm, earthy tones with a splash of gold'"
                            className="w-full rounded-xl border border-slate-200 bg-white py-2 px-3 text-slate-900 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-400 transition"
                            disabled={isLoading}
                        />
                    </div>
                    <div>
                        <label htmlFor="text-style" className="block text-sm font-medium text-slate-600 mb-1">Text & Copywriting Style</label>
                        <input
                            id="text-style"
                            type="text"
                            value={textStyle}
                            onChange={(e) => setTextStyle(e.target.value)}
                            placeholder="e.g., 'friendly, rustic, and artisanal'"
                            className="w-full rounded-xl border border-slate-200 bg-white py-2 px-3 text-slate-900 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-400 transition"
                            disabled={isLoading}
                        />
                    </div>
                    <div className="pt-2">
                        <button
                            type="submit"
                            disabled={isLoading || !canSubmit}
                            className="w-full flex items-center justify-center rounded-xl bg-emerald-500 py-3 text-lg font-semibold text-white transition-all duration-200 hover:bg-emerald-600 hover:shadow-lg disabled:cursor-not-allowed disabled:bg-slate-300"
                        >
                            {isLoading ? <LoadingSpinner /> : 'Generate Brand Kit'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default BrandBoardModal;
