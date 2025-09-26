import React, { useMemo, useState } from 'react';
import type { GenieMessage } from '../services/genieService.ts';
import { LoadingSpinner } from './icons.tsx';

export interface GenieConversationMessage extends GenieMessage {
  id: string;
}

interface GeniePanelProps {
  isOpen: boolean;
  onClose: () => void;
  messages: GenieConversationMessage[];
  isLoading: boolean;
  onSend: (message: string) => Promise<boolean>;
  onUsePrompt: (prompt: string) => void;
  contextReady: boolean;
  contextHelp?: string;
}

const stripFinalPromptPrefix = (text: string): string => {
  if (!text.trim().startsWith('[FINAL PROMPT]:')) {
    return text.trim();
  }
  return text.trim().replace(/^\[FINAL PROMPT\]:\s*/, '');
};

const GeniePanel: React.FC<GeniePanelProps> = ({
  isOpen,
  onClose,
  messages,
  isLoading,
  onSend,
  onUsePrompt,
  contextReady,
  contextHelp,
}) => {
  const [draft, setDraft] = useState('');

  const latestFinalPrompt = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const message = messages[i];
      if (message.role === 'genie' && message.text.trim().startsWith('[FINAL PROMPT]:')) {
        return stripFinalPromptPrefix(message.text);
      }
    }
    return null;
  }, [messages]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = draft.trim();
    if (!value || isLoading || !contextReady) return;

    const ok = await onSend(value);
    if (ok) {
      setDraft('');
    }
  };

  return (
    <div
      className={`pointer-events-none fixed inset-y-0 right-0 z-40 flex w-full max-w-md transform transition-transform duration-300 ease-in-out ${
        isOpen ? 'translate-x-0' : 'translate-x-full'
      }`}
    >
      <div className="pointer-events-auto flex h-full w-full flex-col gap-0 rounded-l-3xl border-l border-slate-200/70 bg-white shadow-2xl">
        <header className="flex items-center justify-between px-5 pb-3 pt-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-emerald-500">Creative Partner</p>
            <h2 className="text-xl font-semibold text-slate-900">Genie</h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-full border border-slate-200 px-3 py-1 text-sm font-semibold text-slate-500 transition hover:border-slate-300 hover:text-slate-700"
          >
            Close
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 pb-4">
          {messages.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 p-4 text-sm text-slate-500">
              <p className="font-semibold text-slate-600">Start a conversation.</p>
              <p className="mt-2 text-slate-500">
                Tell Genie what kind of campaign you want to build. It will review your connected boards and help you craft the perfect prompt for the Creative Director.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {messages.map(message => (
                <div
                  key={message.id}
                  className={`max-w-full rounded-2xl px-4 py-3 text-sm shadow-sm ${
                    message.role === 'genie'
                      ? 'self-start bg-emerald-50 text-emerald-900'
                      : 'self-end bg-slate-900 text-white'
                  }`}
                >
                  <p className="whitespace-pre-line leading-relaxed">{message.text}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {latestFinalPrompt && (
          <div className="border-t border-emerald-100 bg-emerald-50 px-5 py-4">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-600">Final Prompt Ready</p>
            <p className="mt-2 max-h-32 overflow-y-auto whitespace-pre-line text-sm text-emerald-900">
              {latestFinalPrompt}
            </p>
            <button
              onClick={() => onUsePrompt(latestFinalPrompt)}
              className="mt-3 inline-flex items-center justify-center rounded-full bg-emerald-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-600"
            >
              Use This Prompt
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit} className="border-t border-slate-200 bg-white px-5 py-4">
          {!contextReady && (
            <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
              {contextHelp || 'Select a Remix board with connected assets to chat with Genie.'}
            </div>
          )}
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={draft}
              onChange={event => setDraft(event.target.value)}
              placeholder={contextReady ? 'Ask Genie for help…' : 'Context required'}
              disabled={!contextReady || isLoading}
              className="flex-1 rounded-full border border-slate-200 px-4 py-3 text-sm text-slate-900 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200 disabled:cursor-not-allowed disabled:bg-slate-100"
            />
            <button
              type="submit"
              disabled={!contextReady || isLoading || draft.trim().length === 0}
              className="inline-flex items-center justify-center rounded-full bg-emerald-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {isLoading ? <LoadingSpinner /> : 'Send'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default GeniePanel;
