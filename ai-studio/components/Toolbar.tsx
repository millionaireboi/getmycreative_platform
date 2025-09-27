

import React, { useState, FormEvent } from 'react';
import { GenerateIcon } from './icons.tsx';
import { AiLoadingIndicator } from '../../components/AiLoadingIndicator.tsx';

interface ToolbarProps {
  prompt: string;
  setPrompt: (prompt: string) => void;
  onSubmit: (prompt: string) => void;
  isLoading: boolean;
  placeholder?: string;
  mentionSuggestions?: string[];
}

const Toolbar = React.forwardRef<HTMLDivElement, ToolbarProps>(({ prompt, setPrompt, onSubmit, isLoading, placeholder, mentionSuggestions = [] }, ref) => {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [filteredSuggestions, setFilteredSuggestions] = useState<string[]>([]);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(0);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() || isLoading) return;
    onSubmit(prompt);
    // The parent component is now responsible for clearing the prompt
  };
  
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setPrompt(value);
    
    const cursorPosition = e.target.selectionStart || 0;
    const textBeforeCursor = value.substring(0, cursorPosition);
    const lastAt = textBeforeCursor.lastIndexOf('@');
    const lastSpace = textBeforeCursor.lastIndexOf(' ');

    if (lastAt > -1 && lastAt > lastSpace && mentionSuggestions.length > 0) {
      const query = textBeforeCursor.substring(lastAt + 1);
      const suggestions = mentionSuggestions.filter(label =>
        label.toLowerCase().startsWith(query.toLowerCase())
      );
      if (suggestions.length > 0) {
        setFilteredSuggestions(suggestions);
        setShowSuggestions(true);
        setActiveSuggestionIndex(0);
      } else {
        setShowSuggestions(false);
      }
    } else {
      setShowSuggestions(false);
    }
  };

  const handleSuggestionClick = (suggestion: string) => {
    const lastAt = prompt.lastIndexOf('@');
    const newPrompt = `${prompt.substring(0, lastAt)}@${suggestion} `;
    setPrompt(newPrompt);
    setShowSuggestions(false);
  };
  
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showSuggestions) return;
    
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveSuggestionIndex(prev => (prev + 1) % filteredSuggestions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveSuggestionIndex(prev => (prev - 1 + filteredSuggestions.length) % filteredSuggestions.length);
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      if (filteredSuggestions[activeSuggestionIndex]) {
        handleSuggestionClick(filteredSuggestions[activeSuggestionIndex]);
      }
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
    }
  };

  return (
    <footer ref={ref} className="relative z-20 flex w-full justify-center px-4 pb-6 sm:px-6 lg:px-12">
      <form onSubmit={handleSubmit} className="relative w-full max-w-3xl lg:max-w-4xl xl:max-w-5xl">
         {showSuggestions && filteredSuggestions.length > 0 && (
            <div className="absolute bottom-full mb-2 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl z-30">
                <ul>
                    {filteredSuggestions.map((suggestion, index) => (
                        <li 
                            key={suggestion}
                            onClick={() => handleSuggestionClick(suggestion)}
                            className={`px-4 py-2 cursor-pointer ${index === activeSuggestionIndex ? 'bg-emerald-500 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
                        >
                            <span className="font-bold">@{suggestion}</span>
                        </li>
                    ))}
                </ul>
            </div>
        )}
        <div className="relative">
          <input
            type="text"
            value={prompt}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder={placeholder || "Describe your vision... e.g., 'a futuristic urban cafe at night'"}
            className="w-full rounded-full border border-slate-200 bg-white/95 py-5 pl-8 pr-24 text-lg text-slate-900 shadow-2xl shadow-emerald-100/50 backdrop-blur focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-400 placeholder:text-slate-400"
            disabled={isLoading}
            autoComplete="off"
          />
          <button
            type="submit"
            disabled={isLoading || !prompt.trim()}
            className="absolute inset-y-0 right-0 m-3 flex items-center justify-center whitespace-nowrap rounded-full bg-emerald-500 px-6 text-white transition-all duration-200 hover:bg-emerald-600 hover:shadow-lg disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {isLoading ? <AiLoadingIndicator size={36} ariaLabel="Generating" /> : <GenerateIcon />}
          </button>
        </div>
      </form>
    </footer>
  );
});

Toolbar.displayName = 'Toolbar';

export default Toolbar;
