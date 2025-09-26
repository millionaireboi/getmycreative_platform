
import React, { useState, FormEvent, useEffect, useRef } from 'react';
import { GenerateIcon, LoadingSpinner, CloseIcon } from './icons.tsx';

interface VideoPromptModalProps {
    onSubmit: (prompt: string) => void;
    onClose: () => void;
    isLoading: boolean;
}

const VideoPromptModal: React.FC<VideoPromptModalProps> = ({ onSubmit, onClose, isLoading }) => {
    const [prompt, setPrompt] = useState('');
    const [show, setShow] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        setShow(true);
        inputRef.current?.focus();
    }, []);
    
    const handleClose = () => {
        setShow(false);
        setTimeout(onClose, 300); // Wait for transition
    };

    const handleSubmit = (e: FormEvent) => {
        e.preventDefault();
        if (!prompt.trim() || isLoading) return;
        onSubmit(prompt);
    };

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
                    <h2 className="text-xl font-semibold text-slate-900">Generate Video</h2>
                    <button onClick={handleClose} className="text-slate-400 hover:text-slate-600 transition-colors">
                        <CloseIcon />
                    </button>
                </div>
                <p className="text-sm text-slate-500 mb-6">Describe the video you want to create. This process can take several minutes.</p>
                <form onSubmit={handleSubmit}>
                    <div className="relative">
                        <input
                            ref={inputRef}
                            type="text"
                            value={prompt}
                            onChange={(e) => setPrompt(e.target.value)}
                            placeholder="e.g., 'A neon hologram of a cat driving at top speed'"
                            className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-4 pr-16 text-slate-900 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-400 transition"
                            disabled={isLoading}
                        />
                        <button
                            type="submit"
                            disabled={isLoading || !prompt.trim()}
                            className="absolute inset-y-0 right-0 m-1.5 flex items-center justify-center rounded-xl bg-emerald-500 px-4 text-white transition-all duration-200 hover:bg-emerald-600 hover:shadow-lg disabled:cursor-not-allowed disabled:bg-slate-300"
                        >
                            {isLoading ? <LoadingSpinner /> : <GenerateIcon />}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default VideoPromptModal;
