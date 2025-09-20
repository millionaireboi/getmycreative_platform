import React, { useState } from 'react';
import { UITemplate } from '../types.ts';
import { XIcon, SparklesIcon, ChevronDownIcon } from './icons.tsx';


interface TemplateDetailModalProps {
  template: UITemplate;
  onClose: () => void;
  onUseTemplate: (template: UITemplate) => void;
}

export const TemplateDetailModal = ({ template, onClose, onUseTemplate }: TemplateDetailModalProps) => {
    const [isPromptOpen, setIsPromptOpen] = useState(false);
    const useCases = Array.isArray(template.useCases) ? template.useCases.filter((entry) => entry && entry.trim().length > 0) : [];

    return (
        <div 
            className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 animate-fade-in"
            onClick={onClose}
        >
            <div 
                className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex overflow-hidden animate-slide-up"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="w-3/5 bg-slate-100 flex items-center justify-center p-4">
                    <img 
                        src={template.imageUrl} 
                        alt={template.title} 
                        className="max-w-full max-h-full object-contain rounded-lg shadow-lg"
                    />
                </div>
                <div className="w-2/5 flex flex-col p-8">
                    <div className="flex justify-between items-start">
                        <h2 className="text-3xl font-bold text-gray-800 font-display mb-2 pr-4">{template.title}</h2>
                         <button onClick={onClose} className="p-1 rounded-full text-gray-500 hover:bg-slate-100 -mt-2 -mr-2 flex-shrink-0">
                            <XIcon className="w-6 h-6" />
                        </button>
                    </div>

                    <div className="flex flex-wrap gap-2 mb-4">
                        {template.tags.map(tag => (
                            <span key={tag} className="px-3 py-1 text-xs font-medium text-emerald-800 bg-emerald-100 rounded-full">
                                {tag}
                            </span>
                        ))}
                    </div>
                    <div className="flex-grow overflow-y-auto pr-2 space-y-6">
                        <section>
                            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-2">Suggested Use Cases</h3>
                            {useCases.length > 0 ? (
                                <ul className="space-y-2">
                                    {useCases.map((idea, index) => (
                                        <li key={index} className="flex items-start gap-2 text-gray-700 text-sm">
                                            <span className="mt-1 h-2 w-2 rounded-full bg-emerald-500 flex-shrink-0"></span>
                                            <span>{idea}</span>
                                        </li>
                                    ))}
                                </ul>
                            ) : (
                                <p className="text-gray-500 text-sm">Use cases will appear here once the template has been analyzed.</p>
                            )}
                        </section>

                        <section className="border border-slate-200 rounded-xl overflow-hidden">
                            <button
                                type="button"
                                onClick={() => setIsPromptOpen(prev => !prev)}
                                className="w-full flex items-center justify-between px-4 py-3 text-left text-sm font-semibold text-gray-700 hover:bg-slate-50 transition"
                            >
                                <span>AI Prompt</span>
                                <ChevronDownIcon className={`w-4 h-4 transition-transform ${isPromptOpen ? 'rotate-180' : ''}`} />
                            </button>
                            {isPromptOpen && (
                                <div className="px-4 pb-4 text-gray-600 text-sm leading-relaxed border-t border-slate-200">
                                    {template.prompt || 'No prompt available for this template yet.'}
                                </div>
                            )}
                        </section>
                    </div>

                    <div className="mt-6 pt-6 border-t border-slate-200">
                         <button 
                            onClick={() => onUseTemplate(template)}
                            className="w-full flex justify-center items-center gap-2 py-3 px-4 border border-transparent rounded-lg shadow-sm text-base font-medium text-white bg-emerald-500 hover:bg-emerald-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 transition-colors"
                        >
                            <SparklesIcon className="w-5 h-5" />
                           Use This Template
                        </button>
                    </div>

                </div>
            </div>
             <style>{`
                @keyframes fade-in {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                .animate-fade-in { animation: fade-in 0.3s ease-out forwards; }

                @keyframes slide-up {
                    from { transform: translateY(20px); opacity: 0; }
                    to { transform: translateY(0); opacity: 1; }
                }
                .animate-slide-up { animation: slide-up 0.4s ease-out forwards; }
            `}</style>
        </div>
    );
};
