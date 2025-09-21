import { useState, useCallback, useEffect, ChangeEvent, FormEvent, useRef, MouseEvent, useMemo, MutableRefObject } from 'react';
import { UITemplate, BrandAsset, GeneratedImage, Mark, ChatMessage } from '../types.ts';
import { generateCreative, editCreativeWithChat, ChatEditOptions } from '../services/geminiService.ts';
import { fileToBase64, downloadImage, imageUrlToBase64, base64ToBlob } from '../utils/fileUtils.ts';
import { SparklesIcon, ArrowLeftIcon, DownloadIcon, PaperclipIcon, SendIcon, PaletteIcon, XIcon, UploadCloudIcon, TrashIcon, EditIcon } from './icons.tsx';
import CreativeElement from './CreativeElement.tsx';

import { BRAND_PALETTES } from '../constants.ts';
import { useAuth } from '../contexts/AuthContext.tsx';
import { SubscriptionTier, Project } from '../core/types/index.ts';
import { createProject, updateProjectHistory, updateProjectName } from '../core/systems/projectStore.ts';
import { uploadFileToStorage } from '../firebase/config.ts';


const DEFAULT_HOTSPOT_LABEL: Record<'text' | 'image', string> = {
  text: 'New text hotspot',
  image: 'New image hotspot',
};

const resolveHotspotDisplayLabel = (mark: Mark): string => {
  const raw = (mark.label ?? '').trim();
  if (!raw || raw === DEFAULT_HOTSPOT_LABEL[mark.type]) {
    return mark.type === 'text' ? 'Text hotspot' : 'Image hotspot';
  }
  return raw;
};

const isHotspotLabelPending = (mark: Mark): boolean => {
  const raw = (mark.label ?? '').trim();
  return !raw || raw === DEFAULT_HOTSPOT_LABEL[mark.type];
};


const buildChatMessagesForState = (isProUser: boolean): ChatMessage[] => [
    {
        id: 'msg-tip',
        role: 'assistant',
        type: 'text',
        text: isProUser
            ? "Tip: use @ to reference any enabled hotspot (e.g. @Headline) when you ask for changes."
            : "Upgrade to Pro to chat with the designer bot and request targeted tweaks using @mentions."
    }
];

const VersionHistory = ({ history, activeIndex, onSelect }: { history: GeneratedImage[], activeIndex: number, onSelect: (index: number) => void }) => (
    <div>
        <h3 className="text-lg font-bold text-gray-800 font-display mb-3">Version History</h3>
        <div className="flex gap-3 overflow-x-auto pb-2">
            {history.map((version, index) => (
                <div key={version.id} className="flex-shrink-0 text-center">
                    <button 
                        onClick={() => onSelect(index)}
                        className={`block w-24 h-24 rounded-lg overflow-hidden border-2 transition-colors ${activeIndex === index ? 'border-emerald-500' : 'border-transparent hover:border-slate-300'}`}
                    >
                        <img src={version.imageUrl} alt={`Version ${index + 1}`} className="w-full h-full object-cover" />
                    </button>
                    <p className="text-xs mt-1 font-medium text-gray-600">{index === 0 ? 'Template' : `V${index}`}</p>
                </div>
            ))}
        </div>
    </div>
);

const ColorPaletteSelector = ({ selectedPalette, onPaletteChange, userBrandColors }: { selectedPalette: string[], onPaletteChange: (colors: string[]) => void, userBrandColors?: string[] }) => {

    const allPalettes: Record<string, string[]> = { ...BRAND_PALETTES };
    if (userBrandColors && userBrandColors.length > 0) {
        allPalettes["My Brand"] = userBrandColors;
    }

    return (
        <div>
            <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-2"><PaletteIcon className="w-5 h-5" /> Brand Colors</label>
            <div className="flex flex-wrap gap-2">
                {Object.entries(allPalettes).map(([name, colors]) => (
                    <button key={name} onClick={() => onPaletteChange(colors)} className={`p-1 border-2 rounded-md ${JSON.stringify(colors) === JSON.stringify(selectedPalette) ? 'border-emerald-500' : 'border-transparent'}`}>
                        <div className="flex gap-1">
                        {colors.map(color => <div key={color} className="w-5 h-5 rounded" style={{ backgroundColor: color }}/>)}
                        </div>
                         <span className="text-xs text-gray-500">{name}</span>
                    </button>
                ))}
                 <button onClick={() => onPaletteChange([])} className={`p-1 border-2 rounded-md ${selectedPalette.length === 0 ? 'border-emerald-500' : 'border-transparent'}`}>
                        <div className="flex items-center justify-center w-full h-5 text-gray-400">
                           <XIcon className="w-4 h-4" />
                        </div>
                         <span className="text-xs text-gray-500">None</span>
                </button>
            </div>
        </div>
    );
};

interface EditorViewProps {
  project: Project | null;
  pendingTemplate: UITemplate | null;
  onBack: () => void;
  onUpgrade: () => void;
  isDemoMode: boolean;
  onProjectPersisted?: (project: Project) => void;
}

