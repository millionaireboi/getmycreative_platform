import React, { useState, useMemo, ChangeEvent, useEffect } from 'react';
// Fix: Removed 'Template' as it's not an exported member of types.ts
import { UITemplate } from '../types.ts';
import { ALL_TAGS } from '../constants.ts';
import { SearchIcon, SparklesIcon, AlertTriangleIcon } from './icons.tsx';
import { detectEditableRegions, isApiConfigured } from '../services/geminiService.ts';
import { fileToBase64, fileToDataUrl } from '../utils/fileUtils.ts';
import { useAuth } from '../contexts/AuthContext.tsx';
// Fix: Import 'TemplateStatus' to be used for newly uploaded templates.
import { SubscriptionTier, TemplateStatus } from '../core/types/index.ts';
import { TemplateDetailModal } from './TemplateDetailModal.tsx';
import { getPublishedTemplates } from '../core/systems/templateStore.ts';
// FIX: Update import path for uploadFileToStorage to resolve module conflict.
import { uploadFileToStorage } from '../firebase/config.ts';


interface TemplateCardProps {
  template: UITemplate;
  onSelect: (template: UITemplate) => void;
}

const TemplateCard = ({ template, onSelect }: TemplateCardProps) => (
  <div
    className="group relative break-inside-avoid mb-4 cursor-pointer"
    onClick={() => !template.isAnalyzing && !template.isError && onSelect(template)}
  >
    <img
      src={template.imageUrl}
      alt={template.title}
      className={`w-full rounded-xl shadow-md transition-all duration-300 ${template.isAnalyzing || template.isError ? 'filter blur-sm brightness-75' : 'group-hover:shadow-xl'}`}
    />
    {template.isAnalyzing && (
        <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center text-white p-2 rounded-xl">
            <SparklesIcon className="w-8 h-8 animate-spin mb-2" />
            <p className="text-sm font-semibold text-center">Analyzing Template...</p>
        </div>
    )}
    {template.isError && (
        <div className="absolute inset-0 bg-red-900/60 flex flex-col items-center justify-center text-white p-2 rounded-xl text-center">
            <AlertTriangleIcon className="w-8 h-8 mb-2" />
            <p className="text-sm font-semibold">Upload Failed</p>
            <p className="text-xs mt-1 px-2">{template.errorMessage}</p>
        </div>
    )}
    <div className={`absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-50 transition-all duration-300 rounded-xl flex items-end p-4 ${template.isAnalyzing || template.isError ? 'hidden' : ''}`}>
      <p className="text-white text-lg font-bold opacity-0 group-hover:opacity-100 transform translate-y-4 group-hover:translate-y-0 transition-all duration-300">
        {template.title}
      </p>
    </div>
  </div>
);

interface TemplateGridProps {
  onSelectTemplate: (template: UITemplate) => void;
  isDemoMode: boolean;
}

const calculateBrandMatchScore = (templatePalette: string[] = [], brandColors: string[] = []): number => {
  if (!templatePalette.length || !brandColors.length) return 0;
  const brandColorSet = new Set(brandColors.map(c => c.toLowerCase()));
  return templatePalette.reduce((score, color) => {
    return brandColorSet.has(color.toLowerCase()) ? score + 1 : score;
  }, 0);
};

