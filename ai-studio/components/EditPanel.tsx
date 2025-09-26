import React, { useState, FormEvent, useEffect } from 'react';
import type { CanvasElement, ImageElement } from '../types.ts';
import { EditIcon, LoadingSpinner, CloseIcon, RegenerateIcon, RemixIcon, VideoIcon } from './icons.tsx';

interface EditPanelProps {
  elements: CanvasElement[];
  onEdit: (prompt: string) => void;
  onRegenerate: () => void;
  onRemix: (prompt: string) => void;
  onAnimate: () => void;
  onClose: () => void;
  isLoading: boolean;
}

const EditPanel: React.FC<EditPanelProps> = ({ elements, onEdit, onRegenerate, onRemix, onAnimate, onClose, isLoading }) => {
  const [prompt, setPrompt] = useState('');
  const [showPanel, setShowPanel] = useState(false);
  
  useEffect(() => {
    requestAnimationFrame(() => setShowPanel(true));
  }, []);

  const handleEditSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() || isLoading) return;
    onEdit(prompt);
    setPrompt('');
  };

  const handleRemixSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() || isLoading) return;
    onRemix(prompt);
    setPrompt('');
  };
  
  const handleClose = () => {
      setShowPanel(false);
      setTimeout(onClose, 300);
  }
  
  const handleRegenerate = () => {
    if (isLoading) return;
    onRegenerate();
  }
  
  const renderSingleElementPanel = (element: CanvasElement) => (
    <div className="flex h-full flex-col p-4">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Edit Element</h2>
          <button onClick={handleClose} className="text-slate-400 transition-colors hover:text-slate-600">
            <CloseIcon />
          </button>
        </div>

        {element.type === 'image' && (
          <div className="relative mb-4 overflow-hidden rounded-xl border border-slate-200">
            <img src={element.src} alt="Selected element" className="h-auto w-full object-cover" />
            {isLoading && (
              <div className="absolute inset-0 flex items-center justify-center bg-white/70 backdrop-blur">
                <LoadingSpinner />
              </div>
            )}
          </div>
        )}

        {element.type === 'text' && (
          <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-lg text-slate-800" style={{ fontFamily: element.fontFamily, color: element.fill }}>
              {element.text}
            </p>
          </div>
        )}
        
        {element.type === 'image' ? (
          <div className="mt-auto flex items-end space-x-2">
            <form onSubmit={handleEditSubmit} className="flex-grow">
              <label htmlFor="edit-prompt" className="mb-2 block text-sm font-medium text-slate-600">
                Describe your edit
              </label>
              <div className="relative">
                <input
                  id="edit-prompt"
                  type="text"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="e.g., add a cat sleeping on the couch"
                  className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-3 pr-12 text-slate-900 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-400 transition"
                  disabled={isLoading}
                />
                <button
                  type="submit"
                  disabled={isLoading || !prompt.trim()}
                  className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-400 transition-colors hover:text-emerald-500 disabled:hover:text-slate-400 disabled:opacity-50"
                >
                   <EditIcon />
                </button>
              </div>
            </form>
             {element.generationPrompt && (
                <button
                  type="button"
                  onClick={handleRegenerate}
                  disabled={isLoading}
                  className="flex h-[42px] items-center justify-center rounded-lg bg-emerald-500 px-3 text-white transition-colors hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-60"
                  title="Regenerate Image"
                >
                  <RegenerateIcon />
                </button>
              )}
              <button
                  type="button"
                  onClick={onAnimate}
                  disabled={isLoading}
                  className="flex h-[42px] items-center justify-center rounded-lg bg-emerald-500 px-3 text-white transition-colors hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-60"
                  title="Animate Image"
                >
                  <VideoIcon />
                </button>
          </div>
        ) : (
          <p className="mt-auto text-center text-slate-500">Text editing via AI is coming soon!</p>
        )}
      </div>
  );

  const renderMultiElementPanel = (imageElements: ImageElement[]) => {
      if (imageElements.length < 2) {
          return (
             <div className="flex h-full flex-col p-4">
                <div className="mb-4 flex items-center justify-between">
                    <h2 className="text-lg font-semibold text-slate-900">Multiple Elements</h2>
                    <button onClick={handleClose} className="text-slate-400 transition-colors hover:text-slate-600"><CloseIcon /></button>
                </div>
                <div className="flex flex-1 items-center justify-center">
                    <p className="text-center text-slate-500">Select at least two images to remix them.</p>
                </div>
             </div>
          );
      }
      return (
         <div className="flex h-full flex-col p-4">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">Remix Images</h2>
              <button onClick={handleClose} className="text-slate-400 transition-colors hover:text-slate-600"><CloseIcon /></button>
            </div>

            <p className="mb-4 text-sm text-slate-500">
                Remix the {imageElements.length} selected images into a single new image with a prompt.
            </p>

            <div className="mb-4 grid max-h-[200px] grid-cols-2 gap-2 overflow-y-auto pr-2">
                {imageElements.map(el => (
                    <img key={el.id} src={el.src} alt="Selected to remix" className="h-full w-full rounded-lg border border-slate-200 object-cover" />
                ))}
            </div>

            <div className="mt-auto relative">
                {isLoading && (
                  <div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-white/70 backdrop-blur">
                    <LoadingSpinner />
                  </div>
                )}
                <form onSubmit={handleRemixSubmit}>
                  <label htmlFor="remix-prompt" className="mb-2 block text-sm font-medium text-slate-600">
                    Describe how to remix them
                  </label>
                  <div className="relative">
                    <input
                      id="remix-prompt"
                      type="text"
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                      placeholder="e.g., blend into a surreal landscape"
                      className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-3 pr-12 text-slate-900 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-400 transition"
                      disabled={isLoading}
                    />
                    <button
                        type="submit"
                        disabled={isLoading || !prompt.trim()}
                        className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-400 transition-colors hover:text-emerald-500 disabled:hover:text-slate-400 disabled:opacity-50"
                    >
                       <RemixIcon /> 
                    </button>
                  </div>
                </form>
            </div>
        </div>
      )
  }

  return (
    <aside 
      className={`absolute top-0 right-0 h-full bg-white/95 backdrop-blur-xl shadow-2xl shadow-emerald-100/60 z-30 transform transition-transform duration-300 ease-in-out ${showPanel ? 'translate-x-0' : 'translate-x-full'}`}
      style={{width: '360px'}}
    >
      {elements.length === 1 ? renderSingleElementPanel(elements[0]) : renderMultiElementPanel(elements.filter(el => el.type === 'image') as ImageElement[])}
    </aside>
  );
};

export default EditPanel;