export const EditorView = ({ project, pendingTemplate, onBack, onUpgrade, isDemoMode, onProjectPersisted }: EditorViewProps) => {
  const { appUser } = useAuth();
  const isProUser = appUser?.tier === SubscriptionTier.PRO;

  const initialHistory: GeneratedImage[] = project
    ? project.history
    : pendingTemplate
      ? [{ id: pendingTemplate.id, imageUrl: pendingTemplate.imageUrl, prompt: 'Original Template' }]
      : [];
  const initialMarksSource = project?.initialMarks ?? pendingTemplate?.initialMarks ?? [];
  const initialName = project?.name ?? pendingTemplate?.title ?? 'Untitled Project';
  const initialPrompt = project?.basePrompt ?? pendingTemplate?.prompt ?? '';
  const initialTemplateImageUrl = project?.templateImageUrl ?? pendingTemplate?.imageUrl ?? '';
  const initialTemplateId = project?.templateId ?? pendingTemplate?.id ?? '';

  const [history, setHistory] = useState<GeneratedImage[]>(initialHistory);
  const [activeIndex, setActiveIndex] = useState(Math.max(initialHistory.length - 1, 0));
  const [projectName, setProjectName] = useState(initialName);
  const [isEditingName, setIsEditingName] = useState(false);
  const [marks, setMarks] = useState<Mark[]>(initialMarksSource);
  const [enabledMarks, setEnabledMarks] = useState<Record<string, boolean>>(() => {
    const map: Record<string, boolean> = {};
    initialMarksSource.forEach(mark => {
        map[mark.id] = false;
    });
    return map;
  });
  const [textFields, setTextFields] = useState<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    initialMarksSource.forEach(mark => {
        if (mark.type === 'text') {
            map[mark.id] = mark.text || `Your ${resolveHotspotDisplayLabel(mark)} Here`;
        }
    });
    return map;
  });
  const [imageAssets, setImageAssets] = useState<Record<string, BrandAsset | null>>({});
  const [imagePrompts, setImagePrompts] = useState<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    initialMarksSource.forEach(mark => {
        if (mark.type === 'image') {
            map[mark.id] = '';
        }
    });
    return map;
  });
  const [imageModes, setImageModes] = useState<Record<string, 'upload' | 'describe'>>(() => {
    const map: Record<string, 'upload' | 'describe'> = {};
    initialMarksSource.forEach(mark => {
        if (mark.type === 'image') {
            map[mark.id] = 'upload';
        }
    });
    return map;
  });
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(() => buildChatMessagesForState(!!isProUser));
  const [isGenerating, setIsGenerating] = useState(false);
  const [isGenerationConfirmOpen, setIsGenerationConfirmOpen] = useState(false);
  const [pendingExcludedMarks, setPendingExcludedMarks] = useState<Mark[]>([]);

  const [chatPrompt, setChatPrompt] = useState('');
  const [chatAttachment, setChatAttachment] = useState<BrandAsset | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [brandColors, setBrandColors] = useState<string[]>(appUser?.brandColors ?? []);
  const [aspectRatio, setAspectRatio] = useState('original');

  const [isPlacingMark, setIsPlacingMark] = useState<'text' | 'image' | null>(null);
  const [hoveredMarkId, setHoveredMarkId] = useState<string | null>(null);

  const [activeHotspotId, setActiveHotspotId] = useState<string | null>(null);
  const [isChatDrawerOpen, setIsChatDrawerOpen] = useState(false);

  const [showHotspotOverlay, setShowHotspotOverlay] = useState(true);
  const [isDrawingMark, setIsDrawingMark] = useState(false);
  const [draftMark, setDraftMark] = useState<Mark | null>(null);

  const [basePrompt, setBasePrompt] = useState(initialPrompt);
  const [templateImageUrl, setTemplateImageUrl] = useState(initialTemplateImageUrl);
  const [, setTemplateId] = useState(initialTemplateId);
  const [persistedProjectId, setPersistedProjectId] = useState<string | null>(project?.id ?? null);
  const [initialProjectName, setInitialProjectName] = useState(initialName);
  const templateRef = useRef<UITemplate | null>(pendingTemplate);
  const lastHydratedRef = useRef<{ projectId: string | null; templateId: string | null }>({
    projectId: project?.id ?? null,
    templateId: project ? null : (pendingTemplate?.id ?? null)
  });

  const originalMarks = useMemo(() => project?.initialMarks ?? pendingTemplate?.initialMarks ?? [], [project, pendingTemplate]);
  const originalMarksMap = useMemo(() => {
    const map: Record<string, Mark> = {};
    originalMarks.forEach(mark => {
        map[mark.id] = mark;
    });
    return map;
  }, [originalMarks]);

  const updateMarkLabel = useCallback((markId: string, nextLabel: string) => {
    setMarks(prev => prev.map(mark => (mark.id === markId ? { ...mark, label: nextLabel } : mark)));
  }, []);

  const canEnableMark = useCallback((markId: string, overrides?: {
    label?: string;
    text?: string;
    asset?: BrandAsset | null;
    prompt?: string;
    mode?: 'upload' | 'describe';
  }) => {
    const mark = marks.find(m => m.id === markId);
    if (!mark) return false;

    const labelRaw = overrides?.label !== undefined ? overrides.label ?? '' : mark.label ?? '';
    const labelTrimmed = labelRaw.trim();
    if (!labelTrimmed || labelTrimmed === DEFAULT_HOTSPOT_LABEL[mark.type]) {
      return false;
    }

    if (mark.type === 'text') {
      const textRaw = overrides?.text !== undefined ? overrides.text ?? '' : textFields[markId] ?? '';
      const trimmed = textRaw.trim();
      if (!trimmed) return false;
      const originalTrimmed = (originalMarksMap[markId]?.text ?? '').trim();
      if (!mark.isNew && originalTrimmed && trimmed === originalTrimmed) {
        return false;
      }
      return true;
    }

    const modeValue = overrides?.mode ?? imageModes[markId] ?? 'upload';
    if (modeValue === 'upload') {
      const assetValue = overrides?.asset !== undefined ? overrides.asset : imageAssets[markId] ?? null;
      return !!assetValue;
    }

    const promptRaw = overrides?.prompt !== undefined ? overrides.prompt ?? '' : imagePrompts[markId] ?? '';
    return promptRaw.trim().length > 0;
  }, [marks, textFields, imageAssets, imagePrompts, imageModes, originalMarksMap]);

  const applyMarkEnabledFromContent = useCallback((markId: string, overrides?: {
    label?: string;
    text?: string;
    asset?: BrandAsset | null;
    prompt?: string;
    mode?: 'upload' | 'describe';
  }) => {
    setEnabledMarks(prev => ({ ...prev, [markId]: canEnableMark(markId, overrides) }));
  }, [canEnableMark]);

  const applyMarksFromSource = useCallback((sourceMarks: Mark[]) => {
    setMarks(sourceMarks);
    setEnabledMarks(() => {
        const map: Record<string, boolean> = {};
        sourceMarks.forEach(mark => {
            map[mark.id] = false;
        });
        return map;
    });
    setTextFields(() => {
        const map: Record<string, string> = {};
        sourceMarks.forEach(mark => {
            if (mark.type === 'text') {
                map[mark.id] = mark.text || `Your ${resolveHotspotDisplayLabel(mark)} Here`;
            }
        });
        return map;
    });
    setImagePrompts(() => {
        const map: Record<string, string> = {};
        sourceMarks.forEach(mark => {
            if (mark.type === 'image') {
                map[mark.id] = '';
            }
        });
        return map;
    });
    setImageModes(() => {
        const map: Record<string, 'upload' | 'describe'> = {};
        sourceMarks.forEach(mark => {
            if (mark.type === 'image') {
                map[mark.id] = 'upload';
            }
        });
        return map;
    });
    setImageAssets({});
  }, []);

  const mentionTokens = useMemo(() => {
    return marks.map(mark => ({
        id: mark.id,
        label: resolveHotspotDisplayLabel(mark),
        type: mark.type,
        isIncluded: !!enabledMarks[mark.id]
    }));
  }, [marks, enabledMarks]);

  const [mentionSuggestions, setMentionSuggestions] = useState<{ id: string; label: string; type: string; isIncluded: boolean }[]>([]);
  const [, setMentionQuery] = useState('');
  const [mentionAnchor, setMentionAnchor] = useState<{ x: number; y: number } | null>(null);
  const mentionTrackingRef = useRef<{ start: number; end: number } | null>(null);

  const closeMentionSuggestions = useCallback(() => {
    setMentionSuggestions([]);
    setMentionQuery('');
    mentionTrackingRef.current = null;
    setMentionAnchor(null);
  }, []);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const hasMountedRef = useRef(false);
  const imagePreviewRef = useRef<HTMLDivElement>(null);
  const imageElementRef = useRef<HTMLImageElement>(null);
  const [imageBounds, setImageBounds] = useState({ left: 0, top: 0, width: 0, height: 0 });
  const nameInputRef = useRef<HTMLInputElement>(null);
  const chatTextAreaRef = useRef<HTMLTextAreaElement>(null);
  const canvasHotspotRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const lastFocusedHotspotIdRef = useRef<string | null>(null);
  const drawStartRef = useRef<{ x: number; y: number; id: string; label: string } | null>(null);
  const drawerLabelInputRef = useRef<HTMLInputElement | null>(null);
  const drawerIncludeButtonRef = useRef<HTMLButtonElement | null>(null);
  const drawerTextAreaRef = useRef<HTMLTextAreaElement | null>(null);

  const updateImageBounds = useCallback(() => {
    if (!imagePreviewRef.current || !imageElementRef.current) return;
    const containerRect = imagePreviewRef.current.getBoundingClientRect();
    const imageRect = imageElementRef.current.getBoundingClientRect();
    setImageBounds({
      left: imageRect.left - containerRect.left,
      top: imageRect.top - containerRect.top,
      width: imageRect.width,
      height: imageRect.height,
    });
  }, []);

  const activeImageUrl = history[activeIndex]?.imageUrl || templateImageUrl;
  const activeMark = useMemo(() => {
    if (!activeHotspotId) return null;
    return marks.find(m => m.id === activeHotspotId) || null;
  }, [activeHotspotId, marks]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => updateImageBounds());
    return () => cancelAnimationFrame(frame);
  }, [activeImageUrl, updateImageBounds]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => updateImageBounds());
    window.addEventListener('resize', updateImageBounds);
    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined' && imagePreviewRef.current) {
      observer = new ResizeObserver(() => updateImageBounds());
      observer.observe(imagePreviewRef.current);
    }
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', updateImageBounds);
      observer?.disconnect();
    };
  }, [updateImageBounds]);

  const hydrateFromTemplate = useCallback((template: UITemplate) => {
    const templateHistory: GeneratedImage[] = [{ id: template.id, imageUrl: template.imageUrl, prompt: 'Original Template' }];
    setHistory(templateHistory);
    setActiveIndex(templateHistory.length - 1);
    const name = template.title ?? 'Untitled Project';
    setProjectName(name);
    setInitialProjectName(name);
    setIsEditingName(false);
    applyMarksFromSource(template.initialMarks ?? []);
    setBasePrompt(template.prompt ?? '');
    setTemplateImageUrl(template.imageUrl);
    setTemplateId(template.id);
    setPersistedProjectId(null);
    templateRef.current = template;
    setIsChatDrawerOpen(false);
    hasMountedRef.current = false;
    setChatPrompt('');
    setChatAttachment(null);
    setInvalidMentions([]);
    closeMentionSuggestions();
    setActiveHotspotId(null);
    setHoveredMarkId(null);
    setIsPlacingMark(null);
    setChatMessages(buildChatMessagesForState(!!isProUser));
    lastHydratedRef.current = { projectId: null, templateId: template.id };
  }, [applyMarksFromSource, closeMentionSuggestions, isProUser]);

  const hydrateFromProject = useCallback((source: Project) => {
    const projectHistory: GeneratedImage[] = source.history && source.history.length > 0
        ? source.history
        : [{ id: source.templateId, imageUrl: source.templateImageUrl, prompt: 'Original Template' }];
    setHistory(projectHistory);
    setActiveIndex(Math.max(projectHistory.length - 1, 0));
    const name = source.name ?? 'Untitled Project';
    setProjectName(name);
    setInitialProjectName(name);
    setIsEditingName(false);
    applyMarksFromSource(source.initialMarks ?? []);
    setBasePrompt(source.basePrompt ?? '');
    setTemplateImageUrl(source.templateImageUrl ?? '');
    setTemplateId(source.templateId ?? '');
    setPersistedProjectId(source.id);
    templateRef.current = null;
    setIsChatDrawerOpen(false);
    hasMountedRef.current = false;
    setChatPrompt('');
    setChatAttachment(null);
    setInvalidMentions([]);
    closeMentionSuggestions();
    setActiveHotspotId(null);
    setHoveredMarkId(null);
    setIsPlacingMark(null);
    setChatMessages(buildChatMessagesForState(!!isProUser));
    lastHydratedRef.current = { projectId: source.id, templateId: null };
  }, [applyMarksFromSource, closeMentionSuggestions, isProUser]);

  useEffect(() => {
    if (appUser?.brandColors && appUser.brandColors.length > 0) {
        setBrandColors(appUser.brandColors);
    }
  }, [appUser?.brandColors?.join(',')]);

  useEffect(() => {
    if (pendingTemplate) {
        templateRef.current = pendingTemplate;
    }
  }, [pendingTemplate]);

  useEffect(() => {
    const currentProjectId = project?.id ?? null;
    const currentTemplateId = project ? null : (pendingTemplate?.id ?? null);

    if (currentProjectId && currentProjectId !== lastHydratedRef.current.projectId && project) {
        hydrateFromProject(project);
    } else if (!currentProjectId && currentTemplateId && currentTemplateId !== lastHydratedRef.current.templateId && pendingTemplate) {
        hydrateFromTemplate(pendingTemplate);
    }
  }, [project, pendingTemplate, hydrateFromProject, hydrateFromTemplate]);

  useEffect(() => {
    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      return;
    }
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, isGenerating]);

  
  useEffect(() => {
    if (isEditingName) {
      nameInputRef.current?.focus();
    }
  }, [isEditingName]);

  useEffect(() => {
    if (activeHotspotId) {
        setHoveredMarkId(activeHotspotId);
    }
  }, [activeHotspotId]);

  useEffect(() => {
    if (!activeMark) return;
    const handleKeyDown = (event: KeyboardEvent) => {
        if (event.key === 'Escape') {
            setActiveHotspotId(null);
        }
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);
    return () => {
        document.body.style.overflow = previousOverflow;
        window.removeEventListener('keydown', handleKeyDown);
    };
  }, [activeMark]);

  useEffect(() => {
    if (!activeMark) {
        drawerLabelInputRef.current = null;
        drawerIncludeButtonRef.current = null;
        drawerTextAreaRef.current = null;
        return;
    }

    const labelInput = drawerLabelInputRef.current;
    if (isHotspotLabelPending(activeMark)) {
        labelInput?.focus();
        return;
    }

    if (labelInput && document.activeElement === labelInput) {
        return;
    }

    const activeMode = imageModes[activeMark.id] || 'upload';
    if (activeMark.type === 'text' || (activeMark.type === 'image' && activeMode === 'describe')) {
        drawerTextAreaRef.current?.focus();
    } else {
        drawerIncludeButtonRef.current?.focus();
    }
  }, [activeMark, imageModes]);

  useEffect(() => {
    if (!activeHotspotId && lastFocusedHotspotIdRef.current) {
        const ref = canvasHotspotRefs.current[lastFocusedHotspotIdRef.current];
        ref?.focus();
        lastFocusedHotspotIdRef.current = null;
    }
  }, [activeHotspotId]);

  const ensureProjectPersisted = useCallback(async (updatedHistory: GeneratedImage[]) => {
    if (!appUser) return null;
    if (persistedProjectId) {
        await updateProjectHistory(persistedProjectId, updatedHistory);
        return persistedProjectId;
    }
    const templateForProject = templateRef.current;
    if (!templateForProject) return null;
    try {
        const createdProject = await createProject(appUser.id, templateForProject);
        const effectiveProject: Project = { ...createdProject, name: projectName, history: updatedHistory };
        setPersistedProjectId(createdProject.id);
        setTemplateId(createdProject.templateId);
        setTemplateImageUrl(createdProject.templateImageUrl);
        setBasePrompt(createdProject.basePrompt);
        setInitialProjectName(projectName);
        templateRef.current = null;
        lastHydratedRef.current = { projectId: createdProject.id, templateId: null };
        onProjectPersisted?.(effectiveProject);
        await updateProjectHistory(createdProject.id, updatedHistory);
        if (projectName && projectName !== createdProject.name) {
            await updateProjectName(createdProject.id, projectName);
        }
        return createdProject.id;
    } catch (error) {
        console.error('Failed to persist project:', error);
        return null;
    }
  }, [appUser, persistedProjectId, onProjectPersisted, projectName]);

  const executeGeneration = useCallback(async () => {
    if (!appUser) return;
    setIsGenerationConfirmOpen(false);
    setPendingExcludedMarks([]);
    setIsGenerating(true);
    setIsChatDrawerOpen(true);
    setChatMessages(prev => prev.filter(m => m.type !== 'error'));

    const userMessage: ChatMessage = {
        id: `msg-${Date.now()}`,
        role: 'user',
        type: 'text',
        text: 'Generate the creative with the hotspots I selected.'
    };
    setChatMessages(prev => {
        const withoutTip = prev.filter(m => m.id !== 'msg-tip');
        return [...withoutTip, userMessage];
    });

    try {
      const { base64: templateBase64, mimeType: templateMimeType, width: templateWidth, height: templateHeight } = await imageUrlToBase64(templateImageUrl);
      
      const resultBase64 = await generateCreative(
        templateBase64,
        templateMimeType,
        basePrompt,
        textFields,
        imageAssets,
        imagePrompts,
        imageModes,
        enabledMarks,
        aspectRatio,
        marks,
        originalMarks,
        { width: templateWidth, height: templateHeight }
      );

      const imageBlob = base64ToBlob(resultBase64, 'image/png');
      const newImageUrl = await uploadFileToStorage(imageBlob, `projects/${appUser.id}/generated`);

      const newCreative: GeneratedImage = {
        id: `gen-${Date.now()}`,
        imageUrl: newImageUrl,
        prompt: basePrompt,
      };

      const updatedHistory = [...history, newCreative];
      setHistory(updatedHistory);
      setActiveIndex(updatedHistory.length - 1);
      await ensureProjectPersisted(updatedHistory);
      
      const assistantMessage: ChatMessage = {
          id: `msg-ai-${Date.now()}`, role: 'assistant', type: 'text',
          text: "Here's your first version! How does it look? You can ask for changes below."
      }
      setChatMessages(prev => [...prev, assistantMessage]);

    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'An unknown error occurred during generation.';
      const errorMsg: ChatMessage = { id: `err-${Date.now()}`, role: 'assistant', type: 'error', text: errorMessage };
      setChatMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsGenerating(false);
    }
  }, [appUser, ensureProjectPersisted, templateImageUrl, basePrompt, textFields, imageAssets, imagePrompts, imageModes, enabledMarks, aspectRatio, marks, originalMarks, history]);

  const handleGenerateClick = useCallback(() => {
    if (isGenerating || isDemoMode) return;
    const excluded = marks.filter(mark => !enabledMarks[mark.id]);
    if (excluded.length > 0) {
        setPendingExcludedMarks(excluded);
        setIsGenerationConfirmOpen(true);
        return;
    }
    executeGeneration();
  }, [isGenerating, isDemoMode, marks, enabledMarks, executeGeneration]);

  const handleChatEdit = async (e: FormEvent) => {
    e.preventDefault();
    if (!chatPrompt.trim() || isGenerating || !isProUser || !appUser) return;

    const { valid, invalid } = validateMentions(chatPrompt);
    if (invalid.length > 0) {
        setInvalidMentions(invalid);
        return;
    }

    setIsGenerating(true);
    setIsChatDrawerOpen(true);
    const isFirstGeneration = history.length === 1;
    if (isFirstGeneration) {
        setChatMessages(prev => prev.filter(m => m.id !== 'msg-tip'));
    }

    const userMessage: ChatMessage = { id: `msg-${Date.now()}`, role: 'user', type: 'text', text: chatPrompt, referenceImagePreviewUrl: chatAttachment?.previewUrl };
    setChatMessages(prev => {
        const withoutTip = prev.filter(m => m.id !== 'msg-tip');
        return [...withoutTip, userMessage];
    });
    
    setChatPrompt('');
    closeMentionSuggestions();
    setChatAttachment(null);
    if(fileInputRef.current) fileInputRef.current.value = '';

    const activeImage = history[activeIndex];
    if (!activeImage) {
        setIsGenerating(false);
        return;
    }

    try {
        const { base64: baseImageBase64, mimeType: baseImageMimeType } = await imageUrlToBase64(activeImage.imageUrl);
        const referenceImage = chatAttachment ? { base64: chatAttachment.base64, mimeType: chatAttachment.file.type } : undefined;
        
        const editOptions: ChatEditOptions = { brandColors, newAspectRatio: aspectRatio, mentions: valid };

        const editedImageBase64 = await editCreativeWithChat(
            baseImageBase64, baseImageMimeType, userMessage.text!, referenceImage, editOptions
        );
        
        const imageBlob = base64ToBlob(editedImageBase64, 'image/png');
        const newImageUrl = await uploadFileToStorage(imageBlob, `projects/${appUser.id}/generated`);

        const newCreative: GeneratedImage = { id: `gen-${Date.now()}`, imageUrl: newImageUrl, prompt: userMessage.text! };

        const baseHistory = history.slice(0, activeIndex + 1);
        const updatedHistory = [...baseHistory, newCreative];
        setHistory(updatedHistory);
        setActiveIndex(updatedHistory.length - 1);
        await ensureProjectPersisted(updatedHistory);

        const assistantMessage: ChatMessage = { id: `msg-ai-${Date.now()}`, role: 'assistant', type: 'image', text: "Here's the updated version:", generatedImageUrl: newImageUrl };
        setChatMessages(prev => [...prev, assistantMessage]);

    } catch(e) {
        const errorMessage = e instanceof Error ? e.message : 'An unknown error occurred during editing.';
        const errorMsg: ChatMessage = { id: `err-${Date.now()}`, role: 'assistant', type: 'error', text: `Sorry, I couldn't make that change. ${errorMessage}` };
        setChatMessages(prev => [...prev, errorMsg]);
    } finally {
        setIsGenerating(false);
    }
  };
  
  const handleProjectNameBlur = () => {
    setIsEditingName(false);
    if (projectName.trim() === '') {
        setProjectName(initialProjectName);
        return;
    }
    if (!persistedProjectId) {
        setInitialProjectName(projectName);
        return;
    }
    if (projectName !== initialProjectName) {
        updateProjectName(persistedProjectId, projectName);
        setInitialProjectName(projectName);
    }
  };

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
        const file = event.target.files[0];
        const base64 = await fileToBase64(file);
        setChatAttachment({ file, previewUrl: `data:${file.type};base64,${base64}`, base64 });
    }
  };
  
  const getNormalizedPoint = (event: MouseEvent<HTMLDivElement>) => {
    if (!imageElementRef.current) return null;
    const rect = imageElementRef.current.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    if (x < 0 || x > 1 || y < 0 || y > 1) return null;
    return {
        x: Math.min(1, Math.max(0, x)),
        y: Math.min(1, Math.max(0, y))
    };
  };

  const cancelDraftMark = () => {
    setIsDrawingMark(false);
    setDraftMark(null);
    drawStartRef.current = null;
  };

  const handleCanvasMouseDown = (event: MouseEvent<HTMLDivElement>) => {
    if (!isPlacingMark) return;

    const target = event.target as HTMLElement;
    if (target.closest('[data-hotspot-button="true"]')) return;

    const point = getNormalizedPoint(event);
    if (!point) return;

    event.preventDefault();
    setShowHotspotOverlay(true);
    setIsDrawingMark(true);

    const label = DEFAULT_HOTSPOT_LABEL[isPlacingMark];
    const id = `${isPlacingMark}-${Date.now()}`;
    drawStartRef.current = { ...point, id, label };
    setDraftMark({
        id,
        x: point.x,
        y: point.y,
        width: 0,
        height: 0,
        label,
        type: isPlacingMark,
        isNew: true,
    });
  };

  const handleCanvasMouseMove = (event: MouseEvent<HTMLDivElement>) => {
    if (!isDrawingMark || !drawStartRef.current) return;
    const current = getNormalizedPoint(event);
    if (!current) return;
    const start = drawStartRef.current;
    const minX = Math.min(start.x, current.x);
    const minY = Math.min(start.y, current.y);
    const width = Math.abs(current.x - start.x);
    const height = Math.abs(current.y - start.y);
    const centerX = minX + width / 2;
    const centerY = minY + height / 2;

    setDraftMark(prev => prev ? ({
        ...prev,
        x: centerX,
        y: centerY,
        width,
        height,
    }) : prev);
  };

  const handleCanvasMouseUp = () => {
    if (!isDrawingMark || !drawStartRef.current || !draftMark) {
        cancelDraftMark();
        return;
    }

    const width = draftMark.width ?? 0;
    const height = draftMark.height ?? 0;
    const minSize = 0.01;
    if (width < minSize || height < minSize) {
        cancelDraftMark();
        return;
    }

    const newMark: Mark = {
        ...draftMark,
        scale: Math.max(width, height),
    };

    setMarks(prev => [...prev, newMark]);
    setEnabledMarks(prev => ({ ...prev, [newMark.id]: false }));
    if (newMark.type === 'text') {
        setTextFields(prev => ({ ...prev, [newMark.id]: '' }));
    }
    if (newMark.type === 'image') {
        setImageModes(prev => ({ ...prev, [newMark.id]: 'upload' }));
        setImagePrompts(prev => ({ ...prev, [newMark.id]: '' }));
    }

    lastFocusedHotspotIdRef.current = newMark.id;
    setActiveHotspotId(newMark.id);

    cancelDraftMark();
    setIsPlacingMark(null);
  };

  const removeMark = (markId: string) => {
    setMarks(prev => prev.filter(m => m.id !== markId));
    setEnabledMarks(prev => { const next = {...prev}; delete next[markId]; return next; });
    setTextFields(prev => { const next = {...prev}; delete next[markId]; return next; });
    setImageAssets(prev => { const next = {...prev}; delete next[markId]; return next; });
    setImageModes(prev => { const next = {...prev}; delete next[markId]; return next; });
    setImagePrompts(prev => { const next = {...prev}; delete next[markId]; return next; });
    delete canvasHotspotRefs.current[markId];
    if (activeHotspotId === markId) {
      setActiveHotspotId(null);
    }
  };
  
  const handleDownload = () => {
    const activeImage = history[activeIndex];
    const watermark = isProUser ? undefined : 'Made with getmycreative';
    downloadImage(activeImage.imageUrl, `creative-${activeImage.id}.png`, watermark);
  };
  
  const includedMarks = useMemo(() => marks.filter(mark => enabledMarks[mark.id]), [marks, enabledMarks]);
  const ignoredMarks = useMemo(() => marks.filter(mark => !enabledMarks[mark.id]), [marks, enabledMarks]);

  const readyIncludedMarks = useMemo(() => {
    return includedMarks.filter(mark => canEnableMark(mark.id));
  }, [includedMarks, canEnableMark]);

  const missingIncludedMarks = useMemo(() => {
    const readyIds = new Set(readyIncludedMarks.map(mark => mark.id));
    return includedMarks.filter(mark => !readyIds.has(mark.id));
  }, [includedMarks, readyIncludedMarks]);

  const missingIncludedMarksCount = Math.max(0, includedMarks.length - readyIncludedMarks.length);

  const renderGlobalControls = () => (
    <div className="grid w-full grid-cols-1 gap-4 sm:grid-cols-2">
      <div className="relative rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <p className="font-medium text-gray-800">Aspect ratio</p>
        <p className="mt-1 text-xs text-gray-500">Pick the format for your next render.</p>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {['original', '1:1', '16:9', '9:16'].map(option => (
            <button
              key={option}
              type="button"
              onClick={() => setAspectRatio(option)}
              className={`rounded-lg border px-3 py-2 text-sm font-semibold capitalize transition-colors ${
                aspectRatio === option ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-white text-gray-600 hover:bg-slate-50'
              }`}
            >
              {option === 'original' ? 'Original' : option.replace(':', ':')}
            </button>
          ))}
        </div>
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <p className="font-medium text-gray-800">Brand palette</p>
          <button
            type="button"
            onClick={() => setIsSettingsOpen(true)}
            className="text-xs font-semibold text-emerald-600 hover:text-emerald-700"
          >
            Adjust
          </button>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {brandColors.length > 0 ? (
            brandColors.map(color => (
              <span
                key={color}
                className="h-7 w-7 rounded-full border border-white shadow-sm"
                style={{ backgroundColor: color }}
                title={color}
              />
            ))
          ) : (
            <p className="text-xs text-gray-500 leading-relaxed">Stick with the template colors or tap Adjust to choose your brand palette.</p>
          )}
        </div>
        {isSettingsOpen && (
          <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4 shadow-lg">
            <ColorPaletteSelector
              selectedPalette={brandColors}
              onPaletteChange={palette => {
                setBrandColors(palette);
                setIsSettingsOpen(false);
              }}
              userBrandColors={appUser?.brandColors}
            />
          </div>
        )}
      </div>
    </div>
  );

  const renderFloatingActions = () => {
    const disabled = isGenerating || isDemoMode || includedMarks.length === 0;
    const handleChatClick = () => {
      if (!isProUser || !appUser) return;
      setIsChatDrawerOpen(true);
      drawerIncludeButtonRef.current?.focus();
    };

    return (
      <div className="fixed inset-x-0 bottom-6 z-40 flex justify-center px-4">
        <div className="flex w-full max-w-2xl items-center gap-3 rounded-full bg-white/95 px-4 py-3 shadow-xl backdrop-blur-sm sm:px-6">
          {isProUser && appUser && (
            <button
              type="button"
              onClick={handleChatClick}
              className="flex flex-1 items-center justify-center gap-2 rounded-full border border-emerald-200 bg-white px-4 py-2 text-sm font-semibold text-emerald-700 shadow-sm hover:bg-white/90"
            >
              <SparklesIcon className="h-4 w-4" /> Mention '@' to edit via chat
            </button>
          )}
          <button
            onClick={handleGenerateClick}
            disabled={disabled}
            className={`flex flex-1 items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-semibold shadow-lg transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-300 focus:ring-offset-2 ${
              disabled ? 'bg-emerald-500/60 text-white/80 cursor-not-allowed' : 'bg-emerald-500 text-white hover:bg-emerald-400'
            }`}
          >
            {isGenerating ? 'Generating…' : (<><SparklesIcon className="h-5 w-5" />Generate creative</>)}
          </button>
        </div>
      </div>
    );
  };

  const renderHotspotDrawer = () => {
    if (!activeMark) return null;

    const markId = activeMark.id;
    const isText = activeMark.type === 'text';
    const isImage = activeMark.type === 'image';
    const isEnabled = !!enabledMarks[markId];
    const mode = imageModes[markId] || 'upload';
    const currentAsset = imageAssets[markId] || null;
    const currentPrompt = imagePrompts[markId] || '';
    const originalMark = originalMarksMap[markId];
    const originalText = originalMark?.text || '';
    const displayLabel = resolveHotspotDisplayLabel(activeMark);
    const labelPending = isHotspotLabelPending(activeMark);
    const includeReady = canEnableMark(markId);

    const handleClose = () => setActiveHotspotId(null);
    const handleLabelChange = (value: string) => {
        updateMarkLabel(markId, value);
        applyMarkEnabledFromContent(markId, { label: value });
    };
    const toggleInclude = () => {
        setEnabledMarks(prev => {
            const current = !!prev[markId];
            if (current) {
                return { ...prev, [markId]: false };
            }
            if (!canEnableMark(markId)) {
                return prev;
            }
            return { ...prev, [markId]: true };
        });
    };
    const handleReset = () => {
        if (isText) {
            const resetValue = originalText || '';
            setTextFields(prev => ({ ...prev, [markId]: resetValue }));
            applyMarkEnabledFromContent(markId, { text: resetValue });
        } else if (isImage) {
            setImageAssets(prev => {
                const next = { ...prev };
                delete next[markId];
                return next;
            });
            setImagePrompts(prev => ({ ...prev, [markId]: '' }));
            applyMarkEnabledFromContent(markId, { asset: null, prompt: '', mode });
        } else {
            applyMarkEnabledFromContent(markId, {});
        }
    };

    const handleModeChange = (nextMode: 'upload' | 'describe') => {
        const currentAssetForMark = imageAssets[markId] ?? null;
        const currentPromptForMark = imagePrompts[markId] ?? '';
        setImageModes(prev => ({ ...prev, [markId]: nextMode }));
        if (nextMode === 'describe') {
            setImageAssets(prev => {
                const next = { ...prev };
                delete next[markId];
                return next;
            });
            applyMarkEnabledFromContent(markId, { mode: nextMode, prompt: currentPromptForMark, asset: null });
        } else {
            drawerTextAreaRef.current = null;
            applyMarkEnabledFromContent(markId, { mode: nextMode, asset: currentAssetForMark });
        }
    };

    const handleAssetUpload = (asset: BrandAsset) => {
        setImageAssets(prev => ({ ...prev, [markId]: asset }));
        setImageModes(prev => ({ ...prev, [markId]: 'upload' }));
        applyMarkEnabledFromContent(markId, { asset, mode: 'upload' });
    };

    const handleAssetClear = () => {
        setImageAssets(prev => {
            const next = { ...prev };
            delete next[markId];
            return next;
        });
        applyMarkEnabledFromContent(markId, { asset: null });
    };

    return (
        <div className="fixed inset-0 z-50">
            <div className="absolute inset-0 bg-black/30" onClick={handleClose} aria-hidden="true"></div>
            <aside className="absolute inset-y-0 right-0 flex h-full w-full max-w-md flex-col bg-white shadow-2xl">
                <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
                    <div className="space-y-1">
                        <p className="text-xs font-semibold uppercase tracking-wide text-emerald-600">{isText ? 'Text hotspot' : 'Image hotspot'}</p>
                        <h3 className="text-2xl font-bold text-gray-900 font-display">{displayLabel}</h3>
                    </div>
                    <button onClick={handleClose} className="rounded-full p-2 text-gray-500 hover:bg-slate-100" aria-label="Close hotspot drawer">
                        <XIcon className="h-5 w-5" />
                    </button>
                </div>

                <div className="flex-1 space-y-6 overflow-y-auto px-5 py-6">
                    <div className="space-y-2">
                        <label className="text-sm font-semibold text-gray-800" htmlFor={`hotspot-label-${markId}`}>Hotspot name</label>
                        <input
                            id={`hotspot-label-${markId}`}
                            ref={drawerLabelInputRef}
                            value={activeMark.label ?? ''}
                            onChange={event => handleLabelChange(event.target.value)}
                            type="text"
                            placeholder={isText ? 'e.g. Headline' : 'e.g. Product photo'}
                            className={`w-full rounded-xl border px-4 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 ${labelPending ? 'border-amber-400 bg-amber-50/60' : 'border-slate-300 bg-white'}`}
                        />
                        <p className={`text-xs ${labelPending ? 'text-amber-600' : 'text-gray-500'}`}>{labelPending ? 'Give this hotspot a clear name so the AI knows what to edit.' : 'This name is used for @mentions and generation instructions.'}</p>
                    </div>

                    <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                        <div>
                            <p className="text-xs font-semibold uppercase text-gray-600">Include in next render</p>
                            <p className="text-xs text-gray-500">{isEnabled ? 'This hotspot will be considered when you generate.' : includeReady ? 'Temporarily ignore this hotspot.' : 'Name it and add content before including.'}</p>
                        </div>
                        <button
                            type="button"
                            ref={drawerIncludeButtonRef}
                            onClick={toggleInclude}
                            aria-pressed={isEnabled}
                            disabled={!includeReady && !isEnabled}
                            className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:ring-offset-2 ${isEnabled ? 'bg-emerald-100 text-emerald-700' : includeReady ? 'bg-slate-200 text-gray-600' : 'bg-slate-200/80 text-gray-400'}`}
                        >
                            {isEnabled ? 'Included' : 'Ignored'}
                        </button>
                    </div>

                    {isText && (
                        <div className="space-y-3">
                            <label className="text-sm font-semibold text-gray-800" htmlFor={`hotspot-text-${markId}`}>Replacement copy</label>
                            <textarea
                                id={`hotspot-text-${markId}`}
                                ref={drawerTextAreaRef}
                                value={textFields[markId] || ''}
                                onChange={e => {
                                    const nextValue = e.target.value;
                                    setTextFields(prev => ({ ...prev, [markId]: nextValue }));
                                    applyMarkEnabledFromContent(markId, { text: nextValue });
                                }}
                                rows={activeMark.label.toLowerCase().includes('body') ? 4 : 2}
                                placeholder="Enter the text you want to appear in this spot"
                                className="w-full rounded-xl border border-slate-300 py-3 px-4 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                            />
                            {originalText && (
                                <p className="text-xs text-gray-500">Template copy: “{originalText}”</p>
                            )}
                            <div className="flex items-center justify-between">
                                <button type="button" onClick={handleReset} className="text-xs font-semibold text-gray-500 hover:text-gray-700">
                                    Reset to template copy
                                </button>
                                <button type="button" onClick={handleClose} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500">
                                    Done
                                </button>
                            </div>
                        </div>
                    )}

                    {isImage && (
                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-2 rounded-xl border border-slate-200 bg-slate-50 p-2">
                                <button
                                    type="button"
                                    onClick={() => handleModeChange('upload')}
                                    className={`rounded-lg px-3 py-2 text-sm font-semibold ${mode === 'upload' ? 'bg-white text-emerald-700 shadow' : 'text-gray-600 hover:bg-white/80'}`}
                                >
                                    Upload image
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handleModeChange('describe')}
                                    className={`rounded-lg px-3 py-2 text-sm font-semibold ${mode === 'describe' ? 'bg-white text-emerald-700 shadow' : 'text-gray-600 hover:bg-white/80'}`}
                                >
                                    Describe image
                                </button>
                            </div>

                            {mode === 'upload' ? (
                                <FileUploader
                                    title={activeMark.label}
                                    onFileUpload={handleAssetUpload}
                                    asset={currentAsset}
                                    onClear={handleAssetClear}
                                />
                            ) : (
                                <div className="space-y-2">
                                    <textarea
                                        ref={drawerTextAreaRef as MutableRefObject<HTMLTextAreaElement | null>}
                                        value={currentPrompt}
                                        onChange={e => {
                                            const nextValue = e.target.value;
                                            setImagePrompts(prev => ({ ...prev, [markId]: nextValue }));
                                            applyMarkEnabledFromContent(markId, { prompt: nextValue, mode: 'describe' });
                                        }}
                                        rows={4}
                                        placeholder="Describe the image you want here (colors, subject, style, lighting, etc.)"
                                        className="w-full rounded-xl border border-slate-300 py-3 px-4 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                                    />
                                    <p className="text-xs text-gray-500">We’ll generate (or swap in) an image that matches this description.</p>
                                </div>
                            )}

                            <div className="flex items-center justify-between">
                                <button type="button" onClick={handleReset} className="text-xs font-semibold text-gray-500 hover:text-gray-700">
                                    Reset to template artwork
                                </button>
                                <button type="button" onClick={handleClose} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500">
                                    Done
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </aside>
        </div>
    );
  };

  const renderGenerationConfirm = () => {
    if (!isGenerationConfirmOpen || pendingExcludedMarks.length === 0) return null;

    const handleClose = () => {
        setIsGenerationConfirmOpen(false);
        setPendingExcludedMarks([]);
    };

    const handleIncludeAll = () => {
        setEnabledMarks(prev => {
            const next = { ...prev };
            pendingExcludedMarks.forEach(mark => {
                next[mark.id] = true;
            });
            return next;
        });
        setPendingExcludedMarks([]);
        setIsGenerationConfirmOpen(false);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6">
            <div className="absolute inset-0 bg-black/40" onClick={handleClose} aria-hidden="true"></div>
            <div className="relative w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl space-y-5">
                <div className="flex items-start gap-3">
                    <div className="rounded-full bg-amber-100 p-2 text-amber-600">
                        <SparklesIcon className="w-5 h-5" />
                    </div>
                    <div>
                        <h3 className="text-lg font-semibold text-gray-900">Generate without every hotspot?</h3>
                        <p className="mt-1 text-sm text-gray-600">You still have {pendingExcludedMarks.length} hotspot{pendingExcludedMarks.length > 1 ? 's' : ''} set to ignore. Include them now or continue with your current selection.</p>
                    </div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                    <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Ignored hotspots</p>
                    <ul className="mt-2 space-y-1 text-sm text-gray-700">
                        {pendingExcludedMarks.map(mark => (
                            <li key={mark.id} className="flex gap-2">
                                <span className="text-gray-400">-</span>
                                <span>{resolveHotspotDisplayLabel(mark)}</span>
                            </li>
                        ))}
                    </ul>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end sm:gap-3">
                    <button
                        type="button"
                        onClick={handleClose}
                        className="w-full sm:w-auto rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-slate-100"
                    >
                        Review hotspots
                    </button>
                    <button
                        type="button"
                        onClick={executeGeneration}
                        className="w-full sm:w-auto rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-400"
                    >
                        Generate anyway
                    </button>
                </div>
                <button
                    type="button"
                    onClick={handleIncludeAll}
                    className="w-full text-xs font-semibold text-emerald-600 hover:text-emerald-700"
                >
                    Include all hotspots instead
                </button>
            </div>
        </div>
    );
  };

  const renderChatDrawer = () => {
    if (!appUser || isDemoMode) return null;

    if (!isProUser) {
        return (
            <div className="fixed inset-x-0 bottom-24 z-30 flex justify-center px-4">
                <div className="flex w-full max-w-xl items-center gap-3 rounded-full bg-white/95 px-4 py-3 shadow-xl backdrop-blur-sm">
                    <SparklesIcon className="h-5 w-5 text-emerald-500" />
                    <div className="flex-1">
                        <p className="text-sm font-semibold text-gray-800">Upgrade to unlock chat edits</p>
                        <p className="text-xs text-gray-500">Pro lets you tweak designs with quick @hotspot prompts.</p>
                    </div>
                    <button onClick={onUpgrade} className="rounded-full bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-600">
                        Upgrade
                    </button>
                </div>
            </div>
        );
    }

    if (!isChatDrawerOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-end justify-center px-4 pb-32">
            <div className="absolute inset-0 bg-black/30" onClick={() => setIsChatDrawerOpen(false)} aria-hidden="true"></div>
            <div className="relative w-full max-w-2xl rounded-3xl bg-white shadow-2xl backdrop-blur-sm">
                <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
                    <div>
                        <p className="text-sm font-semibold text-emerald-700">Chat edits</p>
                        <p className="text-xs text-gray-500">Mention hotspots like <span className="font-mono text-emerald-600">@Headline</span> for targeted tweaks.</p>
                    </div>
                    <button onClick={() => setIsChatDrawerOpen(false)} className="rounded-full p-2 text-gray-500 hover:bg-slate-100" aria-label="Close chat edits">
                        <XIcon className="h-4 w-4" />
                    </button>
                </div>
                <div className="max-h-[50vh] overflow-y-auto px-5 py-4 space-y-3">
                    {chatMessages.map(msg => (
                        <div key={msg.id} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : ''}`}>
                            {msg.role === 'assistant' && <div className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-100"><SparklesIcon className="h-4 w-4 text-emerald-500" /></div>}
                            <div className={`max-w-[60%] rounded-2xl px-3 py-2 text-sm ${msg.role === 'user' ? 'bg-emerald-500 text-white rounded-br-xl' : msg.type === 'error' ? 'bg-red-100 text-red-800 rounded-bl-xl' : 'bg-slate-100 text-gray-800 rounded-bl-xl'}`}>
                                {msg.text && <p>{msg.text}</p>}
                                {msg.referenceImagePreviewUrl && <img src={msg.referenceImagePreviewUrl} alt="Reference" className="mt-2 rounded-lg" />}
                                {msg.generatedImageUrl && <img src={msg.generatedImageUrl} alt="Generated" className="mt-2 rounded-lg" />}
                            </div>
                        </div>
                    ))}
                    {isGenerating && (
                        <div className="flex gap-3 text-sm text-gray-500">
                            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-100"><SparklesIcon className="h-4 w-4 text-emerald-500 animate-spin" /></div>
                            <div className="flex items-center gap-1">
                                <span className="h-2 w-2 animate-pulse rounded-full bg-gray-400" style={{ animationDelay: '0s' }}></span>
                                <span className="h-2 w-2 animate-pulse rounded-full bg-gray-400" style={{ animationDelay: '0.15s' }}></span>
                                <span className="h-2 w-2 animate-pulse rounded-full bg-gray-400" style={{ animationDelay: '0.3s' }}></span>
                            </div>
                        </div>
                    )}
                    <div ref={messagesEndRef} />
                </div>
                <div className="border-t border-slate-200 px-5 py-4">
                    <form onSubmit={handleChatEdit} className="space-y-2">
                        {chatAttachment && (
                            <div className="relative flex items-center gap-2 rounded-md bg-slate-100 p-2 text-xs">
                                <img src={chatAttachment.previewUrl} alt="Attachment preview" className="h-8 w-8 rounded object-cover" />
                                <p className="flex-1 truncate text-gray-600">{chatAttachment.file.name}</p>
                                <button type="button" onClick={() => setChatAttachment(null)} className="rounded-full p-1 text-gray-500 hover:bg-slate-200" aria-label="Remove attachment">
                                    <XIcon className="h-3.5 w-3.5" />
                                </button>
                            </div>
                        )}
                        <div className="relative">
                            <textarea
                                ref={chatTextAreaRef}
                                value={chatPrompt}
                                onChange={e => handleChatPromptChange(e.target.value, e.target)}
                                onKeyDown={e => {
                                    if (e.key === 'Escape' && mentionSuggestions.length > 0) {
                                        e.preventDefault();
                                        closeMentionSuggestions();
                                        return;
                                    }
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        handleChatEdit(e);
                                    }
                                }}
                                placeholder={isGenerating ? 'Processing…' : 'Describe your tweak. Try @Headline to target a region.'}
                                className="w-full rounded-xl border border-slate-300 py-3 pl-10 pr-12 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                                rows={2}
                                disabled={isGenerating}
                                onBlur={() => closeMentionSuggestions()}
                            />
                            <button type="button" onClick={() => fileInputRef.current?.click()} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-emerald-600 disabled:text-gray-300" disabled={isGenerating}>
                                <PaperclipIcon className="h-5 w-5" />
                            </button>
                            <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept="image/*" />
                            <button type="submit" className="absolute right-3 top-1/2 -translate-y-1/2 text-emerald-600 hover:text-emerald-700 disabled:text-gray-400" disabled={!chatPrompt.trim() || isGenerating}>
                                <SendIcon className="h-5 w-5" />
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
  };

  const handleChatPromptChange = (value: string, target: HTMLTextAreaElement) => {
    setChatPrompt(value);

    const cursor = target.selectionStart || 0;
    const textBeforeCursor = value.slice(0, cursor);
    const lastAt = textBeforeCursor.lastIndexOf('@');

    if (lastAt >= 0 && (lastAt === 0 || /[^\w]/.test(textBeforeCursor.charAt(lastAt - 1)))) {
        const query = textBeforeCursor.slice(lastAt + 1);
        if (!/\s/.test(query)) {
            const filtered = mentionTokens.filter(token => token.isIncluded && token.id.toLowerCase().startsWith(query.toLowerCase()));
            setMentionSuggestions(filtered);
            setMentionQuery(query);
            mentionTrackingRef.current = { start: lastAt, end: cursor };

            const rect = target.getBoundingClientRect();
            const top = rect.top + window.scrollY + Math.min(rect.height, target.offsetHeight) + 8;
            const left = rect.left + window.scrollX + 16;
            setMentionAnchor({ x: left, y: top });
            return;
        }
    }

    closeMentionSuggestions();
  };

  const insertMention = (token: { id: string; label: string }) => {
    const selection = mentionTrackingRef.current;
    if (!selection) return;
    const textarea = chatTextAreaRef.current;
    const mentionText = `@${token.id}`;
    setChatPrompt(prev => prev.slice(0, selection.start) + mentionText + prev.slice(selection.end));
    closeMentionSuggestions();
    if (textarea) {
        const nextCursor = selection.start + mentionText.length;
        requestAnimationFrame(() => {
            textarea.focus();
            textarea.setSelectionRange(nextCursor, nextCursor);
        });
    }
  };

  const validateMentions = (message: string): { valid: string[]; invalid: string[] } => {
    const mentionRegex = /@([A-Za-z0-9_-]+)/g;
    const valid: string[] = [];
    const invalid: string[] = [];
    let match: RegExpExecArray | null;
    while ((match = mentionRegex.exec(message)) !== null) {
        const token = mentionTokens.find(t => t.id === match![1]);
        if (token && token.isIncluded) {
            valid.push(token.id);
        } else {
            invalid.push(match![1]);
        }
    }
    return { valid, invalid };
  };

  const [invalidMentions, setInvalidMentions] = useState<string[]>([]);

  useEffect(() => {
    if (!isChatDrawerOpen) {
        closeMentionSuggestions();
    }
  }, [isChatDrawerOpen]);

  useEffect(() => {
    if (invalidMentions.length > 0) {
        const timeout = setTimeout(() => setInvalidMentions([]), 3000);
        return () => clearTimeout(timeout);
    }
  }, [invalidMentions]);

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="container mx-auto px-4 lg:px-8 py-6">
        <button onClick={onBack} className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 font-medium mb-6">
          <ArrowLeftIcon className="w-4 h-4" />
          Back to Dashboard
        </button>

        <div className="mx-auto w-full max-w-6xl space-y-8 pb-24">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3 group/editor" onDoubleClick={() => setIsEditingName(true)}>
              <SparklesIcon className="w-6 h-6 text-emerald-600" />
              {isEditingName ? (
                <input
                  ref={nameInputRef}
                  type="text"
                  value={projectName}
                  onChange={e => setProjectName(e.target.value)}
                  onBlur={handleProjectNameBlur}
                  onKeyDown={e => e.key === 'Enter' && handleProjectNameBlur()}
                  className="-ml-1 rounded-md bg-slate-100 px-1 text-xl font-bold text-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              ) : (
                <h2 className="text-xl font-bold text-gray-800 font-display">{projectName}</h2>
              )}
              <button onClick={() => setIsEditingName(true)} className="opacity-0 transition-opacity group-hover/editor:opacity-100">
                <EditIcon className="h-4 w-4 text-gray-400" />
              </button>
            </div>
            <div className="text-xs text-gray-500">
              {marks.length} hotspot{marks.length === 1 ? '' : 's'} detected · {includedMarks.length} included · {missingIncludedMarksCount} need input
            </div>
          </div>

          <div className="grid gap-8 lg:grid-cols-[220px_minmax(0,1fr)_240px]">
            <aside className="space-y-4">
              <p className="text-sm font-semibold uppercase tracking-wide text-gray-600">Versions</p>
              <VersionHistory history={history} activeIndex={activeIndex} onSelect={setActiveIndex} />
            </aside>

            <div
              ref={imagePreviewRef}
              onMouseDown={handleCanvasMouseDown}
              onMouseMove={handleCanvasMouseMove}
              onMouseUp={handleCanvasMouseUp}
              onMouseLeave={() => {
                if (isDrawingMark) {
                  cancelDraftMark();
                }
              }}
              className={`group relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6 ${isPlacingMark ? 'cursor-crosshair' : ''}`}
            >
              <img
                ref={imageElementRef}
                src={activeImageUrl}
                alt="Creative Preview"
                className="mx-auto h-auto max-h-[70vh] w-full max-w-4xl object-contain"
                onLoad={updateImageBounds}
              />
              <div className="absolute right-4 top-4 rounded-full bg-black/50 px-2 py-1 text-xs text-white">
                {activeIndex === 0 ? 'Template' : `Version ${activeIndex}`}
              </div>
              {history.length > 1 && (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-2xl bg-black/60 opacity-0 transition-opacity group-hover:opacity-100">
                  <button
                    onClick={handleDownload}
                    className="pointer-events-auto flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-black"
                  >
                    <DownloadIcon className="h-4 w-4" /> Download
                  </button>
                </div>
              )}
              {imageBounds.width > 0 && imageBounds.height > 0 && (
                <div
                  className="absolute pointer-events-none"
                  style={{
                    left: imageBounds.left,
                    top: imageBounds.top,
                    width: imageBounds.width,
                    height: imageBounds.height,
                  }}
                >
                  {(showHotspotOverlay || isPlacingMark) && marks.map(mark => {
                    const left = ((mark.x - (mark.width ?? 0) / 2)) * 100;
                    const top = ((mark.y - (mark.height ?? 0) / 2)) * 100;
                    const width = (mark.width ?? 0) * 100;
                    const height = (mark.height ?? 0) * 100;
                    const textContent = mark.type === 'text'
                      ? (textFields[mark.id] ?? mark.text ?? '')
                      : '';
                    const hasTextContent = mark.type === 'text' && textContent.trim().length > 0;
                    const imagePreviewUrl = mark.type === 'image'
                      ? (imageAssets[mark.id]?.previewUrl ?? '')
                      : '';
                    const hasImageContent = mark.type === 'image' && imagePreviewUrl.trim().length > 0;
                    const displayLabel = resolveHotspotDisplayLabel(mark);
                    return (
                      <CreativeElement
                        key={mark.id}
                        data-hotspot-button="true"
                        ref={el => {
                          canvasHotspotRefs.current[mark.id] = el;
                        }}
                        type="button"
                        aria-label={`Edit hotspot ${displayLabel}`}
                        style={{ left: `${left}%`, top: `${top}%`, width: `${width}%`, height: `${height}%` }}
                        onClick={() => {
                          lastFocusedHotspotIdRef.current = mark.id;
                          setActiveHotspotId(mark.id);
                        }}
                        onMouseEnter={() => setHoveredMarkId(mark.id)}
                        onMouseLeave={() => setHoveredMarkId(null)}
                        label={displayLabel}
                        elementType={mark.type}
                        textContent={hasTextContent ? textContent : undefined}
                        imageSrc={hasImageContent ? imagePreviewUrl : undefined}
                        isActive={activeHotspotId === mark.id}
                        isHovered={hoveredMarkId === mark.id}
                      />
                    );
                  })}
                  {draftMark && (
                    <div
                      className="pointer-events-none absolute rounded-sm border-2 border-dashed border-emerald-400/80 bg-emerald-400/10"
                      style={{
                        left: `${((draftMark.x - (draftMark.width ?? 0) / 2)) * 100}%`,
                        top: `${((draftMark.y - (draftMark.height ?? 0) / 2)) * 100}%`,
                        width: `${(draftMark.width ?? 0) * 100}%`,
                        height: `${(draftMark.height ?? 0) * 100}%`,
                      }}
                    />
                  )}
                </div>
              )}
              {isPlacingMark && (
                <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-black/50 p-4 text-center text-white">
                  Click and drag on the template to outline the new {isPlacingMark} hotspot.
                </div>
              )}
            </div>

            <aside className="flex flex-col gap-4">
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-gray-800">Hotspot tools</p>
                  <button
                    type="button"
                    onClick={() => setShowHotspotOverlay(prev => !prev)}
                    className="text-xs font-semibold text-emerald-600 hover:text-emerald-700"
                  >
                    {showHotspotOverlay ? 'Hide overlays' : 'Show overlays'}
                  </button>
                </div>
                <p className="mt-1 text-xs text-gray-500">Add new regions while viewing the base template. Toggle overlays to inspect hotspots on any version.</p>
                <div className="mt-3 flex flex-col gap-2">
                  <button
                    onClick={() => setIsPlacingMark('text')}
                    className={`w-full rounded-lg border px-3 py-2 text-sm font-semibold transition-colors ${
                      isPlacingMark === 'text' ? 'border-emerald-500 bg-emerald-500 text-white shadow-sm' : 'border-slate-200 bg-white text-gray-700 hover:bg-slate-100'
                    }`}
                  >
                    Add text hotspot
                  </button>
                  <button
                    onClick={() => setIsPlacingMark('image')}
                    className={`w-full rounded-lg border px-3 py-2 text-sm font-semibold transition-colors ${
                      isPlacingMark === 'image' ? 'border-emerald-500 bg-emerald-500 text-white shadow-sm' : 'border-slate-200 bg-white text-gray-700 hover:bg-slate-100'
                    }`}
                  >
                    Add image hotspot
                  </button>
                  {isPlacingMark && (
                    <button onClick={() => setIsPlacingMark(null)} className="text-sm font-medium text-gray-500 hover:text-gray-700">
                      Cancel placement
                    </button>
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-sm font-semibold text-gray-800">Hotspot status</p>
                <div className="mt-3 space-y-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-600">Needs input</p>
                    {missingIncludedMarks.length > 0 ? (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {missingIncludedMarks.map(mark => (
                          <button
                            key={mark.id}
                            type="button"
                            onClick={() => {
                              setShowHotspotOverlay(true);
                              lastFocusedHotspotIdRef.current = mark.id;
                              setActiveHotspotId(mark.id);
                            }}
                            className="rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700 hover:bg-amber-100 focus:outline-none focus:ring-2 focus:ring-amber-300"
                          >
                            {resolveHotspotDisplayLabel(mark)}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-2 text-xs text-gray-500">All included hotspots are ready.</p>
                    )}
                  </div>
                  {ignoredMarks.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-gray-600">Ignored</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {ignoredMarks.map(mark => (
                          <button
                            key={mark.id}
                            type="button"
                            onClick={() => {
                              setShowHotspotOverlay(true);
                              lastFocusedHotspotIdRef.current = mark.id;
                              setActiveHotspotId(mark.id);
                            }}
                            className="rounded-full border border-slate-300 bg-slate-100 px-3 py-1 text-xs font-semibold text-gray-600 hover:bg-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-300"
                          >
                            {resolveHotspotDisplayLabel(mark)}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="grid gap-4">
                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <p className="text-sm font-semibold text-gray-800">Aspect ratio</p>
                  <p className="mt-1 text-xs text-gray-500">Pick the format for your next render.</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {['original', '1:1', '16:9', '9:16'].map(option => (
                      <button
                        key={option}
                        type="button"
                        onClick={() => setAspectRatio(option)}
                        className={`min-w-[80px] rounded-lg px-4 py-2 text-sm font-semibold transition-colors whitespace-nowrap text-center ${
                          aspectRatio === option ? 'border border-emerald-500 bg-emerald-100 text-emerald-700 shadow-sm' : 'border border-slate-200 bg-slate-50 text-gray-600 hover:bg-white'
                        }`}
                      >
                        {option === 'original' ? 'Original' : option}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-gray-800">Brand palette</p>
                    <button
                      type="button"
                      onClick={() => setIsSettingsOpen(true)}
                      className="text-xs font-semibold text-emerald-600 hover:text-emerald-700"
                    >
                      Adjust
                    </button>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {brandColors.length > 0 ? (
                      brandColors.map(color => (
                        <span
                          key={color}
                          className="h-7 w-7 rounded-full border border-white shadow-sm"
                          style={{ backgroundColor: color }}
                          title={color}
                        />
                      ))
                    ) : (
                      <p className="text-xs text-gray-500 leading-relaxed">Stick with the template colors or tap Adjust to choose your brand palette.</p>
                    )}
                  </div>
                  {isSettingsOpen && (
                    <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4 shadow-lg">
                      <ColorPaletteSelector
                        selectedPalette={brandColors}
                        onPaletteChange={palette => {
                          setBrandColors(palette);
                          setIsSettingsOpen(false);
                        }}
                        userBrandColors={appUser?.brandColors}
                      />
                    </div>
                  )}
                </div>
              </div>
            </aside>
          </div>
        </div>
      </div>
      {renderFloatingActions()}
      {renderChatDrawer()}
      {mentionSuggestions.length > 0 && mentionAnchor && (
        <div className="fixed z-50" style={{ top: mentionAnchor.y, left: mentionAnchor.x }}>
            <div className="bg-white border border-slate-200 rounded-lg shadow-lg w-48">
                {mentionSuggestions.map(token => (
                    <button
                        key={token.id}
                        onClick={() => insertMention(token)}
                        className="w-full text-left px-3 py-2 hover:bg-emerald-50 flex flex-col"
                    >
                        <span className="text-sm font-semibold text-gray-800">@{token.id}</span>
                        <span className="text-xs text-gray-500">{token.label}</span>
                    </button>
                ))}
            </div>
        </div>
      )}
      {invalidMentions.length > 0 && (
        <div className="fixed bottom-24 right-4 z-50 bg-red-600 text-white text-sm px-4 py-2 rounded-full shadow-lg">
            Unknown hotspots: {invalidMentions.join(', ')}
        </div>
      )}
      {renderGenerationConfirm()}
      {renderHotspotDrawer()}
    </div>
  );
};


const FileUploader = ({ onFileUpload, title, asset, onClear }: { onFileUpload: (asset: BrandAsset) => void; title: string; asset: BrandAsset | null; onClear?: () => void; }) => {
  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      const file = event.target.files[0];
      const base64 = await fileToBase64(file);
      onFileUpload({
        file,
        previewUrl: `data:${file.type};base64,${base64}`,
        base64,
      });
    }
  };

  return (
    <div className="w-full mt-2">
      <div className={`flex justify-center px-6 pt-5 pb-6 border-2 border-slate-300 border-dashed rounded-md ${asset ? 'bg-slate-50' : ''}`}>
        {asset ? (
          <div className="text-center space-y-3">
            <img src={asset.previewUrl} alt="preview" className="mx-auto h-16 w-auto object-contain" />
            <p className="text-xs text-gray-500 mt-2 truncate max-w-[150px]">{asset.file.name}</p>
            <div className="flex justify-center items-center gap-4">
                <label htmlFor={`${title}-file-upload`} className="cursor-pointer text-emerald-600 hover:text-emerald-500 font-medium text-sm">
                  Replace
                </label>
                {onClear && (
                    <button type="button" onClick={onClear} className="text-sm font-medium text-gray-500 hover:text-red-500">
                        Remove
                    </button>
                )}
                <input id={`${title}-file-upload`} type="file" className="sr-only" onChange={handleFileChange} />
            </div>
          </div>
        ) : (
          <div className="space-y-1 text-center">
            <UploadCloudIcon className="mx-auto h-10 w-10 text-gray-400" />
            <div className="flex text-sm text-gray-600">
              <label htmlFor={`${title}-file-upload`} className="relative cursor-pointer bg-white rounded-md font-medium text-emerald-600 hover:text-emerald-500 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-emerald-500">
                <span>Upload a file</span>
                <input id={`${title}-file-upload`} type="file" className="sr-only" onChange={handleFileChange} />
              </label>
            </div>
            <p className="text-xs text-gray-500">PNG, JPG</p>
          </div>
        )}
      </div>
    </div>
  );
};