export const TemplateGrid = ({ onSelectTemplate, isDemoMode }: TemplateGridProps) => {
  const [templates, setTemplates] = useState<UITemplate[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [detailTemplate, setDetailTemplate] = useState<UITemplate | null>(null);
  const { appUser } = useAuth();

  useEffect(() => {
    const loadTemplates = async () => {
        const publishedTemplates = await getPublishedTemplates();
        setTemplates(publishedTemplates as UITemplate[]);
    };
    loadTemplates();
  }, []);

  const filteredTemplates = useMemo(() => {
    const isProWithBrandKit = appUser?.tier === SubscriptionTier.PRO && appUser?.brandColors && appUser.brandColors.length > 0;

    return templates
      .filter(t => t.title.toLowerCase().includes(searchTerm.toLowerCase()))
      .filter(t => (activeTag ? t.tags.includes(activeTag) : true))
      .sort((a, b) => {
          if (!isProWithBrandKit) {
              return 0; // Preserve original ordering for non-pro users
          }

          const brandColors = appUser?.brandColors ?? [];
          const scoreA = calculateBrandMatchScore(a.palette, brandColors);
          const scoreB = calculateBrandMatchScore(b.palette, brandColors);

          if (scoreA !== scoreB) {
              return scoreB - scoreA; // Higher brand-match score first
          }

          return b.createdAt.getTime() - a.createdAt.getTime(); // Newer templates first on tie
      });
  }, [templates, searchTerm, activeTag, appUser]);

  const handleUploadTemplate = async (event: ChangeEvent<HTMLInputElement>) => {
    if (!event.target.files?.[0] || !appUser) return;
    
    const file = event.target.files[0];
    const tempId = `custom-${Date.now()}`;
    const previewUrl = await fileToDataUrl(file); // Use data: URL for instant preview (no blob:)
    const now = new Date();

    const newTemplate: UITemplate = {
        id: tempId,
        title: file.name.split('.')[0] || "Custom Upload",
        imageUrl: previewUrl, // Use blob for instant UI preview
        tags: ['Custom'],
        prompt: 'Generate a creative based on the uploaded image. Integrate the provided text, logo, and product images seamlessly into the style of the uploaded template image.',
        placeholders: { logo: true, productImage: true, headline: true, body: true },
        isAnalyzing: true, // This flag indicates processing is in progress
        status: TemplateStatus.DRAFT,
        designerId: appUser?.id ?? null,
        version: 1,
        isArchived: false,
        analytics: { uses: 0 },
        createdAt: now,
        updatedAt: now,
        file: file, // Store file for potential retries
    };
    
    setTemplates(prev => [newTemplate, ...prev]);

    try {
        const [imageUrl, base64] = await Promise.all([
            uploadFileToStorage(file, `projects/${appUser.id}`),
            fileToBase64(file)
        ]);
        
        // If the API isn't configured, we can stop after uploading.
        if (!isApiConfigured()) {
             setTemplates(prev => prev.map(t => t.id === tempId ? { 
                ...t, 
                isAnalyzing: false, 
                imageUrl: imageUrl // Overwrite blob URL with permanent one
            } : t));
            return;
        }
        
        const detectedMarks = await detectEditableRegions(base64, file.type);
        
        // Update the template in state with the permanent storage URL and analysis results
        setTemplates(prev => prev.map(t => t.id === tempId ? { 
            ...t, 
            isAnalyzing: false, 
            initialMarks: detectedMarks,
            imageUrl: imageUrl // Overwrite the temporary blob URL with the permanent one
        } : t));
    } catch (error) {
        console.error("Failed to upload or analyze template:", error);
        // Update UI to show failure. The template remains un-selectable.
        const errorMessage = error instanceof Error ? error.message : "An unknown error occurred during processing.";
        setTemplates(prev => prev.map(t => t.id === tempId ? { 
            ...t, 
            isAnalyzing: false, 
            isError: true, 
            errorMessage,
            title: "Upload Failed" 
        } : t));
    }
  };

  const handlePreviewTemplate = (template: UITemplate) => {
    setDetailTemplate(template);
  };

  const handleConfirmSelection = (template: UITemplate) => {
    onSelectTemplate(template);
    setDetailTemplate(null);
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <header className="text-center mb-12">
        <h1 className="text-5xl font-extrabold text-gray-800 tracking-tight font-display">Creative Templates</h1>
        <p className="mt-4 text-lg text-gray-600 max-w-2xl mx-auto">
          Choose a template to start generating on-brand creatives in seconds.
        </p>
         {appUser?.tier === SubscriptionTier.PRO && appUser.brandColors && (
            <div className="mt-4 inline-flex items-center gap-2 bg-emerald-100 text-emerald-800 px-3 py-1.5 rounded-full text-sm">
                <SparklesIcon className="w-4 h-4" />
                <span className="font-semibold">Pro Perk:</span> Results ranked for your brand!
            </div>
        )}
      </header>

      <div className="mb-8 sticky top-4 bg-white/80 backdrop-blur-sm z-10 py-4 px-4 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex flex-col md:flex-row gap-4 items-center">
          <div className="relative flex-grow w-full">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search templates..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition bg-white"
            />
          </div>
          <div className="flex items-center gap-2 overflow-x-auto pb-2">
            <button
                onClick={() => setActiveTag(null)}
                className={`px-4 py-1.5 text-sm font-medium rounded-full transition whitespace-nowrap ${!activeTag ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-gray-700 hover:bg-slate-200 border border-transparent'}`}
            >
                All
            </button>
            {ALL_TAGS.map(tag => (
              <button
                key={tag}
                onClick={() => setActiveTag(tag)}
                className={`px-4 py-1.5 text-sm font-medium rounded-full transition whitespace-nowrap ${activeTag === tag ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-gray-700 hover:bg-slate-200 border border-transparent'}`}
              >
                {tag}
              </button>
            ))}
          </div>
          <label htmlFor="template-upload" className="cursor-pointer bg-emerald-100 text-emerald-700 px-4 py-2 rounded-lg text-sm font-semibold hover:bg-emerald-200 transition whitespace-nowrap">
            Upload Template
          </label>
          <input id="template-upload" type="file" className="hidden" accept="image/*" onChange={handleUploadTemplate} />
        </div>
      </div>
      
      {filteredTemplates.length > 0 ? (
        <div className="columns-2 md:columns-3 lg:columns-4 xl:columns-5 gap-4">
            {filteredTemplates.map(template => (
            <TemplateCard key={template.id} template={template} onSelect={handlePreviewTemplate} />
            ))}
        </div>
        ) : (
            <div className="text-center py-16">
                <p className="text-gray-500">No templates found. Try a different search or filter.</p>
            </div>
        )
      }
      {detailTemplate && (
        <TemplateDetailModal 
            template={detailTemplate}
            onUseTemplate={handleConfirmSelection}
            onClose={() => setDetailTemplate(null)}
        />
      )}
    </div>
  );
};
