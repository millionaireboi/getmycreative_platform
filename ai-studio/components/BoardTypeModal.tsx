

import React, { useState, useEffect } from 'react';
import { BoardType } from '../types.ts';
import { CloseIcon } from './icons.tsx';

interface BoardTypeModalProps {
    onSelect: (type: BoardType) => void;
    onClose: () => void;
}

const BoardTypeModal: React.FC<BoardTypeModalProps> = ({ onSelect, onClose }) => {
    const [show, setShow] = useState(false);

    useEffect(() => {
        setShow(true);
    }, []);
    
    const handleClose = () => {
        setShow(false);
        setTimeout(onClose, 300); // Wait for transition
    };

    const handleSelect = (type: BoardType) => {
        onSelect(type);
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
                    <h2 className="text-xl font-semibold text-slate-900">What would you like to create?</h2>
                    <button onClick={handleClose} className="text-slate-400 hover:text-slate-600 transition-colors">
                        <CloseIcon />
                    </button>
                </div>
                <p className="mb-6 text-sm text-slate-500">Choose a board type to generate creative assets.</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <button
                        onClick={() => handleSelect('image')}
                        className="group rounded-2xl border border-slate-200 bg-white p-6 text-left transition-all hover:-translate-y-1 hover:border-emerald-200 hover:shadow-lg"
                    >
                        <h3 className="text-lg font-semibold text-slate-900">🖼️ Image Board</h3>
                        <p className="mt-1 text-sm text-slate-500">Generate social media posts, mood boards, or creative visuals.</p>
                    </button>
                    <button
                        onClick={() => handleSelect('text')}
                        className="group rounded-2xl border border-slate-200 bg-white p-6 text-left transition-all hover:-translate-y-1 hover:border-emerald-200 hover:shadow-lg"
                    >
                        <h3 className="text-lg font-semibold text-slate-900">✍️ Text Board</h3>
                        <p className="mt-1 text-sm text-slate-500">Generate headlines, slogans, or copy variations for your project.</p>
                    </button>
                </div>
            </div>
        </div>
    );
};

export default BoardTypeModal;
